import os
from typing import Dict, List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

class TradingEngine:
    def __init__(self, db):
        self.db = db
        self.initial_capital = float(os.getenv('INITIAL_CAPITAL', 500000))
        self.max_trade_amount = float(os.getenv('MAX_TRADE_AMOUNT', 20000))
        self.daily_limit = float(os.getenv('DAILY_LIMIT', 100000))
        self.risk_tolerance = os.getenv('RISK_TOLERANCE', 'medium')
        
        # Risk parameters based on tolerance
        self.risk_params = {
            'low': {'stop_loss_pct': 15, 'target_pct': 30, 'max_position_size': 0.03},
            'medium': {'stop_loss_pct': 25, 'target_pct': 50, 'max_position_size': 0.05},
            'high': {'stop_loss_pct': 35, 'target_pct': 70, 'max_position_size': 0.07}
        }
    
    async def initialize_portfolio(self):
        """Initialize paper trading portfolio"""
        existing = await self.db.portfolio.find_one({'type': 'paper'})
        if not existing:
            portfolio = {
                'type': 'paper',
                'initial_capital': self.initial_capital,
                'current_capital': self.initial_capital,
                'invested_amount': 0,
                'available_capital': self.initial_capital,
                'total_pnl': 0,
                'daily_pnl': 0,
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'active_positions': [],
                'created_at': datetime.now(timezone.utc).isoformat(),
                'last_updated': datetime.now(timezone.utc).isoformat()
            }
            await self.db.portfolio.insert_one(portfolio)
            logger.info(f"Portfolio initialized with capital: ₹{self.initial_capital}")
    
    async def generate_trading_signal(self, news_with_sentiment: Dict) -> Optional[Dict]:
        """Generate trading signal from news sentiment"""
        try:
            sentiment = news_with_sentiment.get('sentiment_analysis', {})
            
            # Check if confidence is high enough
            confidence = sentiment.get('confidence', 0)
            if confidence < 60:  # Only trade on confident signals
                logger.info(f"Confidence {confidence} too low, skipping signal")
                return None
            
            trading_signal = sentiment.get('trading_signal', 'HOLD')
            if trading_signal == 'HOLD':
                return None
            
            # Determine signal type
            signal_type = 'CALL' if trading_signal == 'BUY_CALL' else 'PUT'
            
            # Get current portfolio status
            portfolio = await self.db.portfolio.find_one({'type': 'paper'})
            if not portfolio:
                await self.initialize_portfolio()
                portfolio = await self.db.portfolio.find_one({'type': 'paper'})
            
            available = portfolio['available_capital']
            
            # Check daily limit
            today_trades = await self._get_today_trade_value()
            if today_trades >= self.daily_limit:
                logger.info(f"Daily limit ₹{self.daily_limit} reached")
                return None
            
            # Calculate position size
            risk_params = self.risk_params[self.risk_tolerance]
            position_size = min(
                self.max_trade_amount,
                available * risk_params['max_position_size'],
                self.daily_limit - today_trades
            )
            
            if position_size < 1000:  # Minimum trade size
                logger.info(f"Position size ₹{position_size} too small")
                return None
            
            # For paper trading, assume Nifty 50 options
            # In real trading, this would come from broker API
            base_price = 24000  # Demo Nifty level
            option_premium = 150  # Demo option price
            
            quantity = int(position_size / option_premium)
            if quantity == 0:
                return None
            
            actual_amount = quantity * option_premium
            
            # Calculate targets
            stop_loss_price = option_premium * (1 - risk_params['stop_loss_pct'] / 100)
            target_price = option_premium * (1 + risk_params['target_pct'] / 100)
            
            signal = {
                'id': str(uuid.uuid4()),
                'signal_type': signal_type,
                'symbol': 'NIFTY50',
                'strike_price': base_price + (500 if signal_type == 'CALL' else -500),
                'option_premium': option_premium,
                'quantity': quantity,
                'investment_amount': actual_amount,
                'entry_price': option_premium,
                'stop_loss': stop_loss_price,
                'target': target_price,
                'confidence': confidence,
                'sentiment': sentiment.get('sentiment'),
                'reason': sentiment.get('reason'),
                'news_id': news_with_sentiment.get('id'),
                'status': 'ACTIVE',
                'created_at': datetime.now(timezone.utc).isoformat(),
                'expires_at': (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            }
            
            # Save signal
            await self.db.trading_signals.insert_one(signal)
            
            # Execute paper trade
            await self._execute_paper_trade(signal)
            
            return signal
            
        except Exception as e:
            logger.error(f"Signal generation error: {e}")
            return None
    
    async def _execute_paper_trade(self, signal: Dict):
        """Execute paper trade"""
        try:
            trade = {
                'id': str(uuid.uuid4()),
                'signal_id': signal['id'],
                'trade_type': signal['signal_type'],
                'symbol': signal['symbol'],
                'entry_time': datetime.now(timezone.utc).isoformat(),
                'entry_price': signal['entry_price'],
                'quantity': signal['quantity'],
                'investment': signal['investment_amount'],
                'stop_loss': signal['stop_loss'],
                'target': signal['target'],
                'status': 'OPEN',
                'exit_time': None,
                'exit_price': None,
                'pnl': 0,
                'pnl_percentage': 0
            }
            
            await self.db.paper_trades.insert_one(trade)
            
            # Update portfolio
            portfolio = await self.db.portfolio.find_one({'type': 'paper'})
            
            new_invested = portfolio['invested_amount'] + signal['investment_amount']
            new_available = portfolio['available_capital'] - signal['investment_amount']
            
            active_positions = portfolio.get('active_positions', [])
            active_positions.append(trade['id'])
            
            await self.db.portfolio.update_one(
                {'type': 'paper'},
                {
                    '$set': {
                        'invested_amount': new_invested,
                        'available_capital': new_available,
                        'active_positions': active_positions,
                        'last_updated': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            logger.info(f"Paper trade executed: {signal['signal_type']} @ ₹{signal['entry_price']} x {signal['quantity']}")
            
        except Exception as e:
            logger.error(f"Paper trade execution error: {e}")
    
    async def _get_today_trade_value(self) -> float:
        """Get total trade value for today"""
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        trades = await self.db.paper_trades.find({
            'entry_time': {'$gte': today_start.isoformat()}
        }).to_list(1000)
        
        total = sum(trade.get('investment', 0) for trade in trades)
        return total
    
    async def get_portfolio_summary(self) -> Dict:
        """Get current portfolio summary"""
        portfolio = await self.db.portfolio.find_one({'type': 'paper'})
        if not portfolio:
            await self.initialize_portfolio()
            portfolio = await self.db.portfolio.find_one({'type': 'paper'})
        
        # Calculate current P&L from open positions
        open_trades = await self.db.paper_trades.find({'status': 'OPEN'}).to_list(1000)
        current_value = portfolio['available_capital']
        
        # In real scenario, would fetch current option prices
        # For demo, simulate some profit/loss
        for trade in open_trades:
            # Simulate 5-15% random movement
            import random
            price_change = random.uniform(-0.15, 0.15)
            current_price = trade['entry_price'] * (1 + price_change)
            position_value = current_price * trade['quantity']
            current_value += position_value
        
        unrealized_pnl = current_value - portfolio['initial_capital']
        
        return {
            'initial_capital': portfolio['initial_capital'],
            'current_value': current_value,
            'available_capital': portfolio['available_capital'],
            'invested_amount': portfolio['invested_amount'],
            'total_pnl': portfolio['total_pnl'],
            'unrealized_pnl': unrealized_pnl,
            'total_trades': portfolio['total_trades'],
            'active_positions': len(open_trades),
            'winning_trades': portfolio['winning_trades'],
            'losing_trades': portfolio['losing_trades']
        }
