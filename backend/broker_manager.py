"""
Broker Manager - Handles active broker selection and routing.
Supports: Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL
"""
import logging
from typing import Dict
from broker_base import BrokerBase
from upstox_service import UpstoxService
from brokers.zerodha import ZerodhaBroker
from brokers.angelone import AngelOneBroker
from brokers.fivepaisa import FivePaisaBroker
from brokers.paytm_money import PaytmMoneyBroker
from brokers.iifl import IIFLBroker

logger = logging.getLogger(__name__)

BROKER_REGISTRY = {
    'upstox': UpstoxService,
    'zerodha': ZerodhaBroker,
    'angelone': AngelOneBroker,
    'fivepaisa': FivePaisaBroker,
    'paytm_money': PaytmMoneyBroker,
    'iifl': IIFLBroker,
}

BROKER_INFO = [
    {'id': 'upstox', 'name': 'Upstox', 'auth_type': 'oauth', 'fields': ['api_key', 'api_secret', 'redirect_uri'],
     'description': 'Popular discount broker with fast API', 'logo': 'upstox'},
    {'id': 'zerodha', 'name': 'Zerodha (Kite Connect)', 'auth_type': 'oauth', 'fields': ['api_key', 'api_secret'],
     'description': "India's largest discount broker", 'logo': 'zerodha'},
    {'id': 'angelone', 'name': 'Angel One (SmartAPI)', 'auth_type': 'credentials', 'fields': ['api_key', 'client_id', 'password'],
     'description': 'Full-service broker with SmartAPI', 'logo': 'angelone', 'needs_totp': True},
    {'id': 'fivepaisa', 'name': '5paisa', 'auth_type': 'oauth', 'fields': ['api_key', 'api_secret', 'redirect_uri'],
     'description': 'Budget-friendly broker with API access', 'logo': 'fivepaisa'},
    {'id': 'paytm_money', 'name': 'Paytm Money', 'auth_type': 'oauth', 'fields': ['api_key', 'api_secret'],
     'description': 'Paytm Money trading platform', 'logo': 'paytm'},
    {'id': 'iifl', 'name': 'IIFL Securities', 'auth_type': 'credentials', 'fields': ['api_key', 'api_secret'],
     'description': 'Full-service broker with blaze API', 'logo': 'iifl'},
]


class BrokerManager:
    def __init__(self, db):
        self.db = db
        self._brokers: Dict[str, BrokerBase] = {}
        self._active_broker_id = 'upstox'  # Default

    def _get_or_create_broker(self, broker_id: str) -> BrokerBase:
        if broker_id not in self._brokers:
            broker_class = BROKER_REGISTRY.get(broker_id)
            if broker_class:
                self._brokers[broker_id] = broker_class(self.db)
        return self._brokers.get(broker_id)

    @property
    def active_broker(self) -> BrokerBase:
        return self._get_or_create_broker(self._active_broker_id)

    @property
    def active_broker_id(self) -> str:
        return self._active_broker_id

    async def set_active_broker(self, broker_id: str) -> Dict:
        if broker_id not in BROKER_REGISTRY:
            return {'status': 'error', 'message': f'Unknown broker: {broker_id}'}
        self._active_broker_id = broker_id
        # Persist to DB
        await self.db.bot_settings.update_one(
            {'type': 'main'},
            {'$set': {'active_broker': broker_id}},
            upsert=True,
        )
        logger.info(f"Active broker set to: {broker_id}")
        return {'status': 'success', 'active_broker': broker_id}

    async def load_active_broker(self):
        """Load active broker from DB on startup"""
        settings = await self.db.bot_settings.find_one({'type': 'main'}, {'_id': 0})
        if settings:
            bid = settings.get('active_broker', 'upstox')
            if bid in BROKER_REGISTRY:
                self._active_broker_id = bid
                logger.info(f"Loaded active broker: {bid}")

    def get_all_brokers(self) -> list:
        return BROKER_INFO

    def get_active_info(self) -> Dict:
        info = next((b for b in BROKER_INFO if b['id'] == self._active_broker_id), BROKER_INFO[0])
        return {**info, 'active': True}
