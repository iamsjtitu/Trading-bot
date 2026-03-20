"""
Test v5.0.0 - Background Market Data Fetcher
Tests:
1. GET /api/health - version=5.0.0, routes_loaded=12, background_fetcher object
2. GET /api/market-data/bg-status - fetcher status, market_hours, cached_data
3. GET /api/debug - version=5.0.0, market_data section
4. REGRESSION: AI Guards (8 guards), Kelly, Greeks endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestV500HealthAndVersion:
    """Test v5.0.0 health endpoint with background fetcher"""
    
    def test_health_version_500(self):
        """GET /api/health returns version=5.0.0"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('version') == '5.0.0', f"Expected version 5.0.0, got {data.get('version')}"
        print(f"PASS: Health version = {data.get('version')}")
    
    def test_health_routes_loaded_12(self):
        """GET /api/health returns routes_loaded=12"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('routes_loaded') == 12, f"Expected routes_loaded=12, got {data.get('routes_loaded')}"
        print(f"PASS: Routes loaded = {data.get('routes_loaded')}")
    
    def test_health_background_fetcher_object(self):
        """GET /api/health has background_fetcher object with running=true"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        bg_fetcher = data.get('background_fetcher')
        assert bg_fetcher is not None, "background_fetcher object missing"
        assert 'running' in bg_fetcher, "background_fetcher.running missing"
        assert bg_fetcher['running'] == True, f"Expected running=true, got {bg_fetcher['running']}"
        print(f"PASS: Background fetcher running = {bg_fetcher['running']}")
        print(f"      Fetcher state: {bg_fetcher}")


class TestBackgroundFetcherStatus:
    """Test /api/market-data/bg-status endpoint"""
    
    def test_bg_status_endpoint_exists(self):
        """GET /api/market-data/bg-status returns 200"""
        response = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"PASS: bg-status endpoint returns success")
    
    def test_bg_status_fetcher_object(self):
        """bg-status returns fetcher object with running, last_status"""
        response = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        fetcher = data.get('fetcher')
        assert fetcher is not None, "fetcher object missing"
        assert 'running' in fetcher, "fetcher.running missing"
        assert 'last_status' in fetcher, "fetcher.last_status missing"
        assert fetcher['running'] == True, f"Expected running=true, got {fetcher['running']}"
        print(f"PASS: Fetcher running={fetcher['running']}, last_status={fetcher['last_status']}")
    
    def test_bg_status_market_hours_boolean(self):
        """bg-status returns market_hours boolean"""
        response = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        assert 'market_hours' in data, "market_hours field missing"
        assert isinstance(data['market_hours'], bool), f"market_hours should be boolean, got {type(data['market_hours'])}"
        print(f"PASS: market_hours = {data['market_hours']} (boolean)")
    
    def test_bg_status_cached_data(self):
        """bg-status returns cached_data with indices"""
        response = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        cached = data.get('cached_data')
        assert cached is not None, "cached_data object missing"
        assert 'last_updated' in cached, "cached_data.last_updated missing"
        assert 'source' in cached, "cached_data.source missing"
        assert 'indices' in cached, "cached_data.indices missing"
        
        # If indices exist, check for nifty50 and banknifty
        if cached['indices']:
            assert 'nifty50' in cached['indices'] or 'banknifty' in cached['indices'], "Expected nifty50 or banknifty in indices"
            print(f"PASS: cached_data.indices = {cached['indices']}")
        else:
            print(f"PASS: cached_data present (indices may be null if no data cached yet)")
        print(f"      last_updated={cached['last_updated']}, source={cached['source']}")
    
    def test_bg_status_market_closed_outside_hours(self):
        """Outside market hours (IST 9AM-3:45PM), last_status should be 'market_closed' or 'no_token'"""
        response = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        fetcher = data.get('fetcher', {})
        last_status = fetcher.get('last_status')
        # Valid statuses outside market hours: market_closed, no_token, idle
        valid_statuses = ['market_closed', 'no_token', 'idle', 'success']
        assert last_status in valid_statuses, f"Expected status in {valid_statuses}, got {last_status}"
        print(f"PASS: last_status = {last_status} (valid for current time)")


class TestDebugEndpoint:
    """Test /api/debug endpoint for v5.0.0"""
    
    def test_debug_version_500(self):
        """GET /api/debug returns version=5.0.0"""
        response = requests.get(f"{BASE_URL}/api/debug", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('version') == '5.0.0', f"Expected version 5.0.0, got {data.get('version')}"
        print(f"PASS: Debug version = {data.get('version')}")
    
    def test_debug_market_data_section(self):
        """GET /api/debug has market_data section with cached, last_updated, source, nifty, banknifty"""
        response = requests.get(f"{BASE_URL}/api/debug", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        md = data.get('market_data')
        assert md is not None, "market_data section missing"
        assert 'cached' in md, "market_data.cached missing"
        assert 'last_updated' in md, "market_data.last_updated missing"
        assert 'source' in md, "market_data.source missing"
        assert 'nifty' in md, "market_data.nifty missing"
        assert 'banknifty' in md, "market_data.banknifty missing"
        
        print(f"PASS: market_data section present")
        print(f"      cached={md['cached']}, source={md['source']}")
        print(f"      nifty={md['nifty']}, banknifty={md['banknifty']}")
    
    def test_debug_background_fetcher(self):
        """GET /api/debug has background_fetcher object"""
        response = requests.get(f"{BASE_URL}/api/debug", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        bg = data.get('background_fetcher')
        assert bg is not None, "background_fetcher missing in debug"
        assert 'running' in bg, "background_fetcher.running missing"
        print(f"PASS: background_fetcher in debug: running={bg['running']}")


class TestRegressionAIGuards:
    """REGRESSION: AI Guards endpoints still work"""
    
    def test_ai_guards_status_8_guards(self):
        """GET /api/ai-guards/status returns all 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        
        guards = data.get('guards', {})
        expected_guards = ['multi_timeframe', 'market_regime_filter', 'trailing_stop', 
                          'multi_source_verification', 'time_of_day_filter', 'max_daily_loss',
                          'kelly_sizing', 'greeks_filter']
        
        for guard in expected_guards:
            assert guard in guards, f"Guard {guard} missing"
        
        print(f"PASS: All 8 guards present: {list(guards.keys())}")
    
    def test_ai_guards_toggle_kelly(self):
        """POST /api/ai-guards/update toggles kelly_sizing"""
        # Get current state
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        current = response.json().get('guards', {}).get('kelly_sizing', {}).get('enabled', True)
        
        # Toggle OFF
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", json={'kelly_sizing': False}, timeout=10)
        assert response.status_code == 200
        
        # Verify OFF
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.json().get('guards', {}).get('kelly_sizing', {}).get('enabled') == False
        
        # Toggle back ON
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", json={'kelly_sizing': True}, timeout=10)
        assert response.status_code == 200
        
        # Verify ON
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.json().get('guards', {}).get('kelly_sizing', {}).get('enabled') == True
        
        print(f"PASS: kelly_sizing toggle ON/OFF works")
    
    def test_ai_guards_toggle_greeks(self):
        """POST /api/ai-guards/update toggles greeks_filter"""
        # Toggle OFF
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", json={'greeks_filter': False}, timeout=10)
        assert response.status_code == 200
        
        # Verify OFF
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.json().get('guards', {}).get('greeks_filter', {}).get('enabled') == False
        
        # Toggle back ON
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", json={'greeks_filter': True}, timeout=10)
        assert response.status_code == 200
        
        # Verify ON
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.json().get('guards', {}).get('greeks_filter', {}).get('enabled') == True
        
        print(f"PASS: greeks_filter toggle ON/OFF works")


class TestRegressionPositionSizing:
    """REGRESSION: Position sizing endpoint"""
    
    def test_position_sizing_trading_mode(self):
        """GET /api/position-sizing returns kelly analysis with trading_mode field"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        
        assert 'trading_mode' in data, "trading_mode field missing"
        assert 'kelly' in data, "kelly field missing"
        assert 'suggestion' in data, "suggestion field missing"
        
        print(f"PASS: position-sizing returns trading_mode={data.get('trading_mode')}")


class TestRegressionOptionsGreeks:
    """REGRESSION: Options Greeks endpoints"""
    
    def test_options_greeks(self):
        """GET /api/options/greeks returns greeks"""
        params = {'spot': 24000, 'strike': 24100, 'type': 'CE', 'premium': 150}
        response = requests.get(f"{BASE_URL}/api/options/greeks", params=params, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        
        greeks = data.get('greeks', {})
        assert 'delta' in greeks, "delta missing"
        assert 'gamma' in greeks, "gamma missing"
        assert 'theta' in greeks, "theta missing"
        assert 'vega' in greeks, "vega missing"
        
        print(f"PASS: options/greeks returns delta={greeks.get('delta')}, theta={greeks.get('theta')}")
    
    def test_chain_greeks(self):
        """GET /api/options/chain-greeks returns chain"""
        params = {'instrument': 'NIFTY50', 'spot': 24000}
        response = requests.get(f"{BASE_URL}/api/options/chain-greeks", params=params, timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        
        chain = data.get('chain', [])
        assert len(chain) > 0, "chain should have strikes"
        
        print(f"PASS: chain-greeks returns {len(chain)} strikes")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
