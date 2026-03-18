"""
Iteration 15: Test MCX Commodities & Option Chain Features
- MCX instruments (CRUDEOIL, GOLD, SILVER) added to trading instruments  
- Real-time option chain from broker (tries live, falls back to simulated)
- Auto-refresh toggle in Option Chain UI
- Exchange mapping: NSE→NFO, BSE→BFO, MCX→MCX
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


class TestInstrumentsAPI:
    """Test instruments endpoints including MCX commodities"""

    def test_get_instruments_returns_9(self):
        """GET /api/instruments should return 9 instruments"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'instruments' in data
        assert len(data['instruments']) == 9, f"Expected 9 instruments, got {len(data['instruments'])}"

    def test_instruments_include_mcx_commodities(self):
        """Verify MCX commodities (CRUDEOIL, GOLD, SILVER) are present"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        data = response.json()
        instruments = data['instruments']
        
        # Check MCX instruments exist
        assert 'CRUDEOIL' in instruments, "CRUDEOIL missing from instruments"
        assert 'GOLD' in instruments, "GOLD missing from instruments"
        assert 'SILVER' in instruments, "SILVER missing from instruments"

    def test_instruments_have_exchange_field(self):
        """Verify instruments have correct exchange mapping"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        data = response.json()
        details = data['details']
        
        # Check exchange values
        assert details['CRUDEOIL']['exchange'] == 'MCX'
        assert details['GOLD']['exchange'] == 'MCX'
        assert details['SILVER']['exchange'] == 'MCX'
        assert details['NIFTY50']['exchange'] == 'NSE'
        assert details['BANKNIFTY']['exchange'] == 'NSE'
        assert details['SENSEX']['exchange'] == 'BSE'
        assert details['BANKEX']['exchange'] == 'BSE'

    def test_set_instrument_gold(self):
        """POST /api/instruments/set with instrument=GOLD should work"""
        response = requests.post(f"{BASE_URL}/api/instruments/set", json={'instrument': 'GOLD'})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['active'] == 'GOLD'
        assert data['details']['exchange'] == 'MCX'

    def test_set_instrument_crudeoil(self):
        """POST /api/instruments/set with instrument=CRUDEOIL should work"""
        response = requests.post(f"{BASE_URL}/api/instruments/set", json={'instrument': 'CRUDEOIL'})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['active'] == 'CRUDEOIL'
        assert data['details']['exchange'] == 'MCX'

    def test_set_instrument_invalid(self):
        """POST /api/instruments/set with invalid instrument should fail"""
        response = requests.post(f"{BASE_URL}/api/instruments/set", json={'instrument': 'INVALID'})
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error'


class TestOptionChainAPI:
    """Test option chain endpoints for all instruments including MCX"""

    def test_option_chain_gold(self):
        """GET /api/option-chain/GOLD returns option chain for MCX Gold"""
        response = requests.get(f"{BASE_URL}/api/option-chain/GOLD")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'GOLD'
        assert data['config']['exchange'] == 'MCX'
        assert data['config']['type'] == 'commodity'
        assert 'chain' in data
        assert len(data['chain']) > 0
        assert 'summary' in data
        assert 'pcr' in data['summary']
        assert 'max_pain' in data['summary']

    def test_option_chain_silver(self):
        """GET /api/option-chain/SILVER returns option chain for MCX Silver"""
        response = requests.get(f"{BASE_URL}/api/option-chain/SILVER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'SILVER'
        assert data['config']['exchange'] == 'MCX'
        assert data['config']['type'] == 'commodity'

    def test_option_chain_crudeoil(self):
        """GET /api/option-chain/CRUDEOIL returns option chain for MCX Crude Oil"""
        response = requests.get(f"{BASE_URL}/api/option-chain/CRUDEOIL")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'CRUDEOIL'
        assert data['config']['exchange'] == 'MCX'
        assert data['config']['type'] == 'commodity'

    def test_option_chain_sensex(self):
        """GET /api/option-chain/SENSEX returns option chain for BSE SENSEX"""
        response = requests.get(f"{BASE_URL}/api/option-chain/SENSEX")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'SENSEX'
        assert data['config']['exchange'] == 'BSE'
        assert data['config']['type'] == 'index'

    def test_option_chain_bankex(self):
        """GET /api/option-chain/BANKEX returns option chain for BSE BANKEX"""
        response = requests.get(f"{BASE_URL}/api/option-chain/BANKEX")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'BANKEX'
        assert data['config']['exchange'] == 'BSE'
        assert data['config']['type'] == 'index'

    def test_option_chain_nifty(self):
        """GET /api/option-chain/NIFTY returns option chain for NSE NIFTY"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'NIFTY'
        assert data['config']['exchange'] == 'NSE'

    def test_option_chain_has_greeks(self):
        """Option chain should include greek values (delta, gamma, theta, vega)"""
        response = requests.get(f"{BASE_URL}/api/option-chain/GOLD")
        assert response.status_code == 200
        data = response.json()
        chain = data['chain']
        assert len(chain) > 0
        row = chain[0]
        assert 'delta' in row['ce']
        assert 'gamma' in row['ce']
        assert 'theta' in row['ce']
        assert 'vega' in row['ce']
        assert 'delta' in row['pe']


class TestOIBuildupAPI:
    """Test OI Buildup alerts for all instruments"""

    def test_oi_buildup_gold(self):
        """GET /api/option-chain/oi-buildup/GOLD returns OI buildup alerts"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/GOLD")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'GOLD'
        assert 'alerts' in data
        assert len(data['alerts']) > 0
        # Check alert structure
        alert = data['alerts'][0]
        assert 'type' in alert
        assert 'severity' in alert
        assert 'message' in alert

    def test_oi_buildup_silver(self):
        """GET /api/option-chain/oi-buildup/SILVER returns OI alerts"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/SILVER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'SILVER'

    def test_oi_buildup_crudeoil(self):
        """GET /api/option-chain/oi-buildup/CRUDEOIL returns OI alerts"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/CRUDEOIL")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'CRUDEOIL'

    def test_oi_buildup_nifty(self):
        """GET /api/option-chain/oi-buildup/NIFTY returns OI alerts"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/NIFTY")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'alerts' in data

    def test_oi_buildup_invalid_instrument(self):
        """GET /api/option-chain/oi-buildup/INVALID returns error status"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/INVALID")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error'


class TestOptionChainInstrumentsEndpoint:
    """Test /api/option-chain/instruments endpoint"""

    def test_get_option_chain_instruments(self):
        """GET /api/option-chain/instruments returns all 9 instruments"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        instruments = data['instruments']
        
        # Check all 9 instruments exist
        expected = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX', 'CRUDEOIL', 'GOLD', 'SILVER']
        for inst in expected:
            assert inst in instruments, f"{inst} missing from option chain instruments"
        
        # Check MCX commodities have correct type
        assert instruments['GOLD']['type'] == 'commodity'
        assert instruments['SILVER']['type'] == 'commodity'
        assert instruments['CRUDEOIL']['type'] == 'commodity'


class TestRegressionHealth:
    """Regression tests for health and brokers"""

    def test_health_endpoint(self):
        """GET /api/health should be healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'services' in data

    def test_brokers_list(self):
        """GET /api/brokers/list should return 6 brokers"""
        response = requests.get(f"{BASE_URL}/api/brokers/list")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'brokers' in data
        assert len(data['brokers']) == 6, f"Expected 6 brokers, got {len(data['brokers'])}"


class TestOptionChainSource:
    """Test that option chain correctly reports source (live vs simulated)"""

    def test_option_chain_source_is_simulated(self):
        """Option chain should return simulated source when Upstox not connected"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        # Since Upstox is not connected, source should be empty (simulated)
        # The source field may or may not exist for simulated data
        # If it exists, it should NOT be 'live'
        if 'source' in data:
            # Can be None or not 'live'
            assert data['source'] != 'live' or data['source'] is None
        # Verify chain data exists regardless
        assert 'chain' in data
        assert len(data['chain']) > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
