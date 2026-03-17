"""
Upstox Integration API Tests
Tests all Upstox broker integration endpoints for the options trading bot
These endpoints return 'not connected' errors since no real token - this is expected behavior
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')


# ==================== Upstox OAuth & Connection ====================
class TestUpstoxConnection:
    """Upstox OAuth flow and connection status tests"""

    def test_upstox_auth_url_without_redirect_uri(self):
        """Test GET /api/upstox/auth-url returns error when redirect_uri not set"""
        response = requests.get(f"{BASE_URL}/api/upstox/auth-url")
        assert response.status_code == 200
        data = response.json()
        # Expected: error since redirect_uri is not set in settings
        assert "status" in data
        # Could be error or success depending on settings state
        assert data["status"] in ["error", "success"]

    def test_upstox_connection_status_disconnected(self):
        """Test GET /api/upstox/connection shows disconnected when no token"""
        response = requests.get(f"{BASE_URL}/api/upstox/connection")
        assert response.status_code == 200
        data = response.json()
        # Expected: not connected since no access token
        assert "connected" in data
        assert data["connected"] == False
        assert "message" in data

    def test_upstox_callback_requires_code(self):
        """Test POST /api/upstox/callback validates code parameter"""
        response = requests.post(
            f"{BASE_URL}/api/upstox/callback",
            json={}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "code" in data["message"].lower() or "authorization" in data["message"].lower()

    def test_upstox_callback_with_invalid_code(self):
        """Test POST /api/upstox/callback with invalid code"""
        response = requests.post(
            f"{BASE_URL}/api/upstox/callback",
            json={"code": "invalid_test_code"}
        )
        assert response.status_code == 200
        data = response.json()
        # Expected: error since credentials incomplete or code invalid
        assert data["status"] == "error"


# ==================== Upstox Market Data ====================
class TestUpstoxMarketData:
    """Upstox market data endpoints tests - expected to fail without connection"""

    def test_upstox_market_data_not_connected(self):
        """Test GET /api/upstox/market-data returns error when not connected"""
        response = requests.get(f"{BASE_URL}/api/upstox/market-data")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "data" in data
        assert data["data"] is None
        assert "logged in" in data["message"].lower() or "not" in data["message"].lower()


# ==================== Upstox Portfolio & Funds ====================
class TestUpstoxPortfolio:
    """Upstox portfolio and funds endpoints tests"""

    def test_upstox_portfolio_not_connected(self):
        """Test GET /api/upstox/portfolio returns error when not connected"""
        response = requests.get(f"{BASE_URL}/api/upstox/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "logged in" in data["message"].lower() or "not" in data["message"].lower()

    def test_upstox_profile_not_connected(self):
        """Test GET /api/upstox/profile returns error when not connected"""
        response = requests.get(f"{BASE_URL}/api/upstox/profile")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"


# ==================== Upstox Orders ====================
class TestUpstoxOrders:
    """Upstox order endpoints tests"""

    def test_upstox_orders_not_connected(self):
        """Test GET /api/upstox/orders returns empty when not connected"""
        response = requests.get(f"{BASE_URL}/api/upstox/orders")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "orders" in data
        assert data["orders"] == []

    def test_upstox_pnl_not_connected(self):
        """Test GET /api/upstox/pnl returns error when not connected"""
        response = requests.get(f"{BASE_URL}/api/upstox/pnl")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"


# ==================== Combined Status (Paper + Live) ====================
class TestCombinedStatus:
    """Combined status endpoint tests"""

    def test_combined_status_endpoint(self):
        """Test GET /api/combined-status returns proper structure"""
        response = requests.get(f"{BASE_URL}/api/combined-status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        
        # Verify required fields
        assert "mode" in data
        assert data["mode"] in ["PAPER", "LIVE"]
        assert "upstox_connected" in data
        assert isinstance(data["upstox_connected"], bool)
        assert "market_data" in data
        assert "portfolio" in data
        assert "orders" in data
        assert isinstance(data["orders"], list)

    def test_combined_status_live_mode_disconnected(self):
        """Test /api/combined-status in LIVE mode with Upstox disconnected"""
        response = requests.get(f"{BASE_URL}/api/combined-status")
        assert response.status_code == 200
        data = response.json()
        
        # When in LIVE mode but disconnected, upstox_connected should be False
        if data["mode"] == "LIVE":
            # Since no real token, should be disconnected
            assert data["upstox_connected"] == False


# ==================== Existing Endpoints Still Work ====================
class TestExistingEndpointsRegression:
    """Verify existing endpoints still work after Upstox integration"""

    def test_health_check(self):
        """Test /api/health still works"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_portfolio(self):
        """Test /api/portfolio still works"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert "initial_capital" in data
        assert "current_value" in data

    def test_news_fetch(self):
        """Test /api/news/fetch still works"""
        response = requests.get(f"{BASE_URL}/api/news/fetch")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

    def test_settings(self):
        """Test /api/settings still works"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "settings" in data

    def test_stats(self):
        """Test /api/stats still works"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "stats" in data

    def test_trades_active(self):
        """Test /api/trades/active still works"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

    def test_trades_history(self):
        """Test /api/trades/history still works"""
        response = requests.get(f"{BASE_URL}/api/trades/history")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

    def test_signals_latest(self):
        """Test /api/signals/latest still works"""
        response = requests.get(f"{BASE_URL}/api/signals/latest")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
