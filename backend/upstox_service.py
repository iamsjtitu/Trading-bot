import os
import requests
import logging
from typing import Dict, Optional
from datetime import datetime, timezone
import urllib.parse

logger = logging.getLogger(__name__)

# Upstox API base
UPSTOX_AUTH_URL = "https://api.upstox.com/v2/login/authorization/dialog"
UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"
UPSTOX_API_BASE = "https://api.upstox.com/v2"

# Index instrument keys
INDEX_KEYS = {
    'nifty50': 'NSE_INDEX|Nifty 50',
    'sensex': 'BSE_INDEX|SENSEX',
    'banknifty': 'NSE_INDEX|Nifty Bank',
    'finnifty': 'NSE_INDEX|Nifty Fin Service',
}


class UpstoxService:
    def __init__(self, db):
        self.db = db

    async def _get_broker_settings(self) -> Dict:
        settings = await self.db.bot_settings.find_one({'type': 'main'}, {'_id': 0})
        if settings and 'broker' in settings:
            return settings['broker']
        return {}

    async def _get_access_token(self) -> Optional[str]:
        broker = await self._get_broker_settings()
        return broker.get('access_token', '') or None

    def _api_headers(self, token: str) -> Dict:
        return {
            'Accept': 'application/json',
            'Authorization': f'Bearer {token}',
            'Api-Version': '2.0'
        }

    # ==================== OAuth Flow ====================

    async def get_auth_url(self) -> Dict:
        """Generate Upstox OAuth login URL"""
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        redirect_uri = broker.get('redirect_uri', '')

        if not api_key or not redirect_uri:
            return {'status': 'error', 'message': 'API Key and Redirect URI required. Go to Settings > Broker.'}

        params = {
            'response_type': 'code',
            'client_id': api_key,
            'redirect_uri': redirect_uri,
        }
        auth_url = f"{UPSTOX_AUTH_URL}?{urllib.parse.urlencode(params)}"
        return {'status': 'success', 'auth_url': auth_url}

    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        """Exchange authorization code for access token"""
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        api_secret = broker.get('api_secret', '')
        redirect_uri = broker.get('redirect_uri', '')

        if not all([api_key, api_secret, redirect_uri]):
            return {'status': 'error', 'message': 'Broker credentials incomplete'}

        data = {
            'code': auth_code,
            'client_id': api_key,
            'client_secret': api_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code'
        }
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Api-Version': '2.0'
        }

        try:
            resp = requests.post(UPSTOX_TOKEN_URL, headers=headers, data=data, timeout=15)
            result = resp.json()

            if resp.status_code == 200 and 'access_token' in result:
                token = result['access_token']
                await self.db.bot_settings.update_one(
                    {'type': 'main'},
                    {'$set': {
                        'broker.access_token': token,
                        'broker.token_timestamp': datetime.now(timezone.utc).isoformat()
                    }}
                )
                return {'status': 'success', 'message': 'Login successful! Access token saved.'}
            else:
                msg = result.get('message', result.get('error', 'Unknown error'))
                return {'status': 'error', 'message': f'Token exchange failed: {msg}'}
        except Exception as e:
            logger.error(f"Token exchange error: {e}")
            return {'status': 'error', 'message': str(e)}

    # ==================== Market Data ====================

    async def get_live_market_data(self) -> Dict:
        """Fetch live index prices from Upstox"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in to Upstox', 'data': None}

        keys_str = ','.join(INDEX_KEYS.values())
        # Use full market quote for richer data (OHLC + close price)
        url = f"{UPSTOX_API_BASE}/market-quote/quotes?instrument_key={urllib.parse.quote(keys_str)}"

        try:
            resp = requests.get(url, headers=self._api_headers(token), timeout=10)
            result = resp.json()

            if result.get('status') == 'success':
                raw = result.get('data', {})
                indices = {}
                for key, instrument in INDEX_KEYS.items():
                    # Robust key matching
                    quote = raw.get(instrument)
                    if not quote:
                        # Try partial match for format differences
                        name_part = instrument.split('|')[1] if '|' in instrument else instrument
                        for rk, rv in raw.items():
                            if name_part in rk:
                                quote = rv
                                break
                    if not quote:
                        indices[key] = {'value': 0, 'change': 0, 'changePct': 0}
                        continue

                    ltp = quote.get('last_price', 0)
                    # Use net_change directly from Upstox (change from prev day close)
                    net_change = quote.get('net_change', 0)
                    prev_close = ltp - net_change if net_change else 0
                    change_pct = (net_change / prev_close * 100) if prev_close > 0 else 0
                    indices[key] = {
                        'value': ltp,
                        'change': round(net_change, 2),
                        'changePct': round(change_pct, 2)
                    }
                return {'status': 'success', 'data': indices}
            else:
                msg = result.get('message', 'Failed to fetch market data')
                return {'status': 'error', 'message': msg, 'data': None}
        except Exception as e:
            logger.error(f"Market data error: {e}")
            return {'status': 'error', 'message': str(e), 'data': None}

    # ==================== Portfolio & Funds ====================

    async def get_portfolio(self) -> Dict:
        """Fetch real portfolio from Upstox"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}

        try:
            # Get funds
            funds_url = f"{UPSTOX_API_BASE}/user/get-funds-and-margin"
            funds_resp = requests.get(funds_url, headers=self._api_headers(token), timeout=10)
            funds_data = funds_resp.json()

            # Get positions
            pos_url = f"{UPSTOX_API_BASE}/portfolio/short-term-positions"
            pos_resp = requests.get(pos_url, headers=self._api_headers(token), timeout=10)
            pos_data = pos_resp.json()

            # Parse funds
            equity = {}
            if funds_data.get('status') == 'success':
                equity = funds_data.get('data', {}).get('equity', {})

            available = equity.get('available_margin', 0)
            used_margin = equity.get('used_margin', 0)

            # Parse positions
            positions = []
            total_pnl = 0
            if pos_data.get('status') == 'success':
                for pos in pos_data.get('data', []):
                    pnl = pos.get('pnl', 0) or pos.get('realised', 0)
                    total_pnl += pnl
                    positions.append({
                        'symbol': pos.get('trading_symbol', ''),
                        'quantity': pos.get('quantity', 0),
                        'avg_price': pos.get('average_price', 0),
                        'ltp': pos.get('last_price', 0),
                        'pnl': round(pnl, 2),
                        'product': pos.get('product', ''),
                        'instrument_token': pos.get('instrument_token', ''),
                    })

            return {
                'status': 'success',
                'funds': {
                    'available_margin': available,
                    'used_margin': used_margin,
                    'total': available + used_margin,
                },
                'positions': positions,
                'total_pnl': round(total_pnl, 2),
                'active_positions': len([p for p in positions if p['quantity'] != 0]),
            }
        except Exception as e:
            logger.error(f"Portfolio fetch error: {e}")
            return {'status': 'error', 'message': str(e)}

    async def get_profile(self) -> Dict:
        """Get Upstox user profile"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}

        try:
            url = f"{UPSTOX_API_BASE}/user/profile"
            resp = requests.get(url, headers=self._api_headers(token), timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                data = result.get('data', {})
                return {
                    'status': 'success',
                    'profile': {
                        'name': data.get('user_name', ''),
                        'email': data.get('email', ''),
                        'user_id': data.get('user_id', ''),
                        'broker': data.get('broker', 'Upstox'),
                    }
                }
            return {'status': 'error', 'message': result.get('message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # ==================== Orders ====================

    async def place_order(self, params: Dict) -> Dict:
        """Place an order on Upstox"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}

        url = f"{UPSTOX_API_BASE}/order/place"
        headers = self._api_headers(token)
        headers['Content-Type'] = 'application/json'

        body = {
            'quantity': params.get('quantity', 1),
            'product': params.get('product', 'D'),
            'validity': params.get('validity', 'DAY'),
            'price': params.get('price', 0),
            'instrument_token': params.get('instrument_token', ''),
            'order_type': params.get('order_type', 'MARKET'),
            'transaction_type': params.get('transaction_type', 'BUY'),
            'disclosed_quantity': 0,
            'trigger_price': params.get('trigger_price', 0),
            'is_amo': False,
        }

        try:
            resp = requests.post(url, headers=headers, json=body, timeout=15)
            result = resp.json()
            if result.get('status') == 'success':
                return {
                    'status': 'success',
                    'order_id': result.get('data', {}).get('order_id', ''),
                    'message': 'Order placed successfully'
                }
            return {'status': 'error', 'message': result.get('message', 'Order failed')}
        except Exception as e:
            logger.error(f"Place order error: {e}")
            return {'status': 'error', 'message': str(e)}

    async def cancel_order(self, order_id: str) -> Dict:
        """Cancel an order"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}

        url = f"{UPSTOX_API_BASE}/order/cancel?order_id={order_id}"
        try:
            resp = requests.delete(url, headers=self._api_headers(token), timeout=10)
            result = resp.json()
            return {'status': result.get('status', 'error'), 'message': result.get('message', '')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # ==================== Trade History ====================

    async def get_order_book(self) -> Dict:
        """Get today's order book"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in', 'orders': []}

        try:
            url = f"{UPSTOX_API_BASE}/order/retrieve-all"
            resp = requests.get(url, headers=self._api_headers(token), timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                orders = []
                for o in result.get('data', []):
                    orders.append({
                        'order_id': o.get('order_id', ''),
                        'symbol': o.get('trading_symbol', ''),
                        'transaction_type': o.get('transaction_type', ''),
                        'quantity': o.get('quantity', 0),
                        'price': o.get('price', 0),
                        'average_price': o.get('average_price', 0),
                        'status': o.get('status', ''),
                        'order_type': o.get('order_type', ''),
                        'product': o.get('product', ''),
                        'placed_at': o.get('order_timestamp', ''),
                    })
                return {'status': 'success', 'orders': orders}
            return {'status': 'error', 'message': result.get('message', ''), 'orders': []}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'orders': []}

    async def get_trade_pnl(self, segment: str = 'EQ', year: str = '') -> Dict:
        """Get P&L report"""
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in', 'trades': []}

        if not year:
            year = str(datetime.now().year)
        fiscal_year = f"{year}-{str(int(year)+1)[2:]}"

        try:
            url = f"{UPSTOX_API_BASE}/trade/profit-and-loss/metadata?segment={segment}&financial_year={fiscal_year}"
            resp = requests.get(url, headers=self._api_headers(token), timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                return {'status': 'success', 'data': result.get('data', {})}
            return {'status': 'error', 'message': result.get('message', ''), 'data': {}}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'data': {}}

    async def check_connection(self) -> Dict:
        """Check if Upstox connection is active"""
        token = await self._get_access_token()
        if not token:
            return {'connected': False, 'message': 'No access token. Please login to Upstox.'}

        try:
            url = f"{UPSTOX_API_BASE}/user/profile"
            resp = requests.get(url, headers=self._api_headers(token), timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                name = result.get('data', {}).get('user_name', 'Unknown')
                return {'connected': True, 'message': f'Connected as {name}'}
            return {'connected': False, 'message': 'Token expired. Please re-login.'}
        except Exception as e:
            return {'connected': False, 'message': str(e)}
