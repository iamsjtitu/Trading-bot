"""
AI Trading Bot API Tests
Tests all core backend API endpoints for the options trading bot
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

# ==================== Health & Core Endpoints ====================
class TestHealthAndCore:
    """Health check and basic endpoint tests"""
    
    def test_health_check(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "services" in data
        assert data["services"]["news"] == "active"
        assert data["services"]["sentiment"] == "active"
        assert data["services"]["trading"] == "active"
    
    def test_root_endpoint(self):
        """Test /api/ returns API info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["status"] == "active"
    
    def test_initialize_system(self):
        """Test POST /api/initialize initializes trading system"""
        response = requests.post(f"{BASE_URL}/api/initialize")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "capital" in data


# ==================== Settings Endpoints ====================
class TestSettings:
    """Settings endpoints tests"""
    
    def test_get_settings(self):
        """Test GET /api/settings returns all bot settings"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "settings" in data
        
        # Verify news settings structure
        settings = data["settings"]
        assert "news" in settings
        news = settings["news"]
        assert "sources" in news
        assert "newsapi_key" in news
        assert "alphavantage_key" in news
        
    def test_update_settings(self):
        """Test POST /api/settings/update correctly updates news settings"""
        update_payload = {
            "news": {
                "sources": ["demo"],
                "newsapi_key": "TEST_key_123",
                "alphavantage_key": "",
                "min_confidence": 65
            }
        }
        response = requests.post(
            f"{BASE_URL}/api/settings/update",
            json=update_payload
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        
        # Verify update persisted by GET
        verify_response = requests.get(f"{BASE_URL}/api/settings")
        verify_data = verify_response.json()
        assert verify_data["settings"]["news"]["newsapi_key"] == "TEST_key_123"
        assert verify_data["settings"]["news"]["min_confidence"] == 65
        
    def test_get_trading_status(self):
        """Test GET /api/settings/trading-status"""
        response = requests.get(f"{BASE_URL}/api/settings/trading-status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "allowed" in data
        assert "reason" in data


# ==================== News Endpoints ====================
class TestNewsEndpoints:
    """News fetching and retrieval tests"""
    
    def test_fetch_news(self):
        """Test GET /api/news/fetch works and returns demo articles"""
        response = requests.get(f"{BASE_URL}/api/news/fetch")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "articles_processed" in data
        assert "articles" in data
        assert isinstance(data["articles"], list)
        
        # Verify article structure (demo mode)
        if len(data["articles"]) > 0:
            article = data["articles"][0]
            assert "title" in article
            assert "description" in article
            assert "source" in article
            assert "sentiment_analysis" in article
    
    def test_get_latest_news(self):
        """Test GET /api/news/latest returns stored news"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "news" in data
        assert isinstance(data["news"], list)


# ==================== Portfolio & Stats Endpoints ====================
class TestPortfolioAndStats:
    """Portfolio and statistics endpoints tests"""
    
    def test_get_portfolio(self):
        """Test GET /api/portfolio returns portfolio data"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        data = response.json()
        
        # Verify portfolio fields
        assert "initial_capital" in data
        assert "current_value" in data
        assert "available_capital" in data
        assert "total_pnl" in data
        assert "total_trades" in data
        assert "active_positions" in data
        assert "winning_trades" in data
        assert "losing_trades" in data
    
    def test_get_stats(self):
        """Test GET /api/stats returns statistics"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "stats" in data
        
        stats = data["stats"]
        assert "total_news_analyzed" in stats
        assert "total_signals_generated" in stats
        assert "portfolio_value" in stats
        assert "win_rate" in stats


# ==================== Trades Endpoints ====================
class TestTradesEndpoints:
    """Trading and signals endpoints tests"""
    
    def test_get_active_trades(self):
        """Test GET /api/trades/active returns active trades"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "trades" in data
        assert isinstance(data["trades"], list)
    
    def test_get_today_trades(self):
        """Test GET /api/trades/today returns today's summary"""
        response = requests.get(f"{BASE_URL}/api/trades/today")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "total_trades_today" in data
        assert "closed_trades" in data
        assert "open_trades" in data
        assert "today_pnl" in data
    
    def test_get_trade_history(self):
        """Test GET /api/trades/history returns trade history"""
        response = requests.get(f"{BASE_URL}/api/trades/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "trades" in data
        assert isinstance(data["trades"], list)


# ==================== Signals Endpoints ====================
class TestSignalsEndpoints:
    """Trading signals endpoints tests"""
    
    def test_get_latest_signals(self):
        """Test GET /api/signals/latest returns signals"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "signals" in data
        assert isinstance(data["signals"], list)
    
    def test_get_active_signals(self):
        """Test GET /api/signals/active returns active signals"""
        response = requests.get(f"{BASE_URL}/api/signals/active")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "signals" in data


# ==================== Auto-Trading Settings ====================
class TestAutoTradingSettings:
    """Auto-trading settings endpoints tests"""
    
    def test_get_auto_settings(self):
        """Test GET /api/auto-settings returns current settings"""
        response = requests.get(f"{BASE_URL}/api/auto-settings")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "settings" in data
        
        settings = data["settings"]
        assert "auto_exit" in settings
        assert "auto_entry" in settings
        assert "target_pct" in settings
        assert "stoploss_pct" in settings
    
    def test_update_auto_settings(self):
        """Test POST /api/auto-settings/update"""
        update_payload = {
            "auto_exit": True,
            "auto_entry": False,
            "target_pct": 15,
            "stoploss_pct": 20
        }
        response = requests.post(
            f"{BASE_URL}/api/auto-settings/update",
            json=update_payload
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["settings"]["target_pct"] == 15
        assert data["settings"]["stoploss_pct"] == 20
    
    def test_check_auto_exits(self):
        """Test POST /api/auto-exit/check"""
        response = requests.post(f"{BASE_URL}/api/auto-exit/check")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "exits_executed" in data


# ==================== Test Trade Generation ====================
class TestTradeGeneration:
    """Test trade generation endpoint"""
    
    def test_generate_trade(self):
        """Test POST /api/test/generate-trade"""
        response = requests.post(f"{BASE_URL}/api/test/generate-trade")
        assert response.status_code == 200
        data = response.json()
        # Can be success or failed depending on conditions
        assert data["status"] in ["success", "failed"]
        assert "message" in data


# ==================== Cleanup ====================
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Cleanup test data after all tests"""
    yield
    # Reset settings to original values
    reset_payload = {
        "news": {
            "sources": ["demo"],
            "newsapi_key": "",
            "alphavantage_key": "",
            "min_confidence": 60
        }
    }
    requests.post(f"{BASE_URL}/api/settings/update", json=reset_payload)
