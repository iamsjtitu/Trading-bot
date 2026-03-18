import os
from typing import Dict
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class SettingsManager:
    def __init__(self, db):
        self.db = db
        self.settings_file = Path('/app/backend/bot_settings.json')
        
    async def get_settings(self) -> Dict:
        """Get all bot settings"""
        # Try to get from database first
        settings = await self.db.bot_settings.find_one({'type': 'main'})
        
        if not settings:
            # Create default settings
            settings = self._get_default_settings()
            await self.db.bot_settings.insert_one(settings)
        
        # Remove MongoDB _id
        if '_id' in settings:
            del settings['_id']
        
        return settings
    
    async def update_settings(self, new_settings: Dict) -> Dict:
        """Update bot settings"""
        try:
            # Validate settings
            validated = self._validate_settings(new_settings)
            
            # Update in database
            await self.db.bot_settings.update_one(
                {'type': 'main'},
                {'$set': validated},
                upsert=True
            )
            
            logger.info(f"Settings updated successfully")
            return {'status': 'success', 'settings': validated}
        
        except Exception as e:
            logger.error(f"Settings update error: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def _get_default_settings(self) -> Dict:
        """Get default settings"""
        return {
            'type': 'main',
            
            # Trading Mode
            'trading_mode': 'PAPER',  # PAPER or LIVE
            
            # Active Trading Instrument
            'trading_instrument': 'NIFTY50',
            
            # AI Model Settings
            'ai': {
                'emergent_llm_key': os.getenv('EMERGENT_LLM_KEY', 'sk-emergent-754BdB27f511c159cC'),
                'model': 'gpt-4.1-mini',
                'provider': 'openai'
            },
            
            # Broker Settings
            'broker': {
                'name': 'upstox',
                'api_key': '',
                'api_secret': '',
                'redirect_uri': '',
                'access_token': ''
            },
            
            # Risk Management
            'risk': {
                'initial_capital': 500000,
                'daily_limit': 100000,
                'max_per_trade': 20000,
                'stop_loss_pct': 25,
                'target_pct': 50,
                'risk_tolerance': 'medium'  # low, medium, high
            },
            
            # Auto Trading
            'auto_trading': {
                'auto_exit': True,
                'auto_entry': False,
                'auto_analysis': True,
                'analysis_interval_minutes': 5
            },
            
            # Trading Schedule
            'schedule': {
                'enabled': True,
                'trading_days': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                'start_time': '09:15',
                'end_time': '15:30',
                'timezone': 'Asia/Kolkata'
            },
            
            # News Settings
            'news': {
                'sources': ['demo'],  # demo, newsapi, alphavantage
                'newsapi_key': '',
                'alphavantage_key': '',
                'min_confidence': 60
            },
            
            # Notifications
            'notifications': {
                'enabled': True,
                'trade_execution': True,
                'high_confidence_signals': True,
                'risk_warnings': True,
                'daily_summary': True
            }
        }
    
    def _validate_settings(self, settings: Dict) -> Dict:
        """Validate settings before saving"""
        validated = settings.copy()
        
        # Ensure required fields
        if 'type' not in validated:
            validated['type'] = 'main'
        
        # Validate risk limits
        if 'risk' in validated:
            risk = validated['risk']
            if risk.get('daily_limit', 0) < risk.get('max_per_trade', 0):
                raise ValueError("Daily limit must be greater than max per trade")
            
            if risk.get('max_per_trade', 0) < 1000:
                raise ValueError("Max per trade must be at least ₹1,000")
        
        return validated
    
    async def is_trading_allowed(self) -> Dict:
        """Check if trading is allowed at current time"""
        from datetime import datetime
        import pytz
        
        settings = await self.get_settings()
        schedule = settings.get('schedule', {})
        
        if not schedule.get('enabled', True):
            return {'allowed': True, 'reason': 'Schedule disabled'}
        
        # Get current time in IST
        ist = pytz.timezone(schedule.get('timezone', 'Asia/Kolkata'))
        now = datetime.now(ist)
        
        # Check day
        current_day = now.strftime('%A')
        trading_days = schedule.get('trading_days', [])
        
        if current_day not in trading_days:
            return {'allowed': False, 'reason': f'No trading on {current_day}'}
        
        # Check time
        start_time = schedule.get('start_time', '09:15')
        end_time = schedule.get('end_time', '15:30')
        
        current_time = now.strftime('%H:%M')
        
        if not (start_time <= current_time <= end_time):
            return {'allowed': False, 'reason': f'Outside trading hours ({start_time}-{end_time})'}
        
        return {'allowed': True, 'reason': 'Trading time'}
