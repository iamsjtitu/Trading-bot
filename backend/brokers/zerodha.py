"""
Zerodha Kite Connect Broker Integration
API Docs: https://kite.trade/docs/connect/v3/
"""
import requests
import logging
import urllib.parse
from typing import Dict
from datetime import datetime, timezone
from broker_base import BrokerBase

logger = logging.getLogger(__name__)

KITE_AUTH_URL = "https://kite.zerodha.com/connect/login"
KITE_TOKEN_URL = "https://api.kite.trade/session/token"
KITE_API_BASE = "https://api.kite.trade"

INDEX_KEYS = {
    'nifty50': 'NSE:NIFTY 50',
    'sensex': 'BSE:SENSEX',
    'banknifty': 'NSE:NIFTY BANK',
    'finnifty': 'NSE:NIFTY FIN SERVICE',
}

# NFO instrument tokens for option chain
INSTRUMENT_MAP = {
    'NIFTY50': 'NIFTY',
    'BANKNIFTY': 'BANKNIFTY',
    'FINNIFTY': 'FINNIFTY',
    'MIDCPNIFTY': 'MIDCPNIFTY',
    'SENSEX': 'SENSEX',
    'BANKEX': 'BANKEX',
}


class ZerodhaBroker(BrokerBase):
    BROKER_ID = 'zerodha'
    BROKER_NAME = 'Zerodha (Kite Connect)'

    async def get_auth_url(self) -> Dict:
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        if not api_key:
            return {'status': 'error', 'message': 'Kite Connect API Key required in Settings.'}
        auth_url = f"{KITE_AUTH_URL}?v=3&api_key={api_key}"
        return {'status': 'success', 'auth_url': auth_url}

    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        api_secret = broker.get('api_secret', '')
        if not all([api_key, api_secret]):
            return {'status': 'error', 'message': 'API Key and Secret required'}
        import hashlib
        checksum = hashlib.sha256(f"{api_key}{auth_code}{api_secret}".encode()).hexdigest()
        try:
            resp = requests.post(KITE_TOKEN_URL, data={
                'api_key': api_key, 'request_token': auth_code, 'checksum': checksum,
            }, timeout=15)
            result = resp.json()
            if resp.status_code == 200 and 'data' in result:
                token = result['data'].get('access_token', '')
                await self._save_token(token)
                return {'status': 'success', 'message': 'Zerodha login successful!'}
            return {'status': 'error', 'message': result.get('message', 'Token exchange failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def _headers(self, token: str) -> Dict:
        broker_settings_sync = {}  # Will be loaded async
        return {
            'X-Kite-Version': '3',
            'Authorization': f'token {token}',
        }

    async def _get_kite_headers(self) -> Dict:
        broker = await self._get_broker_settings()
        token = broker.get('access_token', '')
        api_key = broker.get('api_key', '')
        return {
            'X-Kite-Version': '3',
            'Authorization': f'token {api_key}:{token}',
        }

    async def get_live_market_data(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in', 'data': None}
        headers = await self._get_kite_headers()
        instruments = ','.join(INDEX_KEYS.values())
        url = f"{KITE_API_BASE}/quote?i={urllib.parse.quote(instruments)}"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                raw = result.get('data', {})
                indices = {}
                for key, inst in INDEX_KEYS.items():
                    q = raw.get(inst, {})
                    ltp = q.get('last_price', 0)
                    net_change = q.get('net_change', 0)
                    prev = ltp - net_change if net_change else 0
                    pct = (net_change / prev * 100) if prev > 0 else 0
                    indices[key] = {'value': ltp, 'change': round(net_change, 2), 'changePct': round(pct, 2)}
                return {'status': 'success', 'data': indices}
            return {'status': 'error', 'message': result.get('message', 'Failed'), 'data': None}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'data': None}

    async def get_option_chain(self, instrument: str, expiry: str = '') -> Dict:
        """Zerodha doesn't have a direct option chain API - use instruments dump"""
        return {'status': 'error', 'message': 'Use NSE option chain API for Zerodha. Kite requires instruments file download.'}

    async def get_portfolio(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}
        headers = await self._get_kite_headers()
        try:
            funds_resp = requests.get(f"{KITE_API_BASE}/user/margins", headers=headers, timeout=10)
            pos_resp = requests.get(f"{KITE_API_BASE}/portfolio/positions", headers=headers, timeout=10)
            funds = funds_resp.json().get('data', {}).get('equity', {})
            positions = []
            total_pnl = 0
            pos_data = pos_resp.json().get('data', {}).get('net', [])
            for p in pos_data:
                pnl = p.get('pnl', 0)
                total_pnl += pnl
                positions.append({
                    'symbol': p.get('tradingsymbol', ''),
                    'quantity': p.get('quantity', 0),
                    'avg_price': p.get('average_price', 0),
                    'ltp': p.get('last_price', 0),
                    'pnl': round(pnl, 2),
                    'product': p.get('product', ''),
                    'instrument_token': str(p.get('instrument_token', '')),
                })
            return {
                'status': 'success',
                'funds': {
                    'available_margin': funds.get('available', {}).get('live_balance', 0),
                    'used_margin': funds.get('utilised', {}).get('debits', 0),
                    'total': funds.get('available', {}).get('live_balance', 0) + funds.get('utilised', {}).get('debits', 0),
                },
                'positions': positions, 'total_pnl': round(total_pnl, 2),
                'active_positions': len([p for p in positions if p['quantity'] != 0]),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_profile(self) -> Dict:
        headers = await self._get_kite_headers()
        try:
            resp = requests.get(f"{KITE_API_BASE}/user/profile", headers=headers, timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                d = result.get('data', {})
                return {'status': 'success', 'profile': {
                    'name': d.get('user_name', ''), 'email': d.get('email', ''),
                    'user_id': d.get('user_id', ''), 'broker': 'Zerodha',
                }}
            return {'status': 'error', 'message': result.get('message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def place_order(self, params: Dict) -> Dict:
        headers = await self._get_kite_headers()
        body = {
            'tradingsymbol': params.get('instrument_token', ''),
            'exchange': params.get('exchange', 'NFO'),
            'transaction_type': params.get('transaction_type', 'BUY'),
            'order_type': params.get('order_type', 'MARKET'),
            'quantity': params.get('quantity', 1),
            'product': params.get('product', 'MIS'),
            'validity': params.get('validity', 'DAY'),
            'price': params.get('price', 0),
            'trigger_price': params.get('trigger_price', 0),
        }
        try:
            resp = requests.post(f"{KITE_API_BASE}/orders/regular", headers=headers, data=body, timeout=15)
            result = resp.json()
            if result.get('status') == 'success':
                return {'status': 'success', 'order_id': result.get('data', {}).get('order_id', ''), 'message': 'Order placed'}
            return {'status': 'error', 'message': result.get('message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def cancel_order(self, order_id: str) -> Dict:
        headers = await self._get_kite_headers()
        try:
            resp = requests.delete(f"{KITE_API_BASE}/orders/regular/{order_id}", headers=headers, timeout=10)
            result = resp.json()
            return {'status': result.get('status', 'error'), 'message': result.get('message', '')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_order_book(self) -> Dict:
        headers = await self._get_kite_headers()
        try:
            resp = requests.get(f"{KITE_API_BASE}/orders", headers=headers, timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                orders = [{'order_id': o.get('order_id'), 'symbol': o.get('tradingsymbol'),
                           'transaction_type': o.get('transaction_type'), 'quantity': o.get('quantity'),
                           'price': o.get('price'), 'average_price': o.get('average_price'),
                           'status': o.get('status'), 'order_type': o.get('order_type'),
                           'product': o.get('product'), 'placed_at': o.get('order_timestamp'),
                          } for o in result.get('data', [])]
                return {'status': 'success', 'orders': orders}
            return {'status': 'error', 'orders': []}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'orders': []}

    async def check_connection(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'connected': False, 'message': 'No access token. Please login.'}
        headers = await self._get_kite_headers()
        try:
            resp = requests.get(f"{KITE_API_BASE}/user/profile", headers=headers, timeout=10)
            result = resp.json()
            if result.get('status') == 'success':
                return {'connected': True, 'message': f"Connected as {result['data'].get('user_name', '')}"}
            return {'connected': False, 'message': 'Token expired'}
        except Exception as e:
            return {'connected': False, 'message': str(e)}

    async def get_trade_pnl(self, segment='EQ', year='') -> Dict:
        return {'status': 'error', 'message': 'Use Kite Console for P&L reports', 'data': {}}
