"""
Abstract Broker Base Class - Common interface for all broker integrations.
All broker implementations must extend this class.
"""
import logging
from abc import ABC, abstractmethod
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class BrokerBase(ABC):
    """Abstract base class for broker integrations"""
    
    BROKER_ID = 'base'
    BROKER_NAME = 'Base Broker'
    
    def __init__(self, db):
        self.db = db

    async def _get_broker_settings(self) -> Dict:
        settings = await self.db.bot_settings.find_one({'type': 'main'}, {'_id': 0})
        if settings and 'broker' in settings:
            return settings['broker']
        return {}

    def _cred_key(self, field: str) -> str:
        """Get broker-specific credential key, e.g. 'upstox_api_key'"""
        return f'{self.BROKER_ID}_{field}'

    async def _get_my_credentials(self) -> Dict:
        """Get THIS broker's credentials (api_key, api_secret, token, etc.)"""
        broker = await self._get_broker_settings()
        prefix = f'{self.BROKER_ID}_'
        creds = {}
        for key, val in broker.items():
            if key.startswith(prefix):
                creds[key[len(prefix):]] = val
        # Fallback: if no broker-specific keys found, check legacy shared keys
        if not creds.get('api_key') and broker.get('api_key'):
            # Only for the FIRST/original broker (upstox), use legacy keys
            if self.BROKER_ID == 'upstox':
                creds.setdefault('api_key', broker.get('api_key', ''))
                creds.setdefault('api_secret', broker.get('api_secret', ''))
                creds.setdefault('token', broker.get('access_token', ''))
        creds['redirect_uri'] = broker.get('redirect_uri', '')
        return creds

    async def _save_token(self, token: str, extra: Dict = None):
        update = {
            f'broker.{self._cred_key("token")}': token,
            f'broker.{self._cred_key("token_timestamp")}': __import__('datetime').datetime.now(
                __import__('datetime').timezone.utc
            ).isoformat(),
        }
        # Also set legacy field for backward compat
        update['broker.access_token'] = token
        if extra:
            for k, v in extra.items():
                update[f'broker.{self._cred_key(k)}'] = v
        await self.db.bot_settings.update_one({'type': 'main'}, {'$set': update})

    async def _get_access_token(self) -> Optional[str]:
        creds = await self._get_my_credentials()
        return creds.get('token', '') or None

    # ==================== Auth ====================
    @abstractmethod
    async def get_auth_url(self) -> Dict:
        """Generate OAuth/login URL"""
        pass

    @abstractmethod
    async def exchange_code_for_token(self, auth_code: str) -> Dict:
        """Exchange auth code for access token"""
        pass

    # ==================== Market Data ====================
    @abstractmethod
    async def get_live_market_data(self) -> Dict:
        """Fetch live index prices"""
        pass

    @abstractmethod
    async def get_option_chain(self, instrument: str, expiry: str = '') -> Dict:
        """Fetch option chain for an instrument"""
        pass

    # ==================== Portfolio ====================
    @abstractmethod
    async def get_portfolio(self) -> Dict:
        """Fetch portfolio (funds + positions)"""
        pass

    @abstractmethod
    async def get_profile(self) -> Dict:
        """Get user profile"""
        pass

    # ==================== Orders ====================
    @abstractmethod
    async def place_order(self, params: Dict) -> Dict:
        """Place an order"""
        pass

    @abstractmethod
    async def cancel_order(self, order_id: str) -> Dict:
        """Cancel an order"""
        pass

    @abstractmethod
    async def get_order_book(self) -> Dict:
        """Get today's order book"""
        pass

    # ==================== Connection ====================
    @abstractmethod
    async def check_connection(self) -> Dict:
        """Check if broker connection is active"""
        pass

    @abstractmethod
    async def get_trade_pnl(self, segment: str = 'EQ', year: str = '') -> Dict:
        """Get P&L report"""
        pass

    def get_info(self) -> Dict:
        """Get broker info for frontend display"""
        return {
            'id': self.BROKER_ID,
            'name': self.BROKER_NAME,
        }
