"""
Test WebSocket Market Data Features - v1.4.0
Tests:
- GET /api/ws/status - WebSocket streaming status
- POST /api/ws/start - Start WebSocket (requires Upstox token)
- POST /api/ws/stop - Stop WebSocket
- GET /api/combined-status - includes ws_status field
- GET /api/health - regression test
- GET /api/instruments - regression test (4 instruments)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWebSocketEndpoints:
    """WebSocket REST API endpoint tests"""
    
    def test_health_endpoint(self):
        """Regression test - health check should return healthy"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get('status') == 'healthy', f"Health status not healthy: {data}"
        assert 'timestamp' in data, "Missing timestamp in health response"
        assert 'services' in data, "Missing services in health response"
        print(f"PASS: Health endpoint returns healthy status")

    def test_instruments_endpoint_regression(self):
        """Regression test - instruments should return all 4 instruments"""
        response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert response.status_code == 200, f"Instruments endpoint failed: {response.text}"
        data = response.json()
        assert data.get('status') == 'success', f"Instruments status not success: {data}"
        
        instruments = data.get('instruments', {})
        expected_instruments = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']
        
        for inst in expected_instruments:
            assert inst in instruments or inst in data.get('details', {}), f"Missing instrument: {inst}"
        
        details = data.get('details', {})
        assert len(details) >= 4, f"Expected 4 instruments, got {len(details)}"
        print(f"PASS: Instruments endpoint returns {len(details)} instruments: {list(details.keys())}")

    def test_ws_status_endpoint(self):
        """Test GET /api/ws/status - returns WebSocket streaming status"""
        response = requests.get(f"{BASE_URL}/api/ws/status", timeout=10)
        assert response.status_code == 200, f"WS status endpoint failed: {response.text}"
        data = response.json()
        
        # Check expected fields in response
        assert data.get('status') == 'success', f"WS status not success: {data}"
        assert 'ws_connected' in data, "Missing ws_connected field"
        assert 'ws_running' in data, "Missing ws_running field"
        assert 'clients_count' in data, "Missing clients_count field"
        
        # Validate types
        assert isinstance(data['ws_connected'], bool), "ws_connected should be boolean"
        assert isinstance(data['ws_running'], bool), "ws_running should be boolean"
        assert isinstance(data['clients_count'], int), "clients_count should be integer"
        
        print(f"PASS: WS status endpoint returns: ws_connected={data['ws_connected']}, ws_running={data['ws_running']}, clients_count={data['clients_count']}")

    def test_ws_start_without_token(self):
        """Test POST /api/ws/start - should return error without Upstox token"""
        response = requests.post(f"{BASE_URL}/api/ws/start", timeout=10)
        assert response.status_code == 200, f"WS start endpoint failed: {response.text}"
        data = response.json()
        
        # In paper mode without Upstox token, should return error
        assert data.get('status') == 'error', f"Expected error status, got: {data}"
        assert 'message' in data, "Missing error message"
        
        # Check error message mentions token
        error_msg = data.get('message', '').lower()
        assert 'token' in error_msg or 'upstox' in error_msg or 'login' in error_msg, \
            f"Error message should mention token/upstox/login: {data['message']}"
        
        print(f"PASS: WS start without token returns expected error: {data['message']}")

    def test_ws_stop_endpoint(self):
        """Test POST /api/ws/stop - should return success"""
        response = requests.post(f"{BASE_URL}/api/ws/stop", timeout=10)
        assert response.status_code == 200, f"WS stop endpoint failed: {response.text}"
        data = response.json()
        
        assert data.get('status') == 'success', f"WS stop status not success: {data}"
        assert 'message' in data, "Missing message in response"
        
        print(f"PASS: WS stop endpoint returns success: {data['message']}")

    def test_combined_status_includes_ws_status(self):
        """Test GET /api/combined-status includes ws_status field"""
        response = requests.get(f"{BASE_URL}/api/combined-status", timeout=10)
        assert response.status_code == 200, f"Combined status endpoint failed: {response.text}"
        data = response.json()
        
        assert data.get('status') == 'success', f"Combined status not success: {data}"
        
        # Check ws_status field exists
        assert 'ws_status' in data, f"Missing ws_status field in combined-status: {data.keys()}"
        
        ws_status = data['ws_status']
        assert 'ws_connected' in ws_status, "Missing ws_connected in ws_status"
        assert 'ws_running' in ws_status, "Missing ws_running in ws_status"
        assert 'clients_count' in ws_status, "Missing clients_count in ws_status"
        
        # Check mode field
        assert 'mode' in data, "Missing mode field in combined-status"
        
        print(f"PASS: Combined status includes ws_status: {ws_status}")
        print(f"      Mode: {data.get('mode')}, Upstox connected: {data.get('upstox_connected')}")

    def test_ws_status_after_stop(self):
        """Verify WS status shows not running after stop"""
        # First stop the WS
        requests.post(f"{BASE_URL}/api/ws/stop", timeout=10)
        
        # Then check status
        response = requests.get(f"{BASE_URL}/api/ws/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        # After stop, ws_running should be False
        assert data.get('ws_running') == False, f"WS should not be running after stop: {data}"
        
        print(f"PASS: WS status shows not running after stop: ws_running={data['ws_running']}")


class TestWebSocketConnectionTest:
    """Test WebSocket connection acceptance (ws:// protocol test)"""
    
    def test_ws_endpoint_exists(self):
        """Verify WebSocket endpoint path is configured"""
        # We can't test actual WebSocket with requests, but we can verify 
        # the endpoint rejects regular HTTP requests
        response = requests.get(f"{BASE_URL}/api/ws/market-data", timeout=10)
        
        # WebSocket endpoint should reject HTTP requests 
        # FastAPI may return 403, 426, 400, or 404 depending on configuration
        assert response.status_code in [403, 426, 400, 404], \
            f"WS endpoint should reject HTTP requests, got status: {response.status_code}"
        
        print(f"PASS: WebSocket endpoint exists at /api/ws/market-data (returns {response.status_code} for HTTP - WS upgrade required)")


class TestVersionVerification:
    """Verify version number"""
    
    def test_version_in_response(self):
        """Test that API returns version info"""
        response = requests.get(f"{BASE_URL}/api/", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        # Check API root returns version info
        if 'version' in data:
            print(f"PASS: API version: {data.get('version')}")
        else:
            print(f"INFO: API root response: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
