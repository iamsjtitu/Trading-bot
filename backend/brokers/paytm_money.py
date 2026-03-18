"""
Paytm Money Broker Integration
Note: Paytm Money API has limited public availability.
This implementation provides framework for when API access is available.
"""
import requests
import logging
from typing import Dict
from broker_base import BrokerBase

logger = logging.getLogger(__name__)

PAYTM_API_BASE = "https://developer.paytmmoney.com"


class PaytmMoneyBroker(BrokerBase):
    BROKER_ID = 'paytm_money'
    BROKER_NAME = 'Paytm Money'

    async def get_auth_url(self) -> Dict:
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        if not api_key:
            return {'status': 'error', 'message': 'Paytm Money API Key required. Apply at developer.paytmmoney.com'}
        state = 'tradingbot'
        auth_url = f"{PAYTM_API_BASE}/accounts/v2/gettoken?apiKey={api_key}&state={state}"
        return {'status': 'success', 'auth_url': auth_url}

    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        api_secret = broker.get('api_secret', '')
        if not all([api_key, api_secret]):
            return {'status': 'error', 'message': 'API Key and Secret required'}
        try:
            resp = requests.post(f"{PAYTM_API_BASE}/accounts/v2/gettoken", json={
                'apiKey': api_key, 'apiSecretKey': api_secret, 'requestToken': auth_code,
            }, headers={'Content-Type': 'application/json'}, timeout=15)
            result = resp.json()
            if result.get('access_token'):
                await self._save_token(result['access_token'])
                return {'status': 'success', 'message': 'Paytm Money login successful!'}
            return {'status': 'error', 'message': result.get('message', 'Login failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def _pm_headers(self) -> Dict:
        token = await self._get_access_token()
        return {'x-jwt-token': token or '', 'Content-Type': 'application/json'}

    async def get_live_market_data(self) -> Dict:
        return {'status': 'error', 'message': 'Paytm Money market data API not yet available', 'data': None}

    async def get_option_chain(self, instrument: str, expiry: str = '') -> Dict:
        return {'status': 'error', 'message': 'Not available for Paytm Money'}

    async def get_portfolio(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}
        headers = await self._pm_headers()
        try:
            pos_resp = requests.get(f"{PAYTM_API_BASE}/orders/v1/position?type=day", headers=headers, timeout=10)
            funds_resp = requests.get(f"{PAYTM_API_BASE}/accounts/v1/funds/summary", headers=headers, timeout=10)
            funds = funds_resp.json().get('data', {})
            positions = []
            total_pnl = 0
            for p in pos_resp.json().get('data', []):
                pnl = float(p.get('realized_mtm', 0)) + float(p.get('unrealized_mtm', 0))
                total_pnl += pnl
                positions.append({
                    'symbol': p.get('display_name', ''), 'quantity': int(p.get('net_quantity', 0)),
                    'avg_price': float(p.get('avg_price', 0)), 'ltp': float(p.get('ltp', 0)),
                    'pnl': round(pnl, 2), 'product': p.get('product', ''),
                    'instrument_token': p.get('security_id', ''),
                })
            available = float(funds.get('available_margin', 0))
            used = float(funds.get('used_margin', 0))
            return {
                'status': 'success',
                'funds': {'available_margin': available, 'used_margin': used, 'total': available + used},
                'positions': positions, 'total_pnl': round(total_pnl, 2),
                'active_positions': len([p for p in positions if p['quantity'] != 0]),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_profile(self) -> Dict:
        return {'status': 'success', 'profile': {'name': 'Paytm Money User', 'email': '', 'user_id': '', 'broker': 'Paytm Money'}}

    async def place_order(self, params: Dict) -> Dict:
        headers = await self._pm_headers()
        body = {
            'txn_type': params.get('transaction_type', 'B'),
            'exchange': params.get('exchange', 'NSE'),
            'segment': 'D',
            'product': params.get('product', 'I'),
            'security_id': params.get('instrument_token', ''),
            'quantity': str(params.get('quantity', 1)),
            'price': str(params.get('price', 0)),
            'order_type': params.get('order_type', 'MKT'),
            'validity': params.get('validity', 'DAY'),
        }
        try:
            resp = requests.post(f"{PAYTM_API_BASE}/orders/v1/place/regular", json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('data', {}).get('order_no'):
                return {'status': 'success', 'order_id': result['data']['order_no'], 'message': 'Order placed'}
            return {'status': 'error', 'message': result.get('message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def cancel_order(self, order_id: str) -> Dict:
        headers = await self._pm_headers()
        try:
            resp = requests.delete(f"{PAYTM_API_BASE}/orders/v1/cancel/regular?order_no={order_id}", headers=headers, timeout=10)
            return {'status': 'success' if resp.status_code == 200 else 'error', 'message': resp.json().get('message', '')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_order_book(self) -> Dict:
        headers = await self._pm_headers()
        try:
            resp = requests.get(f"{PAYTM_API_BASE}/orders/v1/order-book", headers=headers, timeout=10)
            result = resp.json()
            orders = [{'order_id': o.get('order_no'), 'symbol': o.get('display_name'),
                       'transaction_type': 'BUY' if o.get('txn_type') == 'B' else 'SELL',
                       'quantity': int(o.get('quantity', 0)), 'price': float(o.get('price', 0)),
                       'average_price': float(o.get('avg_price', 0)), 'status': o.get('order_status'),
                       'order_type': o.get('order_type'), 'product': o.get('product'),
                       'placed_at': o.get('placed_at'),
                      } for o in result.get('data', [])]
            return {'status': 'success', 'orders': orders}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'orders': []}

    async def check_connection(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'connected': False, 'message': 'No access token'}
        return {'connected': True, 'message': 'Connected to Paytm Money'}

    async def get_trade_pnl(self, segment='EQ', year='') -> Dict:
        return {'status': 'error', 'message': 'Use Paytm Money app for P&L', 'data': {}}
