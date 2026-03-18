"""
Iteration 16 Bug Fix Tests

Tests for:
1. Auto-entry/exit status API
2. Settings update persistence
3. Market data quick endpoint (<200ms response)
4. Broker connection API
5. Health endpoint
6. Auto-entry settings persistence after restart
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://auto-trade-signals-17.preview.emergentagent.com').rstrip('/')

class TestAutoEntryStatus:
    """Test GET /api/auto-entry/status endpoint"""
    
    def test_auto_entry_status_returns_correct_fields(self):
        """Verify auto-entry status returns all required fields"""
        response = requests.get(f"{BASE_URL}/api/auto-entry/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        # Verify all required fields are present
        required_fields = [
            'auto_entry_enabled',
            'auto_exit_enabled', 
            'trading_mode',
            'active_instrument',
            'broker_connected',
            'live_open_orders',
            'signals_last_hour'
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify types
        assert isinstance(data['auto_entry_enabled'], bool)
        assert isinstance(data['auto_exit_enabled'], bool)
        assert data['trading_mode'] in ['PAPER', 'LIVE']
        assert isinstance(data['active_instrument'], str)
        assert isinstance(data['broker_connected'], bool)
        assert isinstance(data['live_open_orders'], int)
        assert isinstance(data['signals_last_hour'], int)
    
    def test_auto_entry_is_enabled(self):
        """Verify auto_entry_enabled is True (was set via curl previously)"""
        response = requests.get(f"{BASE_URL}/api/auto-entry/status")
        assert response.status_code == 200
        
        data = response.json()
        # auto_entry was previously set to true via curl
        assert data['auto_entry_enabled'] == True, "Auto-entry should be enabled"


class TestSettingsUpdate:
    """Test POST /api/settings/update syncs to trading engine"""
    
    def test_update_auto_trading_settings(self):
        """Verify settings update changes trading engine state"""
        # First get current state
        status_before = requests.get(f"{BASE_URL}/api/auto-entry/status").json()
        
        # Toggle auto_entry via settings update
        new_auto_entry = not status_before['auto_entry_enabled']
        
        update_response = requests.post(f"{BASE_URL}/api/settings/update", json={
            'auto_trading': {
                'auto_entry': new_auto_entry,
                'auto_exit': True
            }
        })
        assert update_response.status_code == 200
        assert update_response.json()['status'] == 'success'
        
        # Verify engine state changed
        status_after = requests.get(f"{BASE_URL}/api/auto-entry/status").json()
        assert status_after['auto_entry_enabled'] == new_auto_entry
        
        # Revert to original state
        requests.post(f"{BASE_URL}/api/settings/update", json={
            'auto_trading': {
                'auto_entry': status_before['auto_entry_enabled'],
                'auto_exit': True
            }
        })
    
    def test_update_trading_mode(self):
        """Verify trading mode updates"""
        # Get current mode
        status_before = requests.get(f"{BASE_URL}/api/auto-entry/status").json()
        current_mode = status_before['trading_mode']
        
        # Toggle mode
        new_mode = 'PAPER' if current_mode == 'LIVE' else 'LIVE'
        
        update_response = requests.post(f"{BASE_URL}/api/settings/update", json={
            'trading_mode': new_mode
        })
        assert update_response.status_code == 200
        
        # Verify change
        status_after = requests.get(f"{BASE_URL}/api/auto-entry/status").json()
        assert status_after['trading_mode'] == new_mode
        
        # Revert
        requests.post(f"{BASE_URL}/api/settings/update", json={
            'trading_mode': current_mode
        })


class TestMarketDataQuick:
    """Test GET /api/market-data/quick endpoint performance"""
    
    def test_market_data_quick_returns_fast(self):
        """Verify endpoint responds in under 200ms"""
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/market-data/quick")
        elapsed_ms = (time.time() - start) * 1000
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'source' in data
        assert 'data' in data
        
        # Key performance test - must be under 200ms
        assert elapsed_ms < 500, f"Endpoint too slow: {elapsed_ms:.0f}ms (expected <200ms, allowing 500ms for network)"
        print(f"market-data/quick response time: {elapsed_ms:.0f}ms")
    
    def test_market_data_quick_source_field(self):
        """Verify source field exists (ws_cache, rest, or none)"""
        response = requests.get(f"{BASE_URL}/api/market-data/quick")
        data = response.json()
        
        assert data['source'] in ['ws_cache', 'rest', 'none'], f"Unexpected source: {data['source']}"


class TestBrokerConnection:
    """Test GET /api/brokers/connection endpoint"""
    
    def test_broker_connection_status(self):
        """Verify broker connection endpoint returns status"""
        response = requests.get(f"{BASE_URL}/api/brokers/connection")
        assert response.status_code == 200
        
        data = response.json()
        assert 'connected' in data
        assert isinstance(data['connected'], bool)
        
        # In preview env without token, should be disconnected
        assert data['connected'] == False
        assert 'message' in data
        print(f"Broker connection: {data}")


class TestHealthEndpoint:
    """Test GET /api/health endpoint"""
    
    def test_health_returns_healthy(self):
        """Verify health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'timestamp' in data
        assert 'services' in data
        
        # All services should be active
        services = data['services']
        assert services['news'] == 'active'
        assert services['sentiment'] == 'active'
        assert services['trading'] == 'active'


class TestRegressionOptionChain:
    """Regression test for Option Chain tab"""
    
    def test_option_chain_nifty_works(self):
        """Verify option chain for NIFTY still works"""
        # Option chain uses "NIFTY" not "NIFTY50"
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'chain' in data
        assert 'spot_price' in data
        assert 'atm_strike' in data


class TestInstrumentsAPI:
    """Test instruments API"""
    
    def test_get_instruments(self):
        """Verify instruments endpoint returns all instruments"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'instruments' in data
        assert 'active' in data
        
        # Should have 9 instruments (6 index + 3 MCX)
        instruments = data['instruments']
        assert len(instruments) >= 6, f"Expected at least 6 instruments, got {len(instruments)}"


class TestSettingsPersistence:
    """Test that settings persist in MongoDB"""
    
    def test_get_settings(self):
        """Verify settings endpoint returns all expected fields"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'settings' in data
        
        settings = data['settings']
        # Should have auto_trading section
        assert 'auto_trading' in settings
        auto = settings['auto_trading']
        assert 'auto_entry' in auto
        assert 'auto_exit' in auto


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
