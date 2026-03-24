"""
Test Suite for v8.0.0 - Version Fix and Route Verification
Tests:
1. /api/health returns version 8.0.0 dynamically from package.json
2. /api/debug returns version 8.0.0 dynamically
3. /api/debug/auto-trade-test returns version 8.0.0 dynamically
4. /api/telegram/status returns success (was 404 before)
5. /api/telegram/test should work (was 404 before)
6. /api/telegram/morning-briefing should work (was 404 before)
7. /api/telegram/daily-summary should work (was 404 before)
8. /api/options/greeks returns valid Greeks
9. /api/position-sizing returns valid Kelly Criterion data
10. /api/exit-advisor/status shows running:true
11. /api/health shows background jobs running
12. /api/ai-guards/status returns 8 guards
13. /api/trades/active returns success
14. /api/signals/latest returns success
15. /api/auto-settings returns success
16. /api/news/latest returns success
17. /api/trades/history returns success
18. /api/portfolio returns success
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sentiment-trade-bot-3.preview.emergentagent.com').rstrip('/')
EXPECTED_VERSION = "8.0.0"

class TestVersionFix:
    """Test that version 8.0.0 is returned dynamically from package.json"""
    
    def test_health_returns_version_8_0_0(self):
        """Test 1: /api/health returns version 8.0.0"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "version" in data, "Response missing 'version' field"
        assert data["version"] == EXPECTED_VERSION, f"Expected version {EXPECTED_VERSION}, got {data['version']}"
        print(f"PASS: /api/health returns version {data['version']}")
    
    def test_debug_returns_version_8_0_0(self):
        """Test 2: /api/debug returns version 8.0.0"""
        response = requests.get(f"{BASE_URL}/api/debug", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "version" in data, "Response missing 'version' field"
        assert data["version"] == EXPECTED_VERSION, f"Expected version {EXPECTED_VERSION}, got {data['version']}"
        print(f"PASS: /api/debug returns version {data['version']}")
    
    def test_auto_trade_test_returns_version_8_0_0(self):
        """Test 3: /api/debug/auto-trade-test returns version 8.0.0"""
        response = requests.get(f"{BASE_URL}/api/debug/auto-trade-test", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "version" in data, "Response missing 'version' field"
        assert data["version"] == EXPECTED_VERSION, f"Expected version {EXPECTED_VERSION}, got {data['version']}"
        print(f"PASS: /api/debug/auto-trade-test returns version {data['version']}")


class TestTelegramRoutes:
    """Test that telegram routes are loaded (were 404 before fix)"""
    
    def test_telegram_status_not_404(self):
        """Test 4: /api/telegram/status returns success (not 404)"""
        response = requests.get(f"{BASE_URL}/api/telegram/status", timeout=15)
        assert response.status_code != 404, f"Telegram status route returned 404 - routes not loaded!"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        print(f"PASS: /api/telegram/status returns success")
    
    def test_telegram_test_not_404(self):
        """Test 5: /api/telegram/test should work (not 404)"""
        response = requests.post(f"{BASE_URL}/api/telegram/test", timeout=15)
        assert response.status_code != 404, f"Telegram test route returned 404 - routes not loaded!"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # May return error if not configured, but should not be 404
        assert "status" in data, "Response missing 'status' field"
        print(f"PASS: /api/telegram/test returns status={data.get('status')}")
    
    def test_telegram_morning_briefing_not_404(self):
        """Test 6: /api/telegram/morning-briefing should work (not 404)"""
        response = requests.post(f"{BASE_URL}/api/telegram/morning-briefing", timeout=30)
        assert response.status_code != 404, f"Telegram morning-briefing route returned 404 - routes not loaded!"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "status" in data, "Response missing 'status' field"
        print(f"PASS: /api/telegram/morning-briefing returns status={data.get('status')}")
    
    def test_telegram_daily_summary_not_404(self):
        """Test 7: /api/telegram/daily-summary should work (not 404)"""
        response = requests.post(f"{BASE_URL}/api/telegram/daily-summary", timeout=15)
        assert response.status_code != 404, f"Telegram daily-summary route returned 404 - routes not loaded!"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "status" in data, "Response missing 'status' field"
        print(f"PASS: /api/telegram/daily-summary returns status={data.get('status')}")


class TestOptionsRoutes:
    """Test that options routes are loaded (were 404 before fix)"""
    
    def test_options_greeks_returns_valid_data(self):
        """Test 8: /api/options/greeks returns valid Greeks"""
        response = requests.get(f"{BASE_URL}/api/options/greeks?spot=24000&strike=24000&type=CE", timeout=15)
        assert response.status_code != 404, f"Options greeks route returned 404 - routes not loaded!"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "greeks" in data, "Response missing 'greeks' field"
        greeks = data["greeks"]
        assert "delta" in greeks, "Greeks missing 'delta'"
        assert "gamma" in greeks, "Greeks missing 'gamma'"
        assert "theta" in greeks, "Greeks missing 'theta'"
        assert "vega" in greeks, "Greeks missing 'vega'"
        print(f"PASS: /api/options/greeks returns valid Greeks: delta={greeks['delta']}, gamma={greeks['gamma']}")
    
    def test_position_sizing_returns_kelly_data(self):
        """Test 9: /api/position-sizing returns valid Kelly Criterion data"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=15)
        assert response.status_code != 404, f"Position sizing route returned 404 - routes not loaded!"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "trading_mode" in data, "Response missing 'trading_mode' field"
        print(f"PASS: /api/position-sizing returns Kelly data, trading_mode={data.get('trading_mode')}")


class TestBackgroundJobs:
    """Test that background jobs are running"""
    
    def test_exit_advisor_running(self):
        """Test 10: /api/exit-advisor/status shows running:true"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        advisor = data.get("advisor", {})
        assert advisor.get("running") == True, f"Expected exit_advisor.running=true, got {advisor.get('running')}"
        print(f"PASS: /api/exit-advisor/status shows running=true")
    
    def test_health_shows_background_jobs_running(self):
        """Test 11: /api/health shows all background jobs running"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check background_fetcher
        bg_fetcher = data.get("background_fetcher", {})
        assert bg_fetcher.get("running") == True, f"Expected background_fetcher.running=true, got {bg_fetcher.get('running')}"
        
        # Check exit_advisor
        exit_advisor = data.get("exit_advisor", {})
        assert exit_advisor.get("running") == True, f"Expected exit_advisor.running=true, got {exit_advisor.get('running')}"
        
        # Check morning_briefing
        morning_briefing = data.get("morning_briefing", {})
        assert morning_briefing.get("running") == True, f"Expected morning_briefing.running=true, got {morning_briefing.get('running')}"
        
        print(f"PASS: /api/health shows all 3 background jobs running")


class TestAIGuards:
    """Test AI Guards endpoint"""
    
    def test_ai_guards_returns_8_guards(self):
        """Test 12: /api/ai-guards/status returns 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        guards = data.get("guards", {})
        guard_count = len(guards)
        assert guard_count == 8, f"Expected 8 guards, got {guard_count}"
        
        # Verify all 8 guards are present
        expected_guards = [
            "multi_timeframe", "market_regime_filter", "trailing_stop",
            "multi_source_verification", "time_of_day_filter", "max_daily_loss",
            "kelly_sizing", "greeks_filter"
        ]
        for guard in expected_guards:
            assert guard in guards, f"Missing guard: {guard}"
        
        print(f"PASS: /api/ai-guards/status returns {guard_count} guards")


class TestCoreAPIs:
    """Test core trading APIs"""
    
    def test_trades_active_returns_success(self):
        """Test 13: /api/trades/active returns success"""
        response = requests.get(f"{BASE_URL}/api/trades/active", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "trades" in data, "Response missing 'trades' field"
        print(f"PASS: /api/trades/active returns success, count={data.get('count', 0)}")
    
    def test_signals_latest_returns_success(self):
        """Test 14: /api/signals/latest returns success"""
        response = requests.get(f"{BASE_URL}/api/signals/latest", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "signals" in data, "Response missing 'signals' field"
        print(f"PASS: /api/signals/latest returns success, count={data.get('count', 0)}")
    
    def test_auto_settings_returns_success(self):
        """Test 15: /api/auto-settings returns success"""
        response = requests.get(f"{BASE_URL}/api/auto-settings", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        settings = data.get("settings", {})
        assert "auto_exit" in settings, "Settings missing 'auto_exit'"
        assert "auto_entry" in settings, "Settings missing 'auto_entry'"
        print(f"PASS: /api/auto-settings returns success")
    
    def test_news_latest_returns_success(self):
        """Test 16: /api/news/latest returns success"""
        response = requests.get(f"{BASE_URL}/api/news/latest", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "news" in data, "Response missing 'news' field"
        print(f"PASS: /api/news/latest returns success, count={data.get('count', 0)}")
    
    def test_trades_history_returns_success(self):
        """Test 17: /api/trades/history returns success"""
        response = requests.get(f"{BASE_URL}/api/trades/history", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "trades" in data, "Response missing 'trades' field"
        print(f"PASS: /api/trades/history returns success, count={data.get('count', 0)}")
    
    def test_portfolio_returns_success(self):
        """Test 18: /api/portfolio returns success"""
        response = requests.get(f"{BASE_URL}/api/portfolio", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # Portfolio may return data directly without status field
        assert "current_value" in data or "status" in data, "Response missing expected fields"
        print(f"PASS: /api/portfolio returns success")


class TestRoutesCount:
    """Test that all 13 routes are loaded"""
    
    def test_routes_loaded_count_is_13(self):
        """Test 21: Routes loaded count should be 13"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        routes_loaded = data.get("routes_loaded", 0)
        assert routes_loaded == 13, f"Expected 13 routes loaded, got {routes_loaded}"
        print(f"PASS: routes_loaded = {routes_loaded}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
