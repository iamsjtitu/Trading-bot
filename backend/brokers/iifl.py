"""
IIFL Securities Broker Integration
API Docs: https://ttblaze.iifl.com/apimarketplace
"""
import requests
import logging
from typing import Dict
from broker_base import BrokerBase

logger = logging.getLogger(__name__)

IIFL_API_BASE = "https://ttblaze.iifl.com/apimarketdata"
IIFL_INTERACTIVE = "https://ttblaze.iifl.com/interactive"


class IIFLBroker(BrokerBase):
    BROKER_ID = 'iifl'
    BROKER_NAME = 'IIFL Securities'

    async def get_auth_url(self) -> Dict:
        return {'status': 'info', 'message': 'IIFL uses API Key + Secret Key login. Configure in Settings.', 'auth_type': 'credentials'}

    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        broker = await self._get_broker_settings()
        api_key = broker.get('api_key', '')
        api_secret = broker.get('api_secret', '')
        if not all([api_key, api_secret]):
            return {'status': 'error', 'message': 'API Key and Secret required'}
        headers = {'Content-Type': 'application/json'}
        body = {'secretKey': api_secret, 'appKey': api_key, 'source': 'WebAPI'}
        try:
            resp = requests.post(f"{IIFL_API_BASE}/auth/login", json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('type') == 'success' and result.get('result', {}).get('token'):
                token = result['result']['token']
                await self._save_token(token, {'user_id': result['result'].get('userID', '')})
                return {'status': 'success', 'message': 'IIFL login successful!'}
            return {'status': 'error', 'message': result.get('description', 'Login failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def _iifl_headers(self) -> Dict:
        token = await self._get_access_token()
        return {'Content-Type': 'application/json', 'Authorization': token or ''}

    async def get_live_market_data(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in', 'data': None}
        headers = await self._iifl_headers()
        instruments = [
            {'exchangeSegment': 1, 'exchangeInstrumentID': 26000, 'name': 'nifty50'},
            {'exchangeSegment': 11, 'exchangeInstrumentID': 1, 'name': 'sensex'},
            {'exchangeSegment': 1, 'exchangeInstrumentID': 26009, 'name': 'banknifty'},
            {'exchangeSegment': 1, 'exchangeInstrumentID': 26037, 'name': 'finnifty'},
        ]
        indices = {}
        try:
            ids = [{'exchangeSegment': i['exchangeSegment'], 'exchangeInstrumentID': i['exchangeInstrumentID']} for i in instruments]
            body = {'instruments': ids, 'xtsMessageCode': 1502, 'publishFormat': 'JSON'}
            resp = requests.post(f"{IIFL_API_BASE}/instruments/quotes", json=body, headers=headers, timeout=10)
            result = resp.json()
            quotes = result.get('result', {}).get('listQuotes', [])
            import json as json_mod
            for i, q_str in enumerate(quotes):
                q = json_mod.loads(q_str) if isinstance(q_str, str) else q_str
                name = instruments[i]['name'] if i < len(instruments) else f'idx_{i}'
                ltp = float(q.get('LastTradedPrice', 0))
                close = float(q.get('Close', ltp))
                change = ltp - close
                pct = (change / close * 100) if close > 0 else 0
                indices[name] = {'value': ltp, 'change': round(change, 2), 'changePct': round(pct, 2)}
        except Exception as e:
            logger.error(f"IIFL market data error: {e}")
            for i in instruments:
                indices[i['name']] = {'value': 0, 'change': 0, 'changePct': 0}
        return {'status': 'success', 'data': indices}

    async def get_option_chain(self, instrument: str, expiry: str = '') -> Dict:
        return {'status': 'error', 'message': 'Use NSE option chain for IIFL'}

    async def get_portfolio(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}
        headers = await self._iifl_headers()
        try:
            pos_resp = requests.get(f"{IIFL_INTERACTIVE}/portfolio/positions?dayOrNet=NetWise", headers=headers, timeout=10)
            positions = []
            total_pnl = 0
            for p in pos_resp.json().get('result', {}).get('positionList', []):
                pnl = float(p.get('realizedMTM', 0)) + float(p.get('unrealizedMTM', 0))
                total_pnl += pnl
                positions.append({
                    'symbol': p.get('tradingSymbol', ''), 'quantity': int(p.get('netQuantity', 0)),
                    'avg_price': float(p.get('netAveragePrice', 0)), 'ltp': float(p.get('ltp', 0)),
                    'pnl': round(pnl, 2), 'product': p.get('productType', ''),
                    'instrument_token': str(p.get('exchangeInstrumentId', '')),
                })
            return {
                'status': 'success', 'funds': {'available_margin': 0, 'used_margin': 0, 'total': 0},
                'positions': positions, 'total_pnl': round(total_pnl, 2),
                'active_positions': len([p for p in positions if p['quantity'] != 0]),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_profile(self) -> Dict:
        headers = await self._iifl_headers()
        try:
            resp = requests.get(f"{IIFL_INTERACTIVE}/user/profile", headers=headers, timeout=10)
            result = resp.json()
            if result.get('type') == 'success':
                d = result.get('result', {})
                return {'status': 'success', 'profile': {
                    'name': d.get('ClientName', ''), 'email': d.get('EmailId', ''),
                    'user_id': d.get('ClientId', ''), 'broker': 'IIFL Securities',
                }}
            return {'status': 'error', 'message': 'Failed to fetch profile'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def place_order(self, params: Dict) -> Dict:
        headers = await self._iifl_headers()
        body = {
            'exchangeSegment': 'NSEFO', 'exchangeInstrumentID': params.get('instrument_token', ''),
            'productType': params.get('product', 'MIS'),
            'orderType': params.get('order_type', 'MARKET'),
            'orderSide': params.get('transaction_type', 'BUY'),
            'timeInForce': params.get('validity', 'DAY'),
            'orderQuantity': params.get('quantity', 1),
            'limitPrice': params.get('price', 0),
            'stopPrice': params.get('trigger_price', 0),
            'disclosedQuantity': 0,
        }
        try:
            resp = requests.post(f"{IIFL_INTERACTIVE}/orders", json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('type') == 'success':
                return {'status': 'success', 'order_id': str(result.get('result', {}).get('AppOrderID', '')), 'message': 'Order placed'}
            return {'status': 'error', 'message': result.get('description', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def cancel_order(self, order_id: str) -> Dict:
        headers = await self._iifl_headers()
        try:
            resp = requests.delete(f"{IIFL_INTERACTIVE}/orders?appOrderID={order_id}", headers=headers, timeout=10)
            result = resp.json()
            return {'status': 'success' if result.get('type') == 'success' else 'error', 'message': result.get('description', '')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_order_book(self) -> Dict:
        headers = await self._iifl_headers()
        try:
            resp = requests.get(f"{IIFL_INTERACTIVE}/orders", headers=headers, timeout=10)
            result = resp.json()
            orders = [{'order_id': str(o.get('AppOrderID')), 'symbol': o.get('TradingSymbol'),
                       'transaction_type': o.get('OrderSide'), 'quantity': int(o.get('OrderQuantity', 0)),
                       'price': float(o.get('LimitPrice', 0)), 'average_price': float(o.get('OrderAverageTradedPrice', 0)),
                       'status': o.get('OrderStatus'), 'order_type': o.get('OrderType'),
                       'product': o.get('ProductType'), 'placed_at': o.get('OrderGeneratedDateTime'),
                      } for o in result.get('result', [])]
            return {'status': 'success', 'orders': orders}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'orders': []}

    async def check_connection(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'connected': False, 'message': 'No access token'}
        headers = await self._iifl_headers()
        try:
            resp = requests.get(f"{IIFL_INTERACTIVE}/user/profile", headers=headers, timeout=10)
            result = resp.json()
            if result.get('type') == 'success':
                return {'connected': True, 'message': f"Connected as {result['result'].get('ClientName', '')}"}
            return {'connected': False, 'message': 'Token expired'}
        except Exception as e:
            return {'connected': False, 'message': str(e)}

    async def get_trade_pnl(self, segment='EQ', year='') -> Dict:
        return {'status': 'error', 'message': 'Use IIFL portal for P&L', 'data': {}}
