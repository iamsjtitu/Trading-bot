"""
Test Suite for v5.1.0 Telegram Integration
Tests new Telegram notification features and regression tests for existing functionality.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndVersion:
    """Health endpoint and version verification"""
    
    def test_health_returns_13_routes(self):
        """GET /api/health should return routes_loaded=13 (telegram route added)"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert data['version'] == '5.1.0'
        assert data['routes_loaded'] == 13, f"Expected 13 routes, got {data['routes_loaded']}"
        assert 'background_fetcher' in data
        print(f"✓ Health: version={data['version']}, routes={data['routes_loaded']}")


class TestTelegramStatus:
    """Telegram status endpoint tests"""
    
    def test_telegram_status_configured(self):
        """GET /api/telegram/status should return configured=true with all fields"""
        response = requests.get(f"{BASE_URL}/api/telegram/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        telegram = data['telegram']
        assert telegram['configured'] == True, "Telegram should be configured"
        assert telegram['has_token'] == True, "Should have bot token"
        assert telegram['has_chat_id'] == True, "Should have chat ID"
        assert telegram['chat_id'] == 5861330845, f"Expected chat_id=5861330845, got {telegram['chat_id']}"
        # sent_count is in-memory and resets on server restart, so just check it's a number >= 0
        assert isinstance(telegram['sent_count'], int) and telegram['sent_count'] >= 0
        print(f"✓ Telegram configured: sent_count={telegram['sent_count']}, chat_id={telegram['chat_id']}")
    
    def test_telegram_all_6_alert_types_enabled(self):
        """GET /api/telegram/status should return all 6 alert types enabled"""
        response = requests.get(f"{BASE_URL}/api/telegram/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        alerts = data['alerts']
        expected_alerts = ['signals', 'trade_entry', 'trade_exit', 'daily_summary', 'guard_blocks', 'exit_advice']
        for alert_type in expected_alerts:
            assert alert_type in alerts, f"Missing alert type: {alert_type}"
            assert alerts[alert_type] == True, f"Alert type {alert_type} should be enabled"
        print(f"✓ All 6 alert types enabled: {list(alerts.keys())}")


class TestTelegramTest:
    """Telegram test message endpoint"""
    
    def test_telegram_send_test_message(self):
        """POST /api/telegram/test should send test message successfully"""
        response = requests.post(f"{BASE_URL}/api/telegram/test", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success', f"Expected success, got {data}"
        assert 'message' in data
        print(f"✓ Test message sent: {data['message']}")


class TestTelegramAlerts:
    """Telegram alert preferences endpoint"""
    
    def test_telegram_update_alerts_disable_signals(self):
        """POST /api/telegram/alerts should update alert preferences"""
        # First disable signals
        response = requests.post(
            f"{BASE_URL}/api/telegram/alerts",
            json={"alerts": {"signals": False}},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['alerts']['signals'] == False
        print(f"✓ Disabled signals alert")
        
        # Re-enable signals
        response = requests.post(
            f"{BASE_URL}/api/telegram/alerts",
            json={"alerts": {"signals": True}},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['alerts']['signals'] == True
        print(f"✓ Re-enabled signals alert")
    
    def test_telegram_alerts_missing_body(self):
        """POST /api/telegram/alerts without alerts object should return error"""
        response = requests.post(
            f"{BASE_URL}/api/telegram/alerts",
            json={},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error'
        assert 'alerts object required' in data['message']
        print(f"✓ Correctly rejected missing alerts object")


class TestExitAdvisor:
    """Exit Advisor endpoint tests"""
    
    def test_exit_advisor_status_running(self):
        """GET /api/exit-advisor/status should return running=true"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['advisor']['running'] == True, "Exit advisor should be running"
        print(f"✓ Exit Advisor running: {data['advisor']}")
    
    def test_exit_advisor_advice_returns_map(self):
        """GET /api/exit-advisor/advice should return advice map"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/advice", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'advice' in data
        assert 'open_trades' in data
        print(f"✓ Exit Advisor advice: open_trades={data['open_trades']}, advice_count={len(data['advice'])}")
    
    def test_exit_advisor_analyze_invalid_trade_id(self):
        """POST /api/exit-advisor/analyze with invalid trade_id should return error"""
        response = requests.post(
            f"{BASE_URL}/api/exit-advisor/analyze",
            json={"trade_id": "invalid_trade_12345"},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error'
        assert 'not found' in data['message'].lower() or 'Open trade not found' in data['message']
        print(f"✓ Correctly rejected invalid trade_id: {data['message']}")


class TestRegressionAIGuards:
    """Regression: AI Guards should still work"""
    
    def test_ai_guards_status_returns_8_guards(self):
        """GET /api/ai-guards/status should return all 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'guards' in data
        assert len(data['guards']) == 8, f"Expected 8 guards, got {len(data['guards'])}"
        print(f"✓ AI Guards: {len(data['guards'])} guards present")


class TestRegressionPositionSizing:
    """Regression: Position sizing should still work"""
    
    def test_position_sizing_returns_kelly_with_trading_mode(self):
        """GET /api/position-sizing should return kelly with trading_mode"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'trading_mode' in data
        assert 'kelly' in data
        assert 'suggestion' in data
        print(f"✓ Position Sizing: trading_mode={data['trading_mode']}, kelly present")


class TestRegressionOptionsGreeks:
    """Regression: Options Greeks should still work"""
    
    def test_options_greeks_works_correctly(self):
        """GET /api/options/greeks should work with params"""
        params = {
            "spot": 22000,
            "strike": 22000,
            "expiry_days": 7,
            "volatility": 15,
            "option_type": "CE"
        }
        response = requests.get(f"{BASE_URL}/api/options/greeks", params=params, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'greeks' in data
        greeks = data['greeks']
        assert 'delta' in greeks
        assert 'gamma' in greeks
        assert 'theta' in greeks
        assert 'vega' in greeks
        print(f"✓ Options Greeks: delta={greeks['delta']:.4f}, gamma={greeks['gamma']:.6f}")


class TestRegressionNewsFetch:
    """Regression: News fetch should still work"""
    
    def test_news_fetch_endpoint_works(self):
        """GET /api/news/fetch should return success status (articles depend on external sources)"""
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'articles' in data
        # Articles may be 0 if external sources are unavailable
        print(f"✓ News Fetch: {len(data['articles'])} articles, endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
