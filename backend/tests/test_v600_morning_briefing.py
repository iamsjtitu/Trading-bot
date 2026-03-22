"""
Test Suite for v6.0.0 - Morning Briefing Feature
Tests the new morning briefing feature and regression tests for existing functionality.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://options-ai-trading.preview.emergentagent.com').rstrip('/')


class TestHealthAndVersion:
    """Health endpoint and version verification"""
    
    def test_health_returns_version_600(self):
        """GET /api/health returns version=6.0.0"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert data['version'] == '6.0.0', f"Expected version 6.0.0, got {data.get('version')}"
        
    def test_health_returns_13_routes(self):
        """GET /api/health returns routes_loaded=13"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['routes_loaded'] == 13, f"Expected 13 routes, got {data.get('routes_loaded')}"
        
    def test_health_includes_morning_briefing_status(self):
        """GET /api/health includes morning_briefing object with running=true"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert 'morning_briefing' in data, "morning_briefing not in health response"
        mb = data['morning_briefing']
        assert mb['running'] == True, f"Expected morning_briefing.running=true, got {mb.get('running')}"
        assert 'sent_count' in mb
        assert 'last_sent' in mb
        assert 'next_briefing' in mb


class TestMorningBriefingEndpoint:
    """POST /api/telegram/morning-briefing endpoint tests"""
    
    def test_morning_briefing_sends_successfully(self):
        """POST /api/telegram/morning-briefing sends morning briefing and returns status=success"""
        response = requests.post(f"{BASE_URL}/api/telegram/morning-briefing")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success', f"Expected status=success, got {data.get('status')}"
        assert 'briefing' in data
        assert data['briefing']['running'] == True


class TestTelegramStatus:
    """GET /api/telegram/status tests"""
    
    def test_telegram_status_returns_7_alert_types(self):
        """GET /api/telegram/status returns 7 alert types including morning_briefing"""
        response = requests.get(f"{BASE_URL}/api/telegram/status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        alerts = data.get('alerts', {})
        expected_alerts = ['signals', 'trade_entry', 'trade_exit', 'daily_summary', 'guard_blocks', 'exit_advice', 'morning_briefing']
        for alert_type in expected_alerts:
            assert alert_type in alerts, f"Missing alert type: {alert_type}"
        assert len(alerts) == 7, f"Expected 7 alert types, got {len(alerts)}"
        
    def test_telegram_status_includes_morning_briefing_status(self):
        """GET /api/telegram/status returns morning_briefing status with sent_count>=1"""
        response = requests.get(f"{BASE_URL}/api/telegram/status")
        assert response.status_code == 200
        data = response.json()
        assert 'morning_briefing' in data
        mb = data['morning_briefing']
        assert mb['sent_count'] >= 1, f"Expected sent_count>=1, got {mb.get('sent_count')}"


class TestTelegramAlerts:
    """POST /api/telegram/alerts tests"""
    
    def test_toggle_morning_briefing_off(self):
        """POST /api/telegram/alerts can toggle morning_briefing OFF"""
        response = requests.post(f"{BASE_URL}/api/telegram/alerts", json={"alerts": {"morning_briefing": False}})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['alerts']['morning_briefing'] == False
        
    def test_toggle_morning_briefing_on(self):
        """POST /api/telegram/alerts can toggle morning_briefing ON"""
        response = requests.post(f"{BASE_URL}/api/telegram/alerts", json={"alerts": {"morning_briefing": True}})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['alerts']['morning_briefing'] == True


class TestTelegramExistingEndpoints:
    """Regression tests for existing Telegram endpoints"""
    
    def test_telegram_test_still_works(self):
        """POST /api/telegram/test still works"""
        response = requests.post(f"{BASE_URL}/api/telegram/test")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'message' in data
        
    def test_telegram_daily_summary_still_works(self):
        """POST /api/telegram/daily-summary still works"""
        response = requests.post(f"{BASE_URL}/api/telegram/daily-summary")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'summary' in data
        summary = data['summary']
        assert 'total_pnl' in summary
        assert 'total_trades' in summary
        assert 'mode' in summary


class TestRegressionExitAdvisor:
    """REGRESSION: GET /api/exit-advisor/status"""
    
    def test_exit_advisor_status_running(self):
        """GET /api/exit-advisor/status returns running=true"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['advisor']['running'] == True


class TestRegressionAIGuards:
    """REGRESSION: GET /api/ai-guards/status"""
    
    def test_ai_guards_returns_all_8_guards(self):
        """GET /api/ai-guards/status returns all 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        guards = data.get('guards', {})
        expected_guards = [
            'multi_timeframe', 'market_regime_filter', 'trailing_stop',
            'multi_source_verification', 'time_of_day_filter', 'max_daily_loss',
            'kelly_sizing', 'greeks_filter'
        ]
        for guard in expected_guards:
            assert guard in guards, f"Missing guard: {guard}"
        assert len(guards) == 8, f"Expected 8 guards, got {len(guards)}"


class TestRegressionPositionSizing:
    """REGRESSION: GET /api/position-sizing"""
    
    def test_position_sizing_returns_kelly_with_trading_mode(self):
        """GET /api/position-sizing returns kelly with trading_mode"""
        response = requests.get(f"{BASE_URL}/api/position-sizing")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'kelly' in data
        assert 'trading_mode' in data
        assert 'suggestion' in data


class TestRegressionOptionsGreeks:
    """REGRESSION: GET /api/options/greeks"""
    
    def test_options_greeks_works_correctly(self):
        """GET /api/options/greeks works correctly with parameters"""
        params = {
            'spot': 24000,
            'strike': 24000,
            'type': 'CE',
            'expiry_days': 7,
            'premium': 200
        }
        response = requests.get(f"{BASE_URL}/api/options/greeks", params=params)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'greeks' in data
        greeks = data['greeks']
        assert 'delta' in greeks
        assert 'gamma' in greeks
        assert 'theta' in greeks
        assert 'vega' in greeks
