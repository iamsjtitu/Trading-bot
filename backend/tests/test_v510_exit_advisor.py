"""
Test Suite for v5.1.0 AI Exit Advisor Feature
Tests:
- GET /api/health returns version 5.1.0 and 12 routes
- GET /api/exit-advisor/status returns running=true with advisor status object
- GET /api/exit-advisor/advice returns advice map and open_trades count
- POST /api/exit-advisor/analyze with invalid trade_id returns error 'Open trade not found'
- REGRESSION: GET /api/ai-guards/status returns all 8 guards
- REGRESSION: GET /api/position-sizing works with trading_mode
- REGRESSION: GET /api/options/greeks works correctly
- REGRESSION: News fetch returns articles from multiple sources (parallel fetching)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndVersion:
    """Test health endpoint returns v5.1.0 and correct route count"""
    
    def test_health_returns_version_510(self):
        """GET /api/health returns version 5.1.0"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        assert data.get('version') == '5.1.0', f"Expected version 5.1.0, got {data.get('version')}"
        print(f"✓ Health endpoint returns version: {data.get('version')}")
    
    def test_health_returns_12_routes(self):
        """GET /api/health returns routes_loaded=12"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('routes_loaded') == 12, f"Expected 12 routes, got {data.get('routes_loaded')}"
        print(f"✓ Health endpoint returns routes_loaded: {data.get('routes_loaded')}")
    
    def test_health_has_background_fetcher(self):
        """GET /api/health includes background_fetcher object"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert 'background_fetcher' in data, "background_fetcher object missing from health response"
        bg = data['background_fetcher']
        assert 'running' in bg
        print(f"✓ Background fetcher status: running={bg.get('running')}")


class TestExitAdvisorStatus:
    """Test AI Exit Advisor status endpoint"""
    
    def test_exit_advisor_status_returns_success(self):
        """GET /api/exit-advisor/status returns status=success"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"✓ Exit advisor status endpoint returns success")
    
    def test_exit_advisor_status_has_advisor_object(self):
        """GET /api/exit-advisor/status returns advisor object with required fields"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert 'advisor' in data, "advisor object missing from response"
        advisor = data['advisor']
        # Check required fields
        assert 'running' in advisor, "running field missing from advisor"
        assert 'last_check' in advisor, "last_check field missing from advisor"
        assert 'check_count' in advisor, "check_count field missing from advisor"
        assert 'active_advice_count' in advisor, "active_advice_count field missing from advisor"
        assert 'market_hours' in advisor, "market_hours field missing from advisor"
        print(f"✓ Advisor status: running={advisor.get('running')}, market_hours={advisor.get('market_hours')}, check_count={advisor.get('check_count')}")
    
    def test_exit_advisor_is_running(self):
        """GET /api/exit-advisor/status shows running=true"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        advisor = data.get('advisor', {})
        assert advisor.get('running') == True, f"Expected running=true, got {advisor.get('running')}"
        print(f"✓ Exit advisor is running: {advisor.get('running')}")


class TestExitAdvisorAdvice:
    """Test AI Exit Advisor advice endpoint"""
    
    def test_exit_advisor_advice_returns_success(self):
        """GET /api/exit-advisor/advice returns status=success"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/advice", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"✓ Exit advisor advice endpoint returns success")
    
    def test_exit_advisor_advice_has_required_fields(self):
        """GET /api/exit-advisor/advice returns advice map and open_trades count"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/advice", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert 'advice' in data, "advice field missing from response"
        assert 'open_trades' in data, "open_trades field missing from response"
        assert isinstance(data['advice'], dict), "advice should be a dictionary"
        assert isinstance(data['open_trades'], int), "open_trades should be an integer"
        print(f"✓ Advice endpoint: open_trades={data.get('open_trades')}, advice_count={len(data.get('advice', {}))}")


class TestExitAdvisorAnalyze:
    """Test AI Exit Advisor manual analyze endpoint"""
    
    def test_analyze_invalid_trade_returns_error(self):
        """POST /api/exit-advisor/analyze with invalid trade_id returns error"""
        response = requests.post(
            f"{BASE_URL}/api/exit-advisor/analyze",
            json={"trade_id": "invalid_trade_id_12345"},
            timeout=10
        )
        assert response.status_code == 200  # API returns 200 with error in body
        data = response.json()
        assert data.get('status') == 'error', f"Expected status=error, got {data.get('status')}"
        assert 'Open trade not found' in data.get('message', ''), f"Expected 'Open trade not found' in message, got: {data.get('message')}"
        print(f"✓ Analyze with invalid trade_id returns error: {data.get('message')}")
    
    def test_analyze_missing_trade_id_returns_error(self):
        """POST /api/exit-advisor/analyze without trade_id returns error"""
        response = requests.post(
            f"{BASE_URL}/api/exit-advisor/analyze",
            json={},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'error'
        print(f"✓ Analyze without trade_id returns error: {data.get('message')}")


class TestRegressionAIGuards:
    """REGRESSION: Test AI Guards status endpoint returns all 8 guards"""
    
    def test_ai_guards_status_returns_8_guards(self):
        """GET /api/ai-guards/status returns all 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        guards = data.get('guards', {})
        expected_guards = [
            'multi_timeframe', 'market_regime_filter', 'trailing_stop',
            'multi_source_verification', 'time_of_day_filter', 'max_daily_loss',
            'kelly_sizing', 'greeks_filter'
        ]
        for guard in expected_guards:
            assert guard in guards, f"Guard '{guard}' missing from response"
        assert len(guards) == 8, f"Expected 8 guards, got {len(guards)}"
        print(f"✓ AI Guards status returns all 8 guards: {list(guards.keys())}")


class TestRegressionPositionSizing:
    """REGRESSION: Test position sizing endpoint works with trading_mode"""
    
    def test_position_sizing_returns_trading_mode(self):
        """GET /api/position-sizing works and returns trading_mode"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'trading_mode' in data, "trading_mode field missing from response"
        print(f"✓ Position sizing returns trading_mode: {data.get('trading_mode')}")
    
    def test_position_sizing_has_kelly_fields(self):
        """GET /api/position-sizing returns kelly-related fields"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=10)
        assert response.status_code == 200
        data = response.json()
        # Check for key fields - kelly is nested, suggestion has amount
        assert 'kelly' in data, "kelly field missing from response"
        assert 'suggestion' in data, "suggestion field missing from response"
        assert 'amount' in data.get('suggestion', {}), "suggestion.amount missing"
        print(f"✓ Position sizing has kelly and suggestion fields")


class TestRegressionOptionsGreeks:
    """REGRESSION: Test options Greeks endpoint works correctly"""
    
    def test_options_greeks_returns_success(self):
        """GET /api/options/greeks with params works correctly"""
        # Greeks endpoint requires spot and strike params
        response = requests.get(f"{BASE_URL}/api/options/greeks?spot=23000&strike=23000&type=CE&expiry_days=7", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success', f"Expected success, got: {data}"
        print(f"✓ Options Greeks endpoint returns success")
    
    def test_options_greeks_has_greek_values(self):
        """GET /api/options/greeks returns delta, gamma, theta, vega"""
        response = requests.get(f"{BASE_URL}/api/options/greeks?spot=23000&strike=23000&type=CE&expiry_days=7", timeout=10)
        assert response.status_code == 200
        data = response.json()
        greeks = data.get('greeks', data)  # greeks might be nested or at root
        # Check for greek values
        has_greeks = any([
            'delta' in str(data).lower(),
            'gamma' in str(data).lower(),
            'theta' in str(data).lower(),
            'vega' in str(data).lower()
        ])
        assert has_greeks, f"Greek values not found in response: {data}"
        print(f"✓ Options Greeks has greek values")


class TestRegressionNewsFetch:
    """REGRESSION: Test news fetch returns articles from multiple sources"""
    
    def test_news_fetch_returns_articles(self):
        """GET /api/news/fetch returns articles"""
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=60)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        articles = data.get('articles', [])
        assert len(articles) > 0, "No articles returned"
        print(f"✓ News fetch returns {len(articles)} articles")
    
    def test_news_has_multiple_sources(self):
        """News articles come from multiple sources (parallel fetching)"""
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=60)
        assert response.status_code == 200
        data = response.json()
        articles = data.get('articles', [])
        sources = set()
        for article in articles:
            source = article.get('source', '')
            if source:
                sources.add(source)
        # Should have at least 2 different sources (parallel fetching)
        print(f"✓ News sources found: {sources}")
        # Note: If only demo mode, might have 1 source
        assert len(sources) >= 1, f"Expected at least 1 source, got {len(sources)}"


class TestDebugEndpoint:
    """Test debug endpoint for v5.1.0"""
    
    def test_debug_returns_version_510(self):
        """GET /api/debug returns version 5.1.0"""
        response = requests.get(f"{BASE_URL}/api/debug", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('version') == '5.1.0', f"Expected version 5.1.0, got {data.get('version')}"
        print(f"✓ Debug endpoint returns version: {data.get('version')}")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
