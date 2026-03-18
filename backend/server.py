from fastapi import FastAPI, APIRouter, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx

# Import our services
from news_service import NewsService
from tax_service import calculate_tax_report, generate_excel_report, generate_pdf_report
from sentiment_service import SentimentService
from trading_engine import TradingEngine
from settings_manager import SettingsManager
from upstox_service import UpstoxService

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database connection - supports both MongoDB and Local file DB
mongo_url = os.environ.get('MONGO_URL', '')
if mongo_url:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'ai_trading_bot')]
    logging.info("Using MongoDB")
else:
    from local_db import get_local_db
    db = get_local_db()
    logging.info("Using Local File DB")

# Initialize services
news_service = NewsService(db)
sentiment_service = SentimentService()
trading_engine = TradingEngine(db)
settings_manager = SettingsManager(db)
upstox_service = UpstoxService(db)

# Create the main app without a prefix
app = FastAPI(title="AI Trading Bot API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Models ====================

class NewsArticle(BaseModel):
    id: str
    title: str
    description: str
    source: str
    url: str
    published_at: str
    sentiment_analysis: Optional[Dict] = None
    created_at: str

class TradingSignal(BaseModel):
    id: str
    signal_type: str  # CALL or PUT
    symbol: str
    strike_price: float
    option_premium: float
    quantity: int
    investment_amount: float
    entry_price: float
    stop_loss: float
    target: float
    confidence: int
    sentiment: str
    reason: str
    status: str
    created_at: str

class PaperTrade(BaseModel):
    id: str
    signal_id: str
    trade_type: str
    symbol: str
    entry_time: str
    entry_price: float
    quantity: int
    investment: float
    stop_loss: float
    target: float
    status: str
    exit_time: Optional[str] = None
    exit_price: Optional[float] = None
    pnl: float
    pnl_percentage: float

class Portfolio(BaseModel):
    initial_capital: float
    current_value: float
    available_capital: float
    invested_amount: float
    total_pnl: float
    unrealized_pnl: float
    total_trades: int
    active_positions: int
    winning_trades: int
    losing_trades: int

# ==================== Routes ====================

@api_router.get("/")
async def root():
    return {
        "message": "AI-Powered Options Trading Bot API",
        "version": "1.0.0",
        "status": "active"
    }

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": {
            "news": "active",
            "sentiment": "active",
            "trading": "active"
        }
    }

@api_router.post("/initialize")
async def initialize_system():
    """Initialize the trading system"""
    try:
        await trading_engine.initialize_portfolio()
        return {
            "status": "success",
            "message": "Trading system initialized",
            "capital": trading_engine.initial_capital
        }
    except Exception as e:
        logger.error(f"Initialization error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/news/fetch")
async def fetch_news(background_tasks: BackgroundTasks):
    """Fetch and analyze latest news"""
    try:
        # Fetch news
        news_articles = await news_service.fetch_market_news(max_articles=10)
        
        processed_articles = []
        
        # Deduplicate: check against recent articles in DB
        existing_titles = set()
        try:
            recent = await db.news_articles.find({}, {"title": 1, "_id": 0}).sort('created_at', -1).limit(100).to_list(100)
            existing_titles = {(a.get('title', '') or '').lower().strip() for a in recent}
        except Exception:
            pass
        seen_titles = set()
        
        for article in news_articles:
            norm_title = (article.get('title', '') or '').lower().strip()
            if not norm_title or norm_title in seen_titles or norm_title in existing_titles:
                continue
            seen_titles.add(norm_title)
            # Generate unique ID
            article_id = str(uuid.uuid4())
            
            # Analyze sentiment
            sentiment = await sentiment_service.analyze_news_sentiment(article)
            
            # Store in database (with _id excluded from response)
            news_doc = {
                'id': article_id,
                'title': article['title'],
                'description': article['description'],
                'content': article.get('content', ''),
                'source': article['source'],
                'url': article['url'],
                'published_at': article['published_at'],
                'sentiment_analysis': sentiment,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            # Insert and remove MongoDB _id
            result = await db.news_articles.insert_one(news_doc.copy())
            
            # Generate trading signal if conditions met
            signal = await trading_engine.generate_trading_signal(news_doc)
            
            # Create clean dict without _id
            clean_article = {
                'id': article_id,
                'title': article['title'],
                'description': article['description'],
                'source': article['source'],
                'url': article['url'],
                'published_at': article['published_at'],
                'sentiment_analysis': sentiment,
                'created_at': news_doc['created_at'],
                'signal_generated': signal is not None
            }
            
            processed_articles.append(clean_article)
        
        return {
            "status": "success",
            "articles_processed": len(processed_articles),
            "articles": processed_articles
        }
        
    except Exception as e:
        logger.error(f"News fetch error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/news/latest")
async def get_latest_news(limit: int = 20):
    """Get latest news with sentiment"""
    try:
        news = await db.news_articles.find(
            {},
            {"_id": 0}
        ).sort('created_at', -1).limit(limit).to_list(limit)
        
        return {
            "status": "success",
            "count": len(news),
            "news": news
        }
    except Exception as e:
        logger.error(f"Get news error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/signals/latest")
async def get_latest_signals(limit: int = 10):
    """Get latest trading signals"""
    try:
        signals = await db.trading_signals.find(
            {},
            {"_id": 0}
        ).sort('created_at', -1).limit(limit).to_list(limit)
        
        return {
            "status": "success",
            "count": len(signals),
            "signals": signals
        }
    except Exception as e:
        logger.error(f"Get signals error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/signals/active")
async def get_active_signals():
    """Get active trading signals"""
    try:
        signals = await db.trading_signals.find(
            {"status": "ACTIVE"},
            {"_id": 0}
        ).to_list(100)
        
        return {
            "status": "success",
            "count": len(signals),
            "signals": signals
        }
    except Exception as e:
        logger.error(f"Get active signals error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/trades/active")
async def get_active_trades():
    """Get active paper trades with live P&L"""
    try:
        trades = await db.paper_trades.find(
            {"status": "OPEN"},
            {"_id": 0}
        ).to_list(100)
        
        # Add live P&L to each trade
        trades_with_pnl = []
        for trade in trades:
            trade_with_pnl = await trading_engine.get_trade_with_live_pnl(trade)
            trades_with_pnl.append(trade_with_pnl)
        
        return {
            "status": "success",
            "count": len(trades_with_pnl),
            "trades": trades_with_pnl
        }
    except Exception as e:
        logger.error(f"Get active trades error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/trades/today")
async def get_today_trades_summary():
    """Get today's trades summary including closed trades"""
    try:
        # Get today's start time
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Get all trades from today (both open and closed)
        all_trades = await db.paper_trades.find({
            'entry_time': {'$gte': today_start.isoformat()}
        }).to_list(1000)
        
        # Calculate today's P&L from closed trades
        closed_trades = [t for t in all_trades if t.get('status') == 'CLOSED']
        today_pnl = sum(trade.get('pnl', 0) for trade in closed_trades)
        
        # Get active trades count
        open_trades = [t for t in all_trades if t.get('status') == 'OPEN']
        
        return {
            "status": "success",
            "total_trades_today": len(all_trades),
            "closed_trades": len(closed_trades),
            "open_trades": len(open_trades),
            "today_pnl": today_pnl,
            "today_invested": sum(t.get('investment', 0) for t in all_trades)
        }
    except Exception as e:
        logger.error(f"Get today trades error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/trades/history")
async def get_trade_history(limit: int = 200, trade_type: str = None, status: str = None, date_from: str = None, date_to: str = None, sort_by: str = 'entry_time', sort_order: str = 'desc'):
    """Get trade history with advanced filtering"""
    try:
        query = {}
        if trade_type and trade_type != 'all':
            query['trade_type'] = trade_type
        if status and status != 'all':
            query['status'] = status
        if date_from:
            query.setdefault('entry_time', {})['$gte'] = date_from
        if date_to:
            query.setdefault('entry_time', {})['$lte'] = date_to + 'T23:59:59'

        sort_dir = -1 if sort_order == 'desc' else 1
        valid_sorts = {'entry_time': 'entry_time', 'pnl': 'pnl', 'investment': 'investment', 'pnl_percentage': 'pnl_percentage'}
        sort_field = valid_sorts.get(sort_by, 'entry_time')

        trades = await db.paper_trades.find(query, {"_id": 0}).sort(sort_field, sort_dir).limit(limit).to_list(limit)

        # Calculate summary stats
        closed = [t for t in trades if t.get('status') == 'CLOSED']
        wins = [t for t in closed if (t.get('pnl') or 0) > 0]
        losses = [t for t in closed if (t.get('pnl') or 0) <= 0]
        total_pnl = sum(t.get('pnl', 0) for t in closed)
        avg_win = sum(t.get('pnl', 0) for t in wins) / len(wins) if wins else 0
        avg_loss = sum(t.get('pnl', 0) for t in losses) / len(losses) if losses else 0
        total_investment = sum(t.get('investment', 0) for t in trades)

        summary = {
            'total_trades': len(trades),
            'closed_trades': len(closed),
            'open_trades': len([t for t in trades if t.get('status') == 'OPEN']),
            'winning_trades': len(wins),
            'losing_trades': len(losses),
            'win_rate': (len(wins) / max(len(closed), 1)) * 100,
            'total_pnl': round(total_pnl, 2),
            'avg_win': round(avg_win, 2),
            'avg_loss': round(avg_loss, 2),
            'total_investment': round(total_investment, 2),
            'best_trade': round(max((t.get('pnl', 0) for t in closed), default=0), 2),
            'worst_trade': round(min((t.get('pnl', 0) for t in closed), default=0), 2),
        }

        return {
            "status": "success",
            "count": len(trades),
            "trades": trades,
            "summary": summary
        }
    except Exception as e:
        logger.error(f"Get trade history error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/daily-summary")
async def get_daily_summary():
    """Get daily P&L summary for today"""
    try:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        all_trades = await db.paper_trades.find({'entry_time': {'$gte': today_start.isoformat()}}, {"_id": 0}).to_list(1000)
        closed = [t for t in all_trades if t.get('status') == 'CLOSED']
        open_trades = [t for t in all_trades if t.get('status') == 'OPEN']
        wins = [t for t in closed if (t.get('pnl') or 0) > 0]
        total_pnl = sum(t.get('pnl', 0) for t in closed)
        total_invested = sum(t.get('investment', 0) for t in all_trades)

        # Get today's signals
        signals = await db.trading_signals.find({'created_at': {'$gte': today_start.isoformat()}}, {"_id": 0}).to_list(1000)
        news_count = await db.news_articles.count_documents({'created_at': {'$gte': today_start.isoformat()}})

        summary = {
            'date': today_start.strftime('%Y-%m-%d'),
            'total_trades': len(all_trades),
            'closed_trades': len(closed),
            'open_trades': len(open_trades),
            'winning_trades': len(wins),
            'losing_trades': len(closed) - len(wins),
            'win_rate': round((len(wins) / max(len(closed), 1)) * 100, 1),
            'total_pnl': round(total_pnl, 2),
            'total_invested': round(total_invested, 2),
            'signals_generated': len(signals),
            'news_analyzed': news_count,
            'best_trade': round(max((t.get('pnl', 0) for t in closed), default=0), 2),
            'worst_trade': round(min((t.get('pnl', 0) for t in closed), default=0), 2),
        }
        return {"status": "success", "summary": summary}
    except Exception as e:
        logger.error(f"Daily summary error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.post("/telegram/send-daily-summary")
async def send_daily_summary_telegram():
    """Send daily P&L summary to Telegram"""
    try:
        settings = await settings_manager.get_settings()
        telegram = settings.get('telegram', {})
        if not telegram.get('enabled') or not telegram.get('bot_token') or not telegram.get('chat_id'):
            return {"status": "error", "message": "Telegram not configured. Enable it in Settings > Advanced > Telegram."}

        # Get daily summary data
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        all_trades = await db.paper_trades.find({'entry_time': {'$gte': today_start.isoformat()}}).to_list(1000)
        closed = [t for t in all_trades if t.get('status') == 'CLOSED']
        open_trades = [t for t in all_trades if t.get('status') == 'OPEN']
        wins = [t for t in closed if (t.get('pnl') or 0) > 0]
        total_pnl = sum(t.get('pnl', 0) for t in closed)

        portfolio = await trading_engine.get_portfolio_summary()

        pnl_emoji = "+" if total_pnl >= 0 else ""
        mode = settings.get('trading_mode', 'PAPER')

        message = f"""*AI Trading Bot - Daily Summary*
*Date:* {today_start.strftime('%d %b %Y')}
*Mode:* {mode}

*Today's Performance:*
Total Trades: {len(all_trades)}
Closed: {len(closed)} | Open: {len(open_trades)}
Winning: {len(wins)} | Losing: {len(closed) - len(wins)}
Win Rate: {round((len(wins) / max(len(closed), 1)) * 100, 1)}%

*P&L: {pnl_emoji}{round(total_pnl):,}*

*Portfolio:*
Value: {round(portfolio.get('current_value', 0)):,}
Total P&L: {round(portfolio.get('total_pnl', 0)):,}

_Sent automatically by AI Trading Bot_"""

        # Send via Telegram API
        telegram_url = f"https://api.telegram.org/bot{telegram['bot_token']}/sendMessage"
        async with httpx.AsyncClient() as client:
            resp = await client.post(telegram_url, json={
                'chat_id': telegram['chat_id'],
                'text': message,
                'parse_mode': 'Markdown',
            }, timeout=15)
            data = resp.json()
            if data.get('ok'):
                return {"status": "success", "message": "Daily summary sent to Telegram!"}
            else:
                return {"status": "error", "message": f"Telegram API error: {data.get('description', 'Unknown')}"}

    except Exception as e:
        logger.error(f"Telegram summary error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/portfolio", response_model=Portfolio)
async def get_portfolio():
    """Get portfolio summary"""
    try:
        summary = await trading_engine.get_portfolio_summary()
        return summary
    except Exception as e:
        logger.error(f"Get portfolio error: {e}")
        return {
            "initial_capital": 500000,
            "current_value": 500000,
            "available_capital": 500000,
            "invested_amount": 0,
            "total_pnl": 0,
            "unrealized_pnl": 0,
            "total_trades": 0,
            "active_positions": 0,
            "winning_trades": 0,
            "losing_trades": 0
        }

@api_router.get("/stats")
async def get_stats():
    """Get overall statistics"""
    try:
        total_news = await db.news_articles.count_documents({})
        total_signals = await db.trading_signals.count_documents({})
        active_signals = await db.trading_signals.count_documents({"status": "ACTIVE"})
        total_trades = await db.paper_trades.count_documents({})
        open_trades = await db.paper_trades.count_documents({"status": "OPEN"})
        
        portfolio = await trading_engine.get_portfolio_summary()
        
        return {
            "status": "success",
            "stats": {
                "total_news_analyzed": total_news,
                "total_signals_generated": total_signals,
                "active_signals": active_signals,
                "total_trades": total_trades,
                "open_trades": open_trades,
                "portfolio_value": portfolio['current_value'],
                "total_pnl": portfolio['total_pnl'],
                "win_rate": (portfolio['winning_trades'] / max(portfolio['total_trades'], 1)) * 100
            }
        }
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.post("/auto-exit/check")
async def check_auto_exits():
    """Check and execute auto-exits for trades"""
    try:
        result = await trading_engine.check_and_execute_exits()
        
        # If auto-entry is ON but no new trades generated, trigger news analysis
        if (trading_engine.auto_entry_enabled and 
            result['exits'] > 0 and 
            result['new_trades'] == 0):
            # Check if we need fresh news
            recent_news_count = await db.news_articles.count_documents({
                'created_at': {'$gte': (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()}
            })
            
            if recent_news_count == 0:
                logger.info("No recent news for auto-entry, will wait for next news analysis cycle")
        
        return {
            "status": "success",
            "exits_executed": result['exits'],
            "new_trades_generated": result['new_trades'],
            "details": result.get('details', [])
        }
    except Exception as e:
        logger.error(f"Auto-exit check error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.post("/auto-settings/update")
async def update_auto_settings(settings: dict):
    """Update auto-trading settings"""
    try:
        if 'auto_exit' in settings:
            trading_engine.auto_exit_enabled = settings['auto_exit']
        if 'auto_entry' in settings:
            trading_engine.auto_entry_enabled = settings['auto_entry']
        if 'target_pct' in settings:
            trading_engine.custom_target_pct = settings['target_pct']
        if 'stoploss_pct' in settings:
            trading_engine.custom_stoploss_pct = settings['stoploss_pct']
        
        return {
            "status": "success",
            "settings": {
                "auto_exit": trading_engine.auto_exit_enabled,
                "auto_entry": trading_engine.auto_entry_enabled,
                "target_pct": trading_engine.custom_target_pct,
                "stoploss_pct": trading_engine.custom_stoploss_pct
            }
        }
    except Exception as e:
        logger.error(f"Update settings error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/auto-settings")
async def get_auto_settings():
    """Get current auto-trading settings"""
    try:
        return {
            "status": "success",
            "settings": {
                "auto_exit": trading_engine.auto_exit_enabled,
                "auto_entry": trading_engine.auto_entry_enabled,
                "target_pct": trading_engine.custom_target_pct or trading_engine.risk_params[trading_engine.risk_tolerance]['target_pct'],
                "stoploss_pct": trading_engine.custom_stoploss_pct or trading_engine.risk_params[trading_engine.risk_tolerance]['stop_loss_pct']
            }
        }
    except Exception as e:
        logger.error(f"Get settings error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/settings")
async def get_bot_settings():
    """Get all bot settings"""
    try:
        settings = await settings_manager.get_settings()
        return {
            "status": "success",
            "settings": settings
        }
    except Exception as e:
        logger.error(f"Get bot settings error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.post("/market/square-off-check")
async def square_off_check():
    """Check for open positions near market close and send Telegram warning"""
    try:
        open_trades = await db.paper_trades.find({"status": "OPEN"}, {"_id": 0}).to_list(100)
        if not open_trades:
            return {"status": "success", "message": "No open positions", "open_count": 0}

        total_invested = sum(t.get('investment', 0) for t in open_trades)
        total_pnl = sum(t.get('pnl', 0) for t in open_trades)

        # Send Telegram warning
        settings = await settings_manager.get_settings()
        telegram = settings.get('telegram', {})
        telegram_sent = False

        if telegram.get('enabled') and telegram.get('bot_token') and telegram.get('chat_id'):
            positions_text = "\n".join(
                f"- {t.get('trade_type')} {t.get('symbol')} | Qty: {t.get('quantity')} | Entry: {t.get('entry_price')}"
                for t in open_trades
            )
            message = f"""*SQUARE-OFF WARNING*

*{len(open_trades)} position(s) still OPEN!*
Total Invested: {round(total_invested):,}
Unrealized P&L: {round(total_pnl):,}

Open Positions:
{positions_text}

_Market closes at 3:30 PM IST. Please square off or positions may carry over._
_Sent by AI Trading Bot_"""

            try:
                telegram_url = f"https://api.telegram.org/bot{telegram['bot_token']}/sendMessage"
                async with httpx.AsyncClient() as client:
                    resp = await client.post(telegram_url, json={
                        'chat_id': telegram['chat_id'], 'text': message, 'parse_mode': 'Markdown'
                    }, timeout=15)
                    if resp.json().get('ok'):
                        telegram_sent = True
            except Exception as e:
                logger.error(f"Telegram square-off error: {e}")

        return {
            "status": "success",
            "open_count": len(open_trades),
            "total_invested": total_invested,
            "telegram_sent": telegram_sent,
            "trades": [{"id": t.get("id"), "type": t.get("trade_type"), "symbol": t.get("symbol"), "qty": t.get("quantity"), "entry": t.get("entry_price"), "investment": t.get("investment")} for t in open_trades]
        }
    except Exception as e:
        logger.error(f"Square-off check error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/historical-patterns")
async def get_historical_patterns():
    """Get historical trading pattern stats"""
    try:
        patterns = await db.historical_patterns.find({}, {"_id": 0}).to_list(500)
        total = len(patterns)
        profitable = sum(1 for p in patterns if p.get('was_profitable'))

        sector_stats = {}
        sentiment_stats = {}
        for p in patterns:
            s = p.get('sector', 'BROAD_MARKET')
            if s not in sector_stats:
                sector_stats[s] = {'total': 0, 'profitable': 0, 'total_pnl': 0}
            sector_stats[s]['total'] += 1
            if p.get('was_profitable'):
                sector_stats[s]['profitable'] += 1
            sector_stats[s]['total_pnl'] += p.get('pnl', 0)

            sent = p.get('sentiment', 'NEUTRAL')
            if sent not in sentiment_stats:
                sentiment_stats[sent] = {'total': 0, 'profitable': 0, 'total_pnl': 0}
            sentiment_stats[sent]['total'] += 1
            if p.get('was_profitable'):
                sentiment_stats[sent]['profitable'] += 1
            sentiment_stats[sent]['total_pnl'] += p.get('pnl', 0)

        return {
            "status": "success",
            "total_patterns": total,
            "profitable_patterns": profitable,
            "win_rate": round((profitable / max(total, 1)) * 100, 1),
            "sector_stats": sector_stats,
            "sentiment_stats": sentiment_stats,
            "recent": patterns[-20:][::-1]
        }
    except Exception as e:
        logger.error(f"Historical patterns error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.post("/settings/update")
async def update_bot_settings(request: dict):
    """Update bot settings"""
    try:
        result = await settings_manager.update_settings(request)
        
        # Apply settings to trading engine
        if 'risk' in request:
            risk = request['risk']
            trading_engine.max_trade_amount = risk.get('max_per_trade', 20000)
            trading_engine.daily_limit = risk.get('daily_limit', 100000)
            trading_engine.risk_tolerance = risk.get('risk_tolerance', 'medium')
            trading_engine.custom_target_pct = risk.get('target_pct')
            trading_engine.custom_stoploss_pct = risk.get('stop_loss_pct')
        
        if 'auto_trading' in request:
            auto = request['auto_trading']
            trading_engine.auto_exit_enabled = auto.get('auto_exit', True)
            trading_engine.auto_entry_enabled = auto.get('auto_entry', False)
        
        return result
    except Exception as e:
        logger.error(f"Update bot settings error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/settings/trading-status")
async def get_trading_status():
    """Check if trading is allowed now"""
    try:
        status = await settings_manager.is_trading_allowed()
        return {
            "status": "success",
            **status
        }
    except Exception as e:
        logger.error(f"Trading status error: {e}")
        return {"status": "error", "message": str(e)}

# ============ Tax Report Endpoints ============

@api_router.get("/tax/report")
async def get_tax_report(fy_year: str = "2025-26"):
    """Get capital gains tax report for a financial year"""
    try:
        trades = await db.paper_trades.find({"status": "CLOSED"}, {"_id": 0}).to_list(5000)
        report = calculate_tax_report(trades, fy_year)
        # Remove full trades from response (too large for JSON)
        report_summary = {k: v for k, v in report.items() if k != 'trades'}
        report_summary['trade_count'] = len(report.get('trades', []))
        return {"status": "success", "report": report_summary}
    except Exception as e:
        logger.error(f"Tax report error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/tax/export-excel")
async def export_tax_excel(fy_year: str = "2025-26"):
    """Export tax report as Excel file"""
    try:
        trades = await db.paper_trades.find({"status": "CLOSED"}, {"_id": 0}).to_list(5000)
        report = calculate_tax_report(trades, fy_year)
        excel_bytes = generate_excel_report(report)
        filename = f"Tax_Report_FY_{fy_year}.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Tax Excel export error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/tax/export-pdf")
async def export_tax_pdf(fy_year: str = "2025-26"):
    """Export tax report as PDF file"""
    try:
        trades = await db.paper_trades.find({"status": "CLOSED"}, {"_id": 0}).to_list(5000)
        report = calculate_tax_report(trades, fy_year)
        pdf_bytes = generate_pdf_report(report)
        filename = f"Tax_Report_FY_{fy_year}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Tax PDF export error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.post("/test/generate-trade")
async def test_generate_trade():
    """Test endpoint to manually trigger trade generation"""
    try:
        # Get or create demo news
        latest_news = await db.news_articles.find(
            {},
            {"_id": 0}
        ).sort('created_at', -1).limit(1).to_list(1)
        
        if not latest_news or len(latest_news) == 0:
            # Create demo news
            from news_service import NewsService
            from sentiment_service import SentimentService
            
            news_svc = NewsService()
            sent_svc = SentimentService()
            
            demo_articles = await news_svc.fetch_market_news(max_articles=1)
            if demo_articles:
                article = demo_articles[0]
                article_id = str(uuid.uuid4())
                sentiment = await sent_svc.analyze_news_sentiment(article)
                
                news_doc = {
                    'id': article_id,
                    'title': article['title'],
                    'description': article['description'],
                    'content': article.get('content', ''),
                    'source': article['source'],
                    'url': article['url'],
                    'published_at': article['published_at'],
                    'sentiment_analysis': sentiment,
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                
                await db.news_articles.insert_one(news_doc)
                latest_news = [news_doc]
        
        if latest_news and len(latest_news) > 0:
            signal = await trading_engine.generate_trading_signal(latest_news[0])
            if signal:
                return {
                    "status": "success",
                    "message": "New trade generated",
                    "signal": signal
                }
            else:
                return {
                    "status": "failed",
                    "message": "Could not generate signal - check confidence or limits"
                }
        
        return {
            "status": "failed",
            "message": "No news available"
        }
    except Exception as e:
        logger.error(f"Test generate trade error: {e}")
        return {"status": "error", "message": str(e)}

# ==================== Upstox Routes ====================

@api_router.get("/upstox/auth-url")
async def get_upstox_auth_url():
    """Get Upstox OAuth login URL"""
    return await upstox_service.get_auth_url()

@api_router.post("/upstox/callback")
async def upstox_callback(request: dict):
    """Exchange auth code for access token"""
    code = request.get('code', '')
    if not code:
        return {"status": "error", "message": "Authorization code required"}
    return await upstox_service.exchange_code_for_token(code)

@api_router.get("/upstox/connection")
async def check_upstox_connection():
    """Check if Upstox is connected"""
    return await upstox_service.check_connection()

@api_router.get("/upstox/profile")
async def get_upstox_profile():
    """Get Upstox user profile"""
    return await upstox_service.get_profile()

@api_router.get("/upstox/market-data")
async def get_live_market_data():
    """Get live market indices from Upstox"""
    return await upstox_service.get_live_market_data()

@api_router.get("/upstox/portfolio")
async def get_upstox_portfolio():
    """Get real portfolio from Upstox"""
    return await upstox_service.get_portfolio()

@api_router.post("/upstox/order")
async def place_upstox_order(request: dict):
    """Place order on Upstox"""
    return await upstox_service.place_order(request)

@api_router.delete("/upstox/order/{order_id}")
async def cancel_upstox_order(order_id: str):
    """Cancel order on Upstox"""
    return await upstox_service.cancel_order(order_id)

@api_router.get("/upstox/orders")
async def get_upstox_orders():
    """Get order book from Upstox"""
    return await upstox_service.get_order_book()

@api_router.get("/upstox/pnl")
async def get_upstox_pnl(segment: str = "EQ"):
    """Get P&L from Upstox"""
    return await upstox_service.get_trade_pnl(segment=segment)

# ==================== Combined Status (Paper + Live) ====================

@api_router.get("/combined-status")
async def get_combined_status():
    """Get dashboard status - uses Upstox data when in LIVE mode"""
    try:
        settings = await settings_manager.get_settings()
        mode = settings.get('trading_mode', 'PAPER')
        upstox_connected = False
        upstox_profile = None

        result = {
            'mode': mode,
            'upstox_connected': False,
            'market_data': None,
            'portfolio': None,
            'orders': [],
        }

        if mode == 'LIVE':
            conn = await upstox_service.check_connection()
            upstox_connected = conn.get('connected', False)
            result['upstox_connected'] = upstox_connected

            if upstox_connected:
                # Fetch real data
                market = await upstox_service.get_live_market_data()
                if market.get('status') == 'success':
                    result['market_data'] = market['data']

                portfolio = await upstox_service.get_portfolio()
                if portfolio.get('status') == 'success':
                    result['portfolio'] = portfolio

                orders = await upstox_service.get_order_book()
                if orders.get('status') == 'success':
                    result['orders'] = orders['orders']

                profile = await upstox_service.get_profile()
                if profile.get('status') == 'success':
                    result['profile'] = profile['profile']

        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Combined status error: {e}")
        return {"status": "error", "message": str(e)}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("🚀 Trading Bot API Starting...")
    try:
        await trading_engine.initialize_portfolio()
        logger.info("✅ Portfolio initialized")
    except Exception as e:
        logger.error(f"Startup error: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    if mongo_url:
        client.close()
    logger.info("👋 Trading Bot API Shutdown")

# Serve frontend build if available (for desktop/local mode)
frontend_build = ROOT_DIR.parent / 'frontend' / 'build'
if frontend_build.exists() and (frontend_build / 'static').exists():
    from starlette.responses import FileResponse

    app.mount("/static", StaticFiles(directory=str(frontend_build / "static")), name="static")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_build / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_build / "index.html"))

