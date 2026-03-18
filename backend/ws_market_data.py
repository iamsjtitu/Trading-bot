"""
Real-time Market Data Manager using Upstox WebSocket.
- Connects to Upstox WebSocket for live market data streaming
- Caches latest data in memory
- Relays to connected frontend clients via FastAPI WebSocket
- Falls back to REST polling if WebSocket unavailable
"""
import asyncio
import json
import logging
from typing import Dict, Set, Optional
from datetime import datetime, timezone
import websockets

logger = logging.getLogger(__name__)

# Upstox WebSocket authorize endpoint
UPSTOX_WS_AUTH_URL = "https://api.upstox.com/v2/feed/market-data-feed/authorize"

# Index instrument keys for subscription (MCX resolved dynamically on start)
INDEX_INSTRUMENT_KEYS = [
    'NSE_INDEX|Nifty 50',
    'BSE_INDEX|SENSEX',
    'NSE_INDEX|Nifty Bank',
    'NSE_INDEX|Nifty Fin Service',
]

INDEX_KEY_MAP = {
    'NSE_INDEX|Nifty 50': 'nifty50',
    'BSE_INDEX|SENSEX': 'sensex',
    'NSE_INDEX|Nifty Bank': 'banknifty',
    'NSE_INDEX|Nifty Fin Service': 'finnifty',
}


class MarketDataManager:
    def __init__(self):
        self.latest_data: Dict = {}
        self.clients: Set = set()
        self._ws_task: Optional[asyncio.Task] = None
        self._connected = False
        self._upstox_ws = None
        self._access_token: Optional[str] = None
        self._running = False
        self._last_update = None
        self._reconnect_delay = 5

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def start(self, access_token: str):
        """Start the WebSocket connection to Upstox"""
        if self._running and self._access_token == access_token:
            return
        self._access_token = access_token
        self._running = True

        # Resolve MCX instrument keys and add to subscription
        try:
            from mcx_resolver import get_mcx_instrument_keys
            mcx_keys = await get_mcx_instrument_keys()
            for commodity, inst_key in mcx_keys.items():
                if inst_key not in INDEX_INSTRUMENT_KEYS:
                    INDEX_INSTRUMENT_KEYS.append(inst_key)
                    INDEX_KEY_MAP[inst_key] = commodity
            logger.info(f"WebSocket instruments: {len(INDEX_INSTRUMENT_KEYS)} (MCX: {list(mcx_keys.keys())})")
        except Exception as e:
            logger.warning(f"MCX resolution for WS failed: {e}")

        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()
        self._ws_task = asyncio.create_task(self._connect_loop())
        logger.info("MarketDataManager started")

    async def stop(self):
        """Stop the WebSocket connection"""
        self._running = False
        if self._upstox_ws:
            await self._upstox_ws.close()
        if self._ws_task:
            self._ws_task.cancel()
        self._connected = False
        logger.info("MarketDataManager stopped")

    async def _get_ws_url(self) -> Optional[str]:
        """Get authorized WebSocket URL from Upstox"""
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    UPSTOX_WS_AUTH_URL,
                    headers={
                        'Accept': 'application/json',
                        'Authorization': f'Bearer {self._access_token}',
                        'Api-Version': '2.0',
                    },
                    timeout=10,
                )
                data = resp.json()
                if data.get('status') == 'success':
                    return data['data']['authorizedRedirectUri']
                logger.error(f"WS auth failed: {data.get('message', 'unknown')}")
                return None
        except Exception as e:
            logger.error(f"WS auth error: {e}")
            return None

    async def _connect_loop(self):
        """Connection loop with auto-reconnect"""
        while self._running:
            try:
                ws_url = await self._get_ws_url()
                if not ws_url:
                    logger.warning("No WS URL, retrying in 30s...")
                    await asyncio.sleep(30)
                    continue

                async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                    self._upstox_ws = ws
                    self._connected = True
                    self._reconnect_delay = 5
                    logger.info("Connected to Upstox WebSocket")

                    # Subscribe to index instruments
                    subscribe_msg = {
                        "guid": "marketdata",
                        "method": "sub",
                        "data": {
                            "mode": "full",
                            "instrumentKeys": INDEX_INSTRUMENT_KEYS,
                        }
                    }
                    await ws.send(json.dumps(subscribe_msg))
                    logger.info(f"Subscribed to {len(INDEX_INSTRUMENT_KEYS)} instruments")

                    # Broadcast connection status
                    await self._broadcast({"type": "status", "connected": True})

                    async for message in ws:
                        try:
                            await self._process_message(message)
                        except Exception as e:
                            logger.error(f"Message processing error: {e}")

            except websockets.ConnectionClosed as e:
                logger.warning(f"Upstox WS closed: {e}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Upstox WS error: {e}")

            self._connected = False
            await self._broadcast({"type": "status", "connected": False})

            if self._running:
                logger.info(f"Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 1.5, 60)

    async def _process_message(self, raw_message):
        """Process incoming WebSocket message from Upstox"""
        try:
            # Upstox sends binary protobuf or JSON depending on connection
            if isinstance(raw_message, bytes):
                data = self._decode_protobuf(raw_message)
            else:
                data = json.loads(raw_message)

            if not data:
                return

            # Extract market data from feeds
            feeds = data.get('feeds', {})
            updated = False

            for instrument_key, feed_data in feeds.items():
                short_key = INDEX_KEY_MAP.get(instrument_key)
                if not short_key:
                    continue

                ff = feed_data.get('ff', {}).get('indexFF', feed_data.get('ff', {}).get('marketFF', {}))
                ltpc = ff.get('ltpc', {})
                ltp = ltpc.get('ltp', 0)
                close = ltpc.get('cp', 0)

                if ltp > 0:
                    change = ltp - close if close > 0 else 0
                    change_pct = (change / close * 100) if close > 0 else 0
                    self.latest_data[short_key] = {
                        'value': round(ltp, 2),
                        'change': round(change, 2),
                        'changePct': round(change_pct, 2),
                    }
                    updated = True

            if updated:
                self._last_update = datetime.now(timezone.utc).isoformat()
                await self._broadcast({
                    "type": "market_data",
                    "data": self.latest_data,
                    "timestamp": self._last_update,
                    "source": "websocket",
                })

        except Exception as e:
            logger.error(f"Process message error: {e}")

    def _decode_protobuf(self, raw: bytes) -> Optional[Dict]:
        """Decode protobuf message from Upstox WebSocket"""
        try:
            from google.protobuf.json_format import MessageToDict
            import upstox_client
            # Try using SDK's built-in decoder
            from upstox_client.feeder import MarketDataFeed_pb2
            feed_response = MarketDataFeed_pb2.FeedResponse()
            feed_response.ParseFromString(raw)
            return MessageToDict(feed_response)
        except ImportError:
            # Fallback: try simple JSON decode (some Upstox streams send JSON)
            try:
                return json.loads(raw.decode('utf-8'))
            except Exception:
                logger.debug("Could not decode protobuf message")
                return None
        except Exception as e:
            logger.debug(f"Protobuf decode error: {e}")
            return None

    async def add_client(self, websocket):
        """Add a frontend WebSocket client"""
        self.clients.add(websocket)
        # Send current cached data immediately
        if self.latest_data:
            try:
                await websocket.send_json({
                    "type": "market_data",
                    "data": self.latest_data,
                    "timestamp": self._last_update,
                    "source": "cache",
                })
            except Exception:
                pass
        # Send connection status
        await websocket.send_json({
            "type": "status",
            "connected": self._connected,
            "ws_active": self._running,
        })

    async def remove_client(self, websocket):
        """Remove a frontend WebSocket client"""
        self.clients.discard(websocket)

    async def _broadcast(self, data: Dict):
        """Broadcast data to all connected frontend clients"""
        dead = set()
        for client in self.clients:
            try:
                await client.send_json(data)
            except Exception:
                dead.add(client)
        self.clients -= dead

    def get_status(self) -> Dict:
        """Get current WebSocket status"""
        return {
            "ws_connected": self._connected,
            "ws_running": self._running,
            "clients_count": len(self.clients),
            "last_update": self._last_update,
            "cached_instruments": list(self.latest_data.keys()),
        }


# Singleton instance
market_data_manager = MarketDataManager()
