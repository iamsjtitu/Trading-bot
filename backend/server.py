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
            
            # Store in database
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
            
            # Generate trading signal if conditions met
            signal = await trading_engine.generate_trading_signal(news_doc)
            
            processed_articles.append({
                **news_doc,
                'signal_generated': signal is not None
            })
        
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
    """Get active paper trades"""
    try:
        trades = await db.paper_trades.find(
            {"status": "OPEN"},
            {"_id": 0}
        ).to_list(100)
        
        return {
            "status": "success",
            "count": len(trades),
            "trades": trades
        }
    except Exception as e:
        logger.error(f"Get active trades error: {e}")
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
