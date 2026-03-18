"""
Angel One SmartAPI Broker Integration
API Docs: https://smartapi.angelone.in/docs
"""
import requests
import logging
from typing import Dict
from datetime import datetime, timezone
from broker_base import BrokerBase

logger = logging.getLogger(__name__)

ANGEL_API_BASE = "https://apiconnect.angelone.in"
ANGEL_AUTH_URL = f"{ANGEL_API_BASE}/rest/auth/angelbroking/user/v1/loginByPassword"


class AngelOneBroker(BrokerBase):
    BROKER_ID = 'angelone'
    BROKER_NAME = 'Angel One (SmartAPI)'

    async def get_auth_url(self) -> Dict:
        return {'status': 'info', 'message': 'Angel One uses API Key + Client ID + Password + TOTP login. Configure in Settings and click Connect.', 'auth_type': 'credentials'}

    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        """For Angel One, auth_code contains JSON: {client_id, password, totp}"""
        import json
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        try:
            creds = json.loads(auth_code) if isinstance(auth_code, str) else auth_code
        except json.JSONDecodeError:
            creds = {'client_id': auth_code}
        client_id = creds.get('client_id', broker.get('client_id', ''))
        password = creds.get('password', broker.get('password', ''))
        totp = creds.get('totp', '')
        if not all([api_key, client_id, password, totp]):
            return {'status': 'error', 'message': 'API Key, Client ID, Password and TOTP required'}
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': '00:00:00:00:00:00',
            'X-PrivateKey': api_key,
        }
        body = {'clientcode': client_id, 'password': password, 'totp': totp}
        try:
            resp = requests.post(ANGEL_AUTH_URL, json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('status') and result.get('data', {}).get('jwtToken'):
                token = result['data']['jwtToken']
                await self._save_token(token, {'refresh_token': result['data'].get('refreshToken', ''), 'client_id': client_id})
                return {'status': 'success', 'message': 'Angel One login successful!'}
            return {'status': 'error', 'message': result.get('message', 'Login failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def _angel_headers(self) -> Dict:
        broker = await self._get_broker_settings()
        return {
            'Authorization': f"Bearer {broker.get('access_token', '')}",
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '127.0.0.1',
            'X-MACAddress': '00:00:00:00:00:00',
            'X-PrivateKey': broker.get('api_key', ''),
        }

    async def get_live_market_data(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in', 'data': None}
        headers = await self._angel_headers()
        # Angel One uses symboltoken and exchange for quotes
        nifty_tokens = [
            {'exchange': 'NSE', 'symboltoken': '99926000', 'name': 'nifty50'},    # NIFTY 50
            {'exchange': 'BSE', 'symboltoken': '99919000', 'name': 'sensex'},      # SENSEX
            {'exchange': 'NSE', 'symboltoken': '99926009', 'name': 'banknifty'},   # BANK NIFTY
            {'exchange': 'NSE', 'symboltoken': '99926037', 'name': 'finnifty'},    # FIN NIFTY
        ]
        indices = {}
        for idx in nifty_tokens:
            try:
                body = {'exchange': idx['exchange'], 'symboltoken': idx['symboltoken'], 'interval': 'ONE_DAY'}
                resp = requests.post(f"{ANGEL_API_BASE}/rest/secure/angelbroking/market/v1/quote", json=body, headers=headers, timeout=10)
                result = resp.json()
                if result.get('data'):
                    d = result['data']
                    ltp = d.get('ltp', 0)
                    close = d.get('close', ltp)
                    change = ltp - close
                    pct = (change / close * 100) if close > 0 else 0
                    indices[idx['name']] = {'value': ltp, 'change': round(change, 2), 'changePct': round(pct, 2)}
            except Exception as e:
                logger.error(f"Angel One market data error for {idx['name']}: {e}")
                indices[idx['name']] = {'value': 0, 'change': 0, 'changePct': 0}
        return {'status': 'success', 'data': indices}

    async def get_option_chain(self, instrument: str, expiry: str = '') -> Dict:
        return {'status': 'error', 'message': 'Use NSE option chain API for Angel One'}

    async def get_portfolio(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}
        headers = await self._angel_headers()
        try:
            funds_resp = requests.get(f"{ANGEL_API_BASE}/rest/secure/angelbroking/user/v1/getRMS", headers=headers, timeout=10)
            pos_resp = requests.post(f"{ANGEL_API_BASE}/rest/secure/angelbroking/order/v1/getPosition", json={}, headers=headers, timeout=10)
            funds = funds_resp.json().get('data', {})
            net = float(funds.get('net', 0))
            used = float(funds.get('utiliseddebits', 0))
            positions = []
            total_pnl = 0
            for p in pos_resp.json().get('data', []):
                pnl = float(p.get('pnl', 0))
                total_pnl += pnl
                positions.append({
                    'symbol': p.get('tradingsymbol', ''), 'quantity': int(p.get('netqty', 0)),
                    'avg_price': float(p.get('averageprice', 0)), 'ltp': float(p.get('ltp', 0)),
                    'pnl': round(pnl, 2), 'product': p.get('producttype', ''),
                    'instrument_token': p.get('symboltoken', ''),
                })
            return {
                'status': 'success',
                'funds': {'available_margin': net, 'used_margin': used, 'total': net + used},
                'positions': positions, 'total_pnl': round(total_pnl, 2),
                'active_positions': len([p for p in positions if p['quantity'] != 0]),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_profile(self) -> Dict:
        headers = await self._angel_headers()
        try:
            resp = requests.get(f"{ANGEL_API_BASE}/rest/secure/angelbroking/user/v1/getProfile", headers=headers, timeout=10)
            result = resp.json()
            if result.get('data'):
                d = result['data']
                return {'status': 'success', 'profile': {
                    'name': d.get('name', ''), 'email': d.get('email', ''),
                    'user_id': d.get('clientcode', ''), 'broker': 'Angel One',
                }}
            return {'status': 'error', 'message': result.get('message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def place_order(self, params: Dict) -> Dict:
        headers = await self._angel_headers()
        body = {
            'variety': 'NORMAL', 'tradingsymbol': params.get('instrument_token', ''),
            'symboltoken': params.get('symbol_token', ''),
            'transactiontype': params.get('transaction_type', 'BUY'),
            'exchange': params.get('exchange', 'NFO'),
            'ordertype': params.get('order_type', 'MARKET'),
            'producttype': params.get('product', 'INTRADAY'),
            'duration': params.get('validity', 'DAY'),
            'quantity': str(params.get('quantity', 1)),
            'price': str(params.get('price', 0)),
            'triggerprice': str(params.get('trigger_price', 0)),
        }
        try:
            resp = requests.post(f"{ANGEL_API_BASE}/rest/secure/angelbroking/order/v1/placeOrder", json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('status') and result.get('data', {}).get('orderid'):
                return {'status': 'success', 'order_id': result['data']['orderid'], 'message': 'Order placed'}
            return {'status': 'error', 'message': result.get('message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def cancel_order(self, order_id: str) -> Dict:
        headers = await self._angel_headers()
        try:
            resp = requests.post(f"{ANGEL_API_BASE}/rest/secure/angelbroking/order/v1/cancelOrder",
                                 json={'variety': 'NORMAL', 'orderid': order_id}, headers=headers, timeout=10)
            result = resp.json()
            return {'status': 'success' if result.get('status') else 'error', 'message': result.get('message', '')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_order_book(self) -> Dict:
        headers = await self._angel_headers()
        try:
            resp = requests.get(f"{ANGEL_API_BASE}/rest/secure/angelbroking/order/v1/getOrderBook", headers=headers, timeout=10)
            result = resp.json()
            orders = [{'order_id': o.get('orderid'), 'symbol': o.get('tradingsymbol'),
                       'transaction_type': o.get('transactiontype'), 'quantity': int(o.get('quantity', 0)),
                       'price': float(o.get('price', 0)), 'average_price': float(o.get('averageprice', 0)),
                       'status': o.get('orderstatus'), 'order_type': o.get('ordertype'),
                       'product': o.get('producttype'), 'placed_at': o.get('updatetime'),
                      } for o in result.get('data', []) or []]
            return {'status': 'success', 'orders': orders}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'orders': []}

    async def check_connection(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'connected': False, 'message': 'No access token. Please login.'}
        headers = await self._angel_headers()
        try:
            resp = requests.get(f"{ANGEL_API_BASE}/rest/secure/angelbroking/user/v1/getProfile", headers=headers, timeout=10)
            result = resp.json()
            if result.get('data'):
                return {'connected': True, 'message': f"Connected as {result['data'].get('name', '')}"}
            return {'connected': False, 'message': 'Token expired'}
        except Exception as e:
            return {'connected': False, 'message': str(e)}

    async def get_trade_pnl(self, segment='EQ', year='') -> Dict:
        return {'status': 'error', 'message': 'Use Angel One web portal for P&L', 'data': {}}
