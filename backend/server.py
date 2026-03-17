from fastapi import FastAPI, APIRouter, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Optional
import uuid
from datetime import datetime, timezone

# Import our services
from news_service import NewsService
from sentiment_service import SentimentService
from trading_engine import TradingEngine

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize services
news_service = NewsService()
sentiment_service = SentimentService()
trading_engine = TradingEngine(db)

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
        
        for article in news_articles:
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
async def get_trade_history(limit: int = 50):
    """Get trade history"""
    try:
        trades = await db.paper_trades.find(
            {},
            {"_id": 0}
        ).sort('entry_time', -1).limit(limit).to_list(limit)
        
        return {
            "status": "success",
            "count": len(trades),
            "trades": trades
        }
    except Exception as e:
        logger.error(f"Get trade history error: {e}")
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
    client.close()
    logger.info("👋 Trading Bot API Shutdown")
