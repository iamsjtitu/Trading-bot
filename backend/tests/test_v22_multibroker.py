"""
Version 2.2.0 Multi-Broker Backend Tests
Tests:
- GET /api/brokers/list - 6 brokers with descriptions
- GET /api/brokers/auth-url - auth URL for active broker
- GET /api/brokers/connection - active broker connection check
- POST /api/brokers/set-active - switch active broker
- GET /api/broker/profile - active broker profile
- GET /api/broker/portfolio - active broker portfolio
- GET /api/broker/orders - active broker orders
- GET /api/option-chain/instruments - 9 instruments including MCX
- GET /api/option-chain/CRUDEOIL - MCX crude oil option chain
- GET /api/market-status - both NSE and MCX status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sentiment-trade-bot-2.preview.emergentagent.com').rstrip('/')


class TestBrokersListEndpoint:
    """Test GET /api/brokers/list returns all 6 brokers with descriptions"""
    
    def test_brokers_list_returns_6_brokers(self):
        """Verify we get exactly 6 brokers"""
        response = requests.get(f"{BASE_URL}/api/brokers/list")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'brokers' in data
        assert len(data['brokers']) == 6, f"Expected 6 brokers, got {len(data['brokers'])}"
    
    def test_brokers_have_required_fields(self):
        """Verify each broker has id, name, description"""
        response = requests.get(f"{BASE_URL}/api/brokers/list")
        data = response.json()
        expected_brokers = ['upstox', 'zerodha', 'angelone', 'fivepaisa', 'paytm_money', 'iifl']
        
        broker_ids = [b['id'] for b in data['brokers']]
        for expected_id in expected_brokers:
            assert expected_id in broker_ids, f"Missing broker: {expected_id}"
        
        for broker in data['brokers']:
            assert 'id' in broker, "Broker missing 'id'"
            assert 'name' in broker, f"Broker {broker.get('id')} missing 'name'"
            assert 'description' in broker, f"Broker {broker.get('id')} missing 'description'"
            assert len(broker['description']) > 0, f"Broker {broker.get('id')} has empty description"


class TestBrokerSwitching:
    """Test broker switching functionality"""
    
    def test_set_active_broker_zerodha(self):
        """Switch to Zerodha"""
        response = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'zerodha'})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['active_broker'] == 'zerodha'
    
    def test_set_active_broker_upstox(self):
        """Switch back to Upstox"""
        response = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['active_broker'] == 'upstox'
    
    def test_invalid_broker_returns_error(self):
        """Invalid broker should return error"""
        response = requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'invalid_broker'})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error'


class TestBrokerAuthURL:
    """Test GET /api/brokers/auth-url returns auth URL for active broker"""
    
    def test_auth_url_returns_success(self):
        """Auth URL endpoint should return a URL"""
        # First set to upstox
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})
        
        response = requests.get(f"{BASE_URL}/api/brokers/auth-url")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'auth_url' in data
    
    def test_auth_url_for_zerodha(self):
        """Test auth URL for Zerodha"""
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'zerodha'})
        
        response = requests.get(f"{BASE_URL}/api/brokers/auth-url")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'auth_url' in data
        assert 'zerodha' in data['auth_url'].lower() or 'kite' in data['auth_url'].lower()
        
        # Switch back to upstox
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={'broker_id': 'upstox'})


class TestBrokerConnection:
    """Test GET /api/brokers/connection checks active broker connection"""
    
    def test_connection_returns_disconnected(self):
        """Without token, should return disconnected"""
        response = requests.get(f"{BASE_URL}/api/brokers/connection")
        assert response.status_code == 200
        data = response.json()
        # Without broker token, should be disconnected
        assert 'connected' in data
        assert data['connected'] == False


class TestBrokerEndpoints:
    """Test broker profile/portfolio/orders endpoints"""
    
    def test_broker_profile_not_logged_in(self):
        """Profile should return error when not logged in"""
        response = requests.get(f"{BASE_URL}/api/broker/profile")
        assert response.status_code == 200
        data = response.json()
        # Should show error since not logged in
        assert data['status'] == 'error' or 'profile' in data
    
    def test_broker_portfolio_not_logged_in(self):
        """Portfolio should return error when not logged in"""
        response = requests.get(f"{BASE_URL}/api/broker/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error' or 'positions' in data
    
    def test_broker_orders_not_logged_in(self):
        """Orders should return error or empty when not logged in"""
        response = requests.get(f"{BASE_URL}/api/broker/orders")
        assert response.status_code == 200
        data = response.json()
        # Should return error or empty orders
        assert data['status'] == 'error' or 'orders' in data


class TestOptionChainInstruments:
    """Test GET /api/option-chain/instruments returns 9 instruments including MCX"""
    
    def test_instruments_returns_9(self):
        """Should return exactly 9 instruments"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'instruments' in data
        instruments = data['instruments']
        assert len(instruments) == 9, f"Expected 9 instruments, got {len(instruments)}"
    
    def test_instruments_include_mcx(self):
        """Should include MCX commodities: CRUDEOIL, GOLD, SILVER"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data['instruments']
        
        assert 'CRUDEOIL' in instruments, "Missing CRUDEOIL"
        assert 'GOLD' in instruments, "Missing GOLD"
        assert 'SILVER' in instruments, "Missing SILVER"
        
        # Verify MCX exchange
        assert instruments['CRUDEOIL']['exchange'] == 'MCX'
        assert instruments['GOLD']['exchange'] == 'MCX'
        assert instruments['SILVER']['exchange'] == 'MCX'
    
    def test_instruments_include_nse_bse(self):
        """Should include NSE and BSE index options"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data['instruments']
        
        expected_nse = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']
        expected_bse = ['SENSEX', 'BANKEX']
        
        for inst in expected_nse:
            assert inst in instruments, f"Missing {inst}"
            assert instruments[inst]['exchange'] == 'NSE'
        
        for inst in expected_bse:
            assert inst in instruments, f"Missing {inst}"
            assert instruments[inst]['exchange'] == 'BSE'


class TestMCXOptionChain:
    """Test GET /api/option-chain/CRUDEOIL returns MCX crude oil option chain"""
    
    def test_crudeoil_option_chain(self):
        """CRUDEOIL option chain should return valid data"""
        response = requests.get(f"{BASE_URL}/api/option-chain/CRUDEOIL")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'CRUDEOIL'
        assert 'chain' in data
        assert len(data['chain']) > 0
        assert 'spot_price' in data
        assert 'atm_strike' in data
    
    def test_gold_option_chain(self):
        """GOLD option chain should return valid data"""
        response = requests.get(f"{BASE_URL}/api/option-chain/GOLD")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'GOLD'
        assert 'chain' in data
    
    def test_silver_option_chain(self):
        """SILVER option chain should return valid data"""
        response = requests.get(f"{BASE_URL}/api/option-chain/SILVER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'SILVER'
        assert 'chain' in data


class TestMarketStatus:
    """Test GET /api/market-status returns both NSE and MCX status"""
    
    def test_market_status_returns_nse_and_mcx(self):
        """Market status should include both NSE and MCX"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'nse' in data, "Missing NSE status"
        assert 'mcx' in data, "Missing MCX status"
    
    def test_nse_status_fields(self):
        """NSE status should have required fields"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        data = response.json()
        nse = data['nse']
        assert 'is_open' in nse
        assert 'message' in nse
    
    def test_mcx_status_fields(self):
        """MCX status should have required fields"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        data = response.json()
        mcx = data['mcx']
        assert 'is_open' in mcx
        assert 'message' in mcx


class TestAPIVersion:
    """Test version 2.2.0 is displayed"""
    
    def test_api_version(self):
        """API should return version 2.2.0"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data['app_version'] == '2.2.0'


class TestHealthAndSettings:
    """Basic health and settings tests"""
    
    def test_health_endpoint(self):
        """Health check should return healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
    
    def test_settings_endpoint(self):
        """Settings endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'settings' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
