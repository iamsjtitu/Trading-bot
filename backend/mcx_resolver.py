"""
MCX Instrument Resolver for Upstox API
Downloads Upstox instrument file and finds near-month futures for MCX commodities.
"""
import httpx
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

logger = logging.getLogger(__name__)

MCX_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/MCX.csv.gz"
MCX_INSTRUMENTS_JSON_URL = "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz"

# Commodities we want to track
TARGET_COMMODITIES = ['CRUDEOIL', 'GOLD', 'SILVER']

# Cache
_mcx_cache: Dict[str, str] = {}
_cache_timestamp: Optional[datetime] = None
CACHE_DURATION = timedelta(hours=6)


async def _download_mcx_instruments() -> list:
    """Download MCX instrument list from Upstox"""
    instruments = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Try JSON first
            resp = await client.get(MCX_INSTRUMENTS_JSON_URL)
            if resp.status_code == 200:
                import gzip
                import json
                data = gzip.decompress(resp.content)
                instruments = json.loads(data)
                logger.info(f"Downloaded {len(instruments)} MCX instruments (JSON)")
                return instruments
    except Exception as e:
        logger.warning(f"MCX JSON download failed: {e}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fallback to CSV
            resp = await client.get(MCX_INSTRUMENTS_URL)
            if resp.status_code == 200:
                import gzip
                data = gzip.decompress(resp.content)
                reader = csv.DictReader(io.StringIO(data.decode('utf-8')))
                instruments = list(reader)
                logger.info(f"Downloaded {len(instruments)} MCX instruments (CSV)")
                return instruments
    except Exception as e:
        logger.warning(f"MCX CSV download failed: {e}")

    return instruments


def _find_nearest_future(instruments: list, underlying: str) -> Optional[Dict]:
    """Find the near-month futures contract for a commodity"""
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    futures = []

    for inst in instruments:
        inst_type = inst.get('instrument_type', '')
        symbol = inst.get('underlying_symbol', '') or inst.get('asset_symbol', '')

        if inst_type != 'FUT':
            continue
        if symbol.upper() != underlying.upper():
            continue

        # Parse expiry - could be milliseconds timestamp or date string
        expiry_raw = inst.get('expiry', '')
        expiry_ms = None
        if isinstance(expiry_raw, (int, float)):
            expiry_ms = int(expiry_raw)
        elif isinstance(expiry_raw, str):
            try:
                expiry_ms = int(expiry_raw)
            except ValueError:
                for fmt in ['%Y-%m-%d', '%d-%b-%Y']:
                    try:
                        expiry_ms = int(datetime.strptime(expiry_raw[:10], fmt).replace(tzinfo=timezone.utc).timestamp() * 1000)
                        break
                    except (ValueError, TypeError):
                        continue

        if expiry_ms and expiry_ms > now_ms:
            key = inst.get('instrument_key', '')
            trading_symbol = inst.get('trading_symbol', '')
            lot_size = inst.get('lot_size', 1)
            futures.append({
                'instrument_key': key,
                'trading_symbol': trading_symbol,
                'expiry_ms': expiry_ms,
                'lot_size': lot_size,
                'underlying': underlying,
            })

    if not futures:
        return None

    futures.sort(key=lambda x: x['expiry_ms'])
    return futures[0]


async def get_mcx_instrument_keys() -> Dict[str, str]:
    """
    Get instrument keys for near-month MCX commodity futures.
    Returns: {'crudeoil': 'MCX_FUT|...', 'gold': 'MCX_FUT|...', 'silver': 'MCX_FUT|...'}
    """
    global _mcx_cache, _cache_timestamp

    # Check cache
    if _cache_timestamp and (datetime.now(timezone.utc) - _cache_timestamp) < CACHE_DURATION and _mcx_cache:
        return _mcx_cache

    instruments = await _download_mcx_instruments()
    if not instruments:
        logger.warning("No MCX instruments downloaded, using cache or empty")
        return _mcx_cache or {}

    result = {}
    for commodity in TARGET_COMMODITIES:
        fut = _find_nearest_future(instruments, commodity)
        if fut and fut['instrument_key']:
            result[commodity.lower()] = fut['instrument_key']
            expiry_str = datetime.fromtimestamp(fut['expiry_ms'] / 1000, tz=timezone.utc).strftime('%d %b %Y')
            logger.info(f"MCX {commodity}: {fut['instrument_key']} ({fut['trading_symbol']}, expiry: {expiry_str})")
        else:
            logger.warning(f"MCX {commodity}: No near-month future found")

    if result:
        _mcx_cache = result
        _cache_timestamp = datetime.now(timezone.utc)

    return result


async def get_mcx_display_info() -> Dict:
    """Get MCX instrument info for display"""
    keys = await get_mcx_instrument_keys()
    return {
        'available': bool(keys),
        'instruments': keys,
        'count': len(keys),
    }
