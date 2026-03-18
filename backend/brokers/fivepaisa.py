"""
5paisa Broker Integration
API Docs: https://www.5paisa.com/developerapi
"""
import requests
import logging
from typing import Dict
from broker_base import BrokerBase

logger = logging.getLogger(__name__)

FIVEPAISA_API_BASE = "https://Openapi.5paisa.com"
FIVEPAISA_LOGIN_URL = f"{FIVEPAISA_API_BASE}/VendorsAPI/Service1.svc"


class FivePaisaBroker(BrokerBase):
    BROKER_ID = 'fivepaisa'
    BROKER_NAME = '5paisa'

    async def get_auth_url(self) -> Dict:
        creds = await self._get_my_credentials()
        api_key = creds.get('api_key', '')
        if not api_key:
            return {'status': 'error', 'message': '5paisa API Key required in Settings.'}
        redirect_uri = creds.get('redirect_uri', '')
        auth_url = f"https://dev-openapi.5paisa.com/WebVendorLogin/VLogin/Index?VendorKey={api_key}&ResponseURL={redirect_uri}"
        return {'status': 'success', 'auth_url': auth_url}

    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        creds = await self._get_my_credentials()
        api_key = creds.get('api_key', '')
        encryption_key = creds.get('api_secret', '')
        if not all([api_key, encryption_key]):
            return {'status': 'error', 'message': 'API Key and Encryption Key required'}
        headers = {'Content-Type': 'application/json'}
        body = {
            'head': {'appName': api_key, 'appVer': '1.0', 'key': api_key, 'osName': 'WEB', 'requestCode': '5PGetToken'},
            'body': {'RequestToken': auth_code, 'EncryKey': encryption_key},
        }
        try:
            resp = requests.post(f"{FIVEPAISA_LOGIN_URL}/V4/LoginRequestToken", json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('body', {}).get('AccessToken'):
                token = result['body']['AccessToken']
                await self._save_token(token, {'client_code': result['body'].get('ClientCode', '')})
                return {'status': 'success', 'message': '5paisa login successful!'}
            return {'status': 'error', 'message': result.get('body', {}).get('Message', 'Login failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def _fivepaisa_headers(self) -> Dict:
        creds = await self._get_my_credentials()
        return {'Content-Type': 'application/json', 'Authorization': f"Bearer {creds.get('token', '')}"}

    async def get_live_market_data(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in', 'data': None}
        headers = await self._fivepaisa_headers()
        # 5paisa market feed
        scriplist = [
            {'Exch': 'N', 'ExchType': 'D', 'ScripCode': 999920000, 'name': 'nifty50'},
            {'Exch': 'B', 'ExchType': 'D', 'ScripCode': 999901, 'name': 'sensex'},
            {'Exch': 'N', 'ExchType': 'D', 'ScripCode': 999920005, 'name': 'banknifty'},
            {'Exch': 'N', 'ExchType': 'D', 'ScripCode': 999920041, 'name': 'finnifty'},
        ]
        indices = {}
        try:
            body = {
                'head': {'requestCode': '5PMF'},
                'body': {'Count': len(scriplist), 'MarketFeedData': [
                    {'Exch': s['Exch'], 'ExchType': s['ExchType'], 'ScripCode': s['ScripCode']} for s in scriplist
                ]},
            }
            resp = requests.post(f"{FIVEPAISA_LOGIN_URL}/MarketFeed", json=body, headers=headers, timeout=10)
            result = resp.json()
            for i, feed in enumerate(result.get('body', {}).get('Data', [])):
                name = scriplist[i]['name'] if i < len(scriplist) else f'idx_{i}'
                ltp = feed.get('LastRate', 0)
                chg = feed.get('Change', 0)
                pct = feed.get('PerChange', 0)
                indices[name] = {'value': ltp, 'change': round(chg, 2), 'changePct': round(pct, 2)}
        except Exception as e:
            logger.error(f"5paisa market data error: {e}")
            for s in scriplist:
                indices[s['name']] = {'value': 0, 'change': 0, 'changePct': 0}
        return {'status': 'success', 'data': indices}

    async def get_option_chain(self, instrument: str, expiry: str = '') -> Dict:
        return {'status': 'error', 'message': 'Use NSE option chain for 5paisa'}

    async def get_portfolio(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'status': 'error', 'message': 'Not logged in'}
        headers = await self._fivepaisa_headers()
        creds = await self._get_my_credentials()
        client_code = creds.get('client_code', '')
        try:
            margin_body = {'head': {'requestCode': '5PMargin'}, 'body': {'ClientCode': client_code}}
            pos_body = {'head': {'requestCode': '5PNOP'}, 'body': {'ClientCode': client_code}}
            m_resp = requests.post(f"{FIVEPAISA_LOGIN_URL}/V3/Margin", json=margin_body, headers=headers, timeout=10)
            p_resp = requests.post(f"{FIVEPAISA_LOGIN_URL}/V2/NetPositionNetWise", json=pos_body, headers=headers, timeout=10)
            margin = m_resp.json().get('body', {}).get('EquityMargin', [{}])
            available = float(margin[0].get('ALB', 0)) if margin else 0
            positions = []
            total_pnl = 0
            for p in p_resp.json().get('body', {}).get('NetPositionDetail', []):
                pnl = float(p.get('MTOM', 0))
                total_pnl += pnl
                positions.append({
                    'symbol': p.get('ScripName', ''), 'quantity': int(p.get('NetQty', 0)),
                    'avg_price': float(p.get('BuyAvgRate', 0)), 'ltp': float(p.get('LTP', 0)),
                    'pnl': round(pnl, 2), 'product': p.get('OrderFor', ''),
                    'instrument_token': str(p.get('ScripCode', '')),
                })
            return {
                'status': 'success',
                'funds': {'available_margin': available, 'used_margin': 0, 'total': available},
                'positions': positions, 'total_pnl': round(total_pnl, 2),
                'active_positions': len([p for p in positions if p['quantity'] != 0]),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def get_profile(self) -> Dict:
        return {'status': 'success', 'profile': {'name': '5paisa User', 'email': '', 'user_id': '', 'broker': '5paisa'}}

    async def place_order(self, params: Dict) -> Dict:
        headers = await self._fivepaisa_headers()
        creds = await self._get_my_credentials()
        body = {
            'head': {'requestCode': '5POrdReq'},
            'body': {
                'ClientCode': creds.get('client_code', ''),
                'OrderFor': 'P', 'Exchange': params.get('exchange', 'N'),
                'ExchangeType': 'D', 'ScripCode': params.get('instrument_token', ''),
                'Qty': params.get('quantity', 1), 'Price': params.get('price', 0),
                'BuySell': 'B' if params.get('transaction_type') == 'BUY' else 'S',
                'OrderType': params.get('order_type', 'MARKET'),
                'IsIntraday': True, 'RemoteOrderID': '',
            }
        }
        try:
            resp = requests.post(f"{FIVEPAISA_LOGIN_URL}/V1/OrderRequest", json=body, headers=headers, timeout=15)
            result = resp.json()
            if result.get('body', {}).get('Status') == 0:
                return {'status': 'success', 'order_id': str(result['body'].get('BrokerOrderID', '')), 'message': 'Order placed'}
            return {'status': 'error', 'message': result.get('body', {}).get('Message', 'Failed')}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def cancel_order(self, order_id: str) -> Dict:
        return {'status': 'error', 'message': 'Cancel via 5paisa app/web'}

    async def get_order_book(self) -> Dict:
        headers = await self._fivepaisa_headers()
        creds = await self._get_my_credentials()
        try:
            body = {'head': {'requestCode': '5POrdBkV2'}, 'body': {'ClientCode': creds.get('client_code', '')}}
            resp = requests.post(f"{FIVEPAISA_LOGIN_URL}/V2/OrderBook", json=body, headers=headers, timeout=10)
            result = resp.json()
            orders = [{'order_id': o.get('ExchOrderID'), 'symbol': o.get('ScripName'),
                       'transaction_type': 'BUY' if o.get('BuySell') == 'B' else 'SELL',
                       'quantity': int(o.get('Qty', 0)), 'price': float(o.get('Rate', 0)),
                       'average_price': float(o.get('Rate', 0)), 'status': o.get('OrderStatus'),
                       'order_type': '', 'product': '', 'placed_at': o.get('OrderDateTime'),
                      } for o in result.get('body', {}).get('OrderBookDetail', [])]
            return {'status': 'success', 'orders': orders}
        except Exception as e:
            return {'status': 'error', 'message': str(e), 'orders': []}

    async def check_connection(self) -> Dict:
        token = await self._get_access_token()
        if not token:
            return {'connected': False, 'message': 'No access token'}
        return {'connected': True, 'message': 'Connected to 5paisa'}

    async def get_trade_pnl(self, segment='EQ', year='') -> Dict:
        return {'status': 'error', 'message': 'Use 5paisa portal for P&L', 'data': {}}
