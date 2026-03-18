"""
Test Suite for Version 2.3.0 - Per-Broker Credential Storage Bug Fix
Tests the critical fix: When switching brokers, each broker should have its own credentials/tokens.
Switching to Zerodha should NOT show 'Connected as SUMIT KUMAR JAIN' (Upstox token leak).

Key Features Tested:
1. Broker switching via POST /api/brokers/set-active
2. Connection status isolation per broker
3. Auth URL generation per broker
4. API version 2.3.0 verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBrokerSwitchingIsolation:
    """Test that broker switching properly isolates credentials and tokens"""
    
    def test_api_version_230(self):
        """Test API returns version 2.3.0"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get('app_version') == '2.3.0', f"Expected 2.3.0, got {data.get('app_version')}"
        print(f"PASS: API version is 2.3.0")
    
    def test_switch_to_upstox_check_connection(self):
        """Switch to Upstox and verify connection check (should be disconnected with no upstox_token)"""
        # First switch to Upstox
        switch_resp = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})
        assert switch_resp.status_code == 200
        data = switch_resp.json()
        assert data.get('status') == 'success'
        assert data.get('active_broker') == 'upstox'
        print(f"PASS: Switched to Upstox successfully")
        
        # Check connection
        conn_resp = requests.get(f"{BASE_URL}/api/brokers/connection")
        assert conn_resp.status_code == 200
        conn_data = conn_resp.json()
        # Without upstox_token stored, should be disconnected
        assert conn_data.get('connected') == False, f"Expected disconnected, got {conn_data}"
        print(f"PASS: Upstox connection shows disconnected (no upstox_token): {conn_data.get('message')}")
    
    def test_switch_to_zerodha_check_connection(self):
        """CRITICAL: Switch to Zerodha and verify it shows 'No access token' NOT 'Connected as SUMIT KUMAR JAIN'"""
        # Switch to Zerodha
        switch_resp = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'zerodha'})
        assert switch_resp.status_code == 200
        data = switch_resp.json()
        assert data.get('status') == 'success'
        assert data.get('active_broker') == 'zerodha'
        print(f"PASS: Switched to Zerodha successfully")
        
        # Check connection - CRITICAL TEST
        conn_resp = requests.get(f"{BASE_URL}/api/brokers/connection")
        assert conn_resp.status_code == 200
        conn_data = conn_resp.json()
        
        # MUST be disconnected - should NOT show 'Connected as SUMIT KUMAR JAIN'
        assert conn_data.get('connected') == False, f"CRITICAL BUG: Zerodha shows connected! Data: {conn_data}"
        
        message = conn_data.get('message', '').lower()
        # Should NOT contain user name from Upstox
        assert 'sumit' not in message, f"CRITICAL BUG: Zerodha shows Upstox user! Message: {message}"
        assert 'jain' not in message, f"CRITICAL BUG: Zerodha shows Upstox user! Message: {message}"
        
        # Should indicate no token
        assert 'no access token' in message or 'not logged in' in message or 'login' in message, \
            f"Expected 'no access token' or similar, got: {message}"
        
        print(f"PASS: Zerodha correctly shows disconnected: {conn_data.get('message')}")
    
    def test_switch_to_angelone_check_connection(self):
        """Switch to Angel One and verify connection check (should be disconnected)"""
        # Switch to Angel One
        switch_resp = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'angelone'})
        assert switch_resp.status_code == 200
        data = switch_resp.json()
        assert data.get('status') == 'success'
        assert data.get('active_broker') == 'angelone'
        print(f"PASS: Switched to Angel One successfully")
        
        # Check connection
        conn_resp = requests.get(f"{BASE_URL}/api/brokers/connection")
        assert conn_resp.status_code == 200
        conn_data = conn_resp.json()
        # Without angelone_token stored, should be disconnected
        assert conn_data.get('connected') == False, f"Expected disconnected, got {conn_data}"
        
        # Should NOT contain user name from Upstox
        message = conn_data.get('message', '').lower()
        assert 'sumit' not in message, f"CRITICAL BUG: Angel One shows Upstox user! Message: {message}"
        
        print(f"PASS: Angel One connection shows disconnected: {conn_data.get('message')}")
    
    def test_switch_back_to_upstox(self):
        """Switch back to Upstox and verify"""
        switch_resp = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})
        assert switch_resp.status_code == 200
        data = switch_resp.json()
        assert data.get('status') == 'success'
        assert data.get('active_broker') == 'upstox'
        
        # Check connection
        conn_resp = requests.get(f"{BASE_URL}/api/brokers/connection")
        assert conn_resp.status_code == 200
        conn_data = conn_resp.json()
        # Should be disconnected (no upstox_token stored in test env)
        assert conn_data.get('connected') == False
        print(f"PASS: Switched back to Upstox, shows disconnected: {conn_data.get('message')}")
    
    def test_brokers_list_returns_6_brokers(self):
        """Verify all 6 brokers are available"""
        response = requests.get(f"{BASE_URL}/api/brokers/list")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        brokers = data.get('brokers', [])
        assert len(brokers) == 6, f"Expected 6 brokers, got {len(brokers)}"
        broker_ids = [b['id'] for b in brokers]
        expected = ['upstox', 'zerodha', 'angelone', 'fivepaisa', 'paytm_money', 'iifl']
        for bid in expected:
            assert bid in broker_ids, f"Missing broker: {bid}"
        print(f"PASS: All 6 brokers available: {broker_ids}")
    
    def test_auth_url_generation_per_broker(self):
        """Test auth URL generates for active broker"""
        # Switch to Zerodha
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'zerodha'})
        
        auth_resp = requests.get(f"{BASE_URL}/api/brokers/auth-url")
        assert auth_resp.status_code == 200
        data = auth_resp.json()
        # Without credentials, should return error message
        assert 'message' in data or 'auth_url' in data
        print(f"PASS: Auth URL endpoint works for Zerodha: {data.get('message', data.get('auth_url', ''))[:50]}")
        
        # Switch to Upstox
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})
        auth_resp = requests.get(f"{BASE_URL}/api/brokers/auth-url")
        assert auth_resp.status_code == 200
        print(f"PASS: Auth URL endpoint works for Upstox")


class TestBrokerSpecificCredentialKeys:
    """Test that settings use broker-specific credential keys"""
    
    def test_settings_structure(self):
        """Verify settings structure supports per-broker credentials"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        settings = data.get('settings', {})
        broker_settings = settings.get('broker', {})
        
        # Settings should exist
        assert 'redirect_uri' in broker_settings or broker_settings != {}
        print(f"PASS: Settings structure valid, broker keys: {list(broker_settings.keys())[:5]}...")


class TestBrokerSwitchingRoundTrip:
    """Test full round-trip of broker switching"""
    
    def test_switch_all_brokers_sequential(self):
        """Switch through all brokers sequentially and verify each is disconnected"""
        brokers = ['upstox', 'zerodha', 'angelone', 'fivepaisa', 'paytm_money', 'iifl']
        
        for broker_id in brokers:
            # Switch
            switch_resp = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': broker_id})
            assert switch_resp.status_code == 200
            data = switch_resp.json()
            assert data.get('status') == 'success', f"Failed to switch to {broker_id}"
            
            # Verify active
            active_resp = requests.get(f"{BASE_URL}/api/brokers/active")
            assert active_resp.status_code == 200
            active_data = active_resp.json()
            assert active_data.get('id') == broker_id, f"Expected {broker_id}, got {active_data.get('id')}"
            
            # Check connection - all should be disconnected (no tokens stored)
            conn_resp = requests.get(f"{BASE_URL}/api/brokers/connection")
            conn_data = conn_resp.json()
            assert conn_data.get('connected') == False, f"{broker_id} unexpectedly shows connected!"
            
            # Verify NO Upstox user name leaked
            msg = conn_data.get('message', '').lower()
            assert 'sumit' not in msg, f"CRITICAL: {broker_id} shows Upstox user!"
            
            print(f"PASS: {broker_id} - switched, disconnected, no leak")
        
        # Switch back to Upstox as default
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})
        print("PASS: All 6 brokers tested with correct isolation")


class TestHealthAndBasicAPIs:
    """Basic API health checks"""
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        print("PASS: Health check OK")
    
    def test_portfolio_endpoint(self):
        """Test portfolio endpoint returns data"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert 'initial_capital' in data
        print("PASS: Portfolio endpoint OK")
    
    def test_instruments_endpoint(self):
        """Test instruments endpoint"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'NIFTY50' in data.get('instruments', {}) or data.get('active') == 'NIFTY50'
        print("PASS: Instruments endpoint OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
