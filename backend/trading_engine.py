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
        
        # Instrument configurations
        self.instruments = {
            'NIFTY50': {
                'label': 'NIFTY 50',
                'lot_size': 25,
                'base_price': 24000,
                'strike_step': 50,
                'option_premium': 150,
                'exchange': 'NSE',
            },
            'BANKNIFTY': {
                'label': 'BANK NIFTY',
                'lot_size': 15,
                'base_price': 52000,
                'strike_step': 100,
                'option_premium': 300,
                'exchange': 'NSE',
            },
            'FINNIFTY': {
                'label': 'FIN NIFTY',
                'lot_size': 25,
                'base_price': 23800,
                'strike_step': 50,
                'option_premium': 120,
                'exchange': 'NSE',
            },
            'MIDCPNIFTY': {
                'label': 'MIDCAP NIFTY',
                'lot_size': 50,
                'base_price': 12000,
                'strike_step': 25,
                'option_premium': 80,
                'exchange': 'NSE',
            },
        }
        self.active_instrument = 'NIFTY50'
        
        # Auto-trading settings
        self.auto_exit_enabled = True
        self.auto_entry_enabled = False
        self.custom_target_pct = None  # None means use default, or set custom like 10
        self.custom_stoploss_pct = None
    
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
            
            # Get instrument config
            inst = self.instruments.get(self.active_instrument, self.instruments['NIFTY50'])
            base_price = inst['base_price']
            option_premium = inst['option_premium']
            strike_step = inst['strike_step']
            
            quantity = max(inst['lot_size'], int(position_size / option_premium))
            # Round to lot size
            quantity = (quantity // inst['lot_size']) * inst['lot_size']
            if quantity == 0:
                quantity = inst['lot_size']
            
            actual_amount = quantity * option_premium
            if actual_amount > position_size:
                return None
            
            # Calculate targets
            stop_loss_price = option_premium * (1 - risk_params['stop_loss_pct'] / 100)
            target_price = option_premium * (1 + risk_params['target_pct'] / 100)
            
            signal = {
                'id': str(uuid.uuid4()),
                'signal_type': signal_type,
                'symbol': self.active_instrument,
                'instrument': self.active_instrument,
                'strike_price': base_price + (strike_step * 5 if signal_type == 'CALL' else -strike_step * 5),
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
        
        # Calculate current P&L from open positions with live simulation
        open_trades = await self.db.paper_trades.find({'status': 'OPEN'}).to_list(1000)
        current_value = portfolio['available_capital']
        
        # Simulate price movements for demo
        import random
        for trade in open_trades:
            # Simulate 5-15% random movement
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
    
    async def get_trade_with_live_pnl(self, trade: Dict) -> Dict:
        """Calculate live P&L for a trade"""
        import random
        
        # Simulate current price movement
        price_change = random.uniform(-0.15, 0.15)
        current_price = trade['entry_price'] * (1 + price_change)
        
        # Calculate P&L
        if trade['status'] == 'OPEN':
            current_value = current_price * trade['quantity']
            investment = trade['investment']
            pnl = current_value - investment
            pnl_percentage = (pnl / investment) * 100
            
            trade['current_price'] = round(current_price, 2)
            trade['current_value'] = round(current_value, 2)
            trade['live_pnl'] = round(pnl, 2)
            trade['pnl_percentage'] = round(pnl_percentage, 2)
        
        return trade
    
    async def check_and_execute_exits(self) -> Dict:
        """Check all open trades and auto-exit if target/stop-loss hit"""
        if not self.auto_exit_enabled:
            return {'exits': 0, 'new_trades': 0}
        
        import random
        
        open_trades = await self.db.paper_trades.find({'status': 'OPEN'}).to_list(1000)
        exits_count = 0
        new_trades_count = 0
        exit_details = []
        
        for trade in open_trades:
            # Simulate current price
            price_change = random.uniform(-0.15, 0.15)
            current_price = trade['entry_price'] * (1 + price_change)
            
            # Get target and stop-loss percentages
            target_pct = self.custom_target_pct if self.custom_target_pct else self.risk_params[self.risk_tolerance]['target_pct']
            stoploss_pct = self.custom_stoploss_pct if self.custom_stoploss_pct else self.risk_params[self.risk_tolerance]['stop_loss_pct']
            
            # Calculate target and stop-loss prices
            target_price = trade['entry_price'] * (1 + target_pct / 100)
            stoploss_price = trade['entry_price'] * (1 - stoploss_pct / 100)
            
            should_exit = False
            exit_reason = ''
            
            # Check if target hit
            if current_price >= target_price:
                should_exit = True
                exit_reason = 'TARGET_HIT'
            
            # Check if stop-loss hit
            elif current_price <= stoploss_price:
                should_exit = True
                exit_reason = 'STOPLOSS_HIT'
            
            if should_exit:
                # Calculate P&L
                current_value = current_price * trade['quantity']
                investment = trade['investment']
                pnl = current_value - investment
                pnl_percentage = (pnl / investment) * 100
                
                # Close the trade
                await self.db.paper_trades.update_one(
                    {'id': trade['id']},
                    {
                        '$set': {
                            'status': 'CLOSED',
                            'exit_time': datetime.now(timezone.utc).isoformat(),
                            'exit_price': current_price,
                            'pnl': pnl,
                            'pnl_percentage': pnl_percentage,
                            'exit_reason': exit_reason
                        }
                    }
                )
                
                # Update portfolio
                portfolio = await self.db.portfolio.find_one({'type': 'paper'})
                new_available = portfolio['available_capital'] + current_value
                new_invested = portfolio['invested_amount'] - investment
                new_total_pnl = portfolio['total_pnl'] + pnl
                new_total_trades = portfolio['total_trades'] + 1
                
                winning = portfolio['winning_trades']
                losing = portfolio['losing_trades']
                if pnl > 0:
                    winning += 1
                else:
                    losing += 1
                
                await self.db.portfolio.update_one(
                    {'type': 'paper'},
                    {
                        '$set': {
                            'available_capital': new_available,
                            'invested_amount': new_invested,
                            'total_pnl': new_total_pnl,
                            'total_trades': new_total_trades,
                            'winning_trades': winning,
                            'losing_trades': losing,
                            'last_updated': datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
                
                # Update signal status
                await self.db.trading_signals.update_one(
                    {'id': trade['signal_id']},
                    {'$set': {'status': 'CLOSED'}}
                )
                
                exits_count += 1
                exit_details.append({
                    'trade_id': trade['id'],
                    'symbol': trade['symbol'],
                    'type': trade['trade_type'],
                    'entry': trade['entry_price'],
                    'exit': current_price,
                    'pnl': pnl,
                    'pnl_pct': pnl_percentage,
                    'reason': exit_reason
                })
                
                logger.info(f"Auto-exited trade: {trade['trade_type']} {trade['symbol']} @ ₹{current_price} | P&L: ₹{pnl} ({exit_reason})")
                
                # If auto-entry enabled, generate new trade
                if self.auto_entry_enabled and exit_reason == 'TARGET_HIT':
                    # Get latest high-confidence news for new signal
                    latest_news = await self.db.news_articles.find(
                        {
                            'sentiment_analysis.confidence': {'$gte': 60},
                            'sentiment_analysis.trading_signal': {'$in': ['BUY_CALL', 'BUY_PUT']}
                        },
                        {"_id": 0}
                    ).sort('created_at', -1).limit(1).to_list(1)
                    
                    # If no high-confidence news, try any recent news
                    if not latest_news or len(latest_news) == 0:
                        latest_news = await self.db.news_articles.find(
                            {},
                            {"_id": 0}
                        ).sort('created_at', -1).limit(1).to_list(1)
                    
                    if latest_news and len(latest_news) > 0:
                        new_signal = await self.generate_trading_signal(latest_news[0])
                        if new_signal:
                            new_trades_count += 1
                            logger.info(f"Auto-generated new trade after profitable exit: {new_signal['signal_type']} {new_signal['symbol']}")
                        else:
                            logger.info(f"Could not generate new signal - confidence too low or daily limit reached")
                    else:
                        logger.info(f"No news available for auto-entry, skipping new trade generation")
        
        return {
            'exits': exits_count,
            'new_trades': new_trades_count,
            'details': exit_details
        }
