"""
Test suite for Version 2.5.0 - Option Chain Fix (No Simulation Fallback)
Verifies that:
1. NSE/BSE instruments return source='market_closed' when market is closed
2. MCX instruments return source='broker_disconnected' when market is open but no broker
3. No simulated data is returned - empty chain when not live
4. OI buildup endpoint respects market status
5. API version is 2.5.0
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVersionAndHealth:
    """Verify API version and health"""
    
    def test_api_version_250(self):
        """Verify app_version is 2.5.0"""
        resp = requests.get(f"{BASE_URL}/api/")
        assert resp.status_code == 200
        data = resp.json()
        assert data['app_version'] == '2.5.0', f"Expected app_version 2.5.0, got {data.get('app_version')}"
        print(f"PASS: API version is {data['app_version']}")
    
    def test_health_check(self):
        """Verify health endpoint"""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'healthy'
        print("PASS: Health check passed")


class TestMarketStatus:
    """Test market status endpoints"""
    
    def test_market_status_endpoint(self):
        """Verify market status endpoint returns NSE and MCX status"""
        resp = requests.get(f"{BASE_URL}/api/market-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'nse' in data
        assert 'mcx' in data
        # NSE should be closed (after 3:30 PM IST)
        assert data['nse']['is_open'] == False, "NSE should be closed after trading hours"
        # MCX should be open (9 AM - 11:30 PM IST)
        assert 'is_open' in data['mcx']
        print(f"PASS: NSE is_open={data['nse']['is_open']}, MCX is_open={data['mcx']['is_open']}")


class TestOptionChainInstruments:
    """Test instruments endpoint"""
    
    def test_option_chain_instruments_returns_9(self):
        """Verify 9 instruments are returned"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        instruments = data['instruments']
        assert len(instruments) == 9, f"Expected 9 instruments, got {len(instruments)}"
        expected = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX', 'CRUDEOIL', 'GOLD', 'SILVER']
        for inst in expected:
            assert inst in instruments, f"Missing instrument: {inst}"
        print(f"PASS: All 9 instruments returned: {list(instruments.keys())}")


class TestNSEOptionChainMarketClosed:
    """Test NSE/BSE instruments return market_closed source"""
    
    def test_nifty50_market_closed(self):
        """NIFTY50 should return source='market_closed' when NSE is closed"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/NIFTY50")
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert data['source'] == 'market_closed', f"Expected source='market_closed', got {data.get('source')}"
        assert len(data.get('chain', [])) == 0, "Chain should be empty when market is closed"
        assert 'market_message' in data
        print(f"PASS: NIFTY50 source={data['source']}, message={data['market_message']}")
    
    def test_banknifty_market_closed(self):
        """BANKNIFTY should return source='market_closed'"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/BANKNIFTY")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'market_closed'
        assert len(data.get('chain', [])) == 0
        print(f"PASS: BANKNIFTY source={data['source']}")
    
    def test_sensex_market_closed(self):
        """SENSEX (BSE) should return source='market_closed' (uses NSE hours)"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/SENSEX")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'market_closed'
        assert len(data.get('chain', [])) == 0
        print(f"PASS: SENSEX source={data['source']}")


class TestMCXOptionChainBrokerDisconnected:
    """Test MCX instruments return broker_disconnected when market is open but no broker"""
    
    def test_crudeoil_broker_disconnected(self):
        """CRUDEOIL should return source='broker_disconnected' when MCX open, no broker"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/CRUDEOIL")
        assert resp.status_code == 200
        data = resp.json()
        # MCX is open (9AM-11:30PM) but no broker connected
        assert data['source'] == 'broker_disconnected', f"Expected source='broker_disconnected', got {data.get('source')}"
        assert len(data.get('chain', [])) == 0, "Chain should be empty when broker is disconnected"
        assert 'market_message' in data
        print(f"PASS: CRUDEOIL source={data['source']}, message={data['market_message']}")
    
    def test_gold_broker_disconnected(self):
        """GOLD should return source='broker_disconnected'"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/GOLD")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'broker_disconnected'
        assert len(data.get('chain', [])) == 0
        print(f"PASS: GOLD source={data['source']}")
    
    def test_silver_broker_disconnected(self):
        """SILVER should return source='broker_disconnected'"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/SILVER")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'broker_disconnected'
        assert len(data.get('chain', [])) == 0
        print(f"PASS: SILVER source={data['source']}")


class TestOIBuildupEndpoint:
    """Test OI Buildup endpoint respects market status"""
    
    def test_nifty50_oi_buildup_market_closed(self):
        """NIFTY50 OI buildup should return source='market_closed' with empty alerts"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/NIFTY50")
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert data['source'] == 'market_closed', f"Expected source='market_closed', got {data.get('source')}"
        assert len(data.get('alerts', [])) == 0, "Alerts should be empty when market is closed"
        print(f"PASS: NIFTY50 OI buildup source={data['source']}, alerts={len(data.get('alerts', []))}")
    
    def test_banknifty_oi_buildup_market_closed(self):
        """BANKNIFTY OI buildup should return source='market_closed' with empty alerts"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/BANKNIFTY")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'market_closed'
        assert len(data.get('alerts', [])) == 0
        print(f"PASS: BANKNIFTY OI buildup source={data['source']}")


class TestNoSimulationFallback:
    """Verify that simulation data is NOT returned anymore"""
    
    def test_no_simulation_source_for_nifty(self):
        """NIFTY50 should NOT return source='simulated' or 'generated'"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/NIFTY50")
        assert resp.status_code == 200
        data = resp.json()
        source = data.get('source', '')
        assert source != 'simulated', "Should NOT return simulated data"
        assert source != 'generated', "Should NOT return generated data"
        assert source in ['market_closed', 'broker_disconnected', 'broker_error', 'live'], f"Unexpected source: {source}"
        print(f"PASS: No simulation fallback - source={source}")
    
    def test_chain_empty_when_not_live(self):
        """Chain should be empty unless source='live'"""
        for inst in ['NIFTY50', 'BANKNIFTY', 'CRUDEOIL', 'GOLD']:
            resp = requests.get(f"{BASE_URL}/api/option-chain/{inst}")
            assert resp.status_code == 200
            data = resp.json()
            if data.get('source') != 'live':
                chain_len = len(data.get('chain', []))
                assert chain_len == 0, f"{inst}: Expected empty chain when source={data.get('source')}, got {chain_len} rows"
        print("PASS: Chain is empty for all non-live sources")


class TestResponseStructure:
    """Verify response structure matches expected format"""
    
    def test_market_closed_response_structure(self):
        """Verify market_closed response has correct fields"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/NIFTY50")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'market_closed'
        required_fields = ['status', 'source', 'instrument', 'config', 'market_message', 'chain', 'timestamp']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        assert 'next_open' in data or data.get('next_open_label'), "Should include next_open info"
        print(f"PASS: market_closed response has all required fields")
    
    def test_broker_disconnected_response_structure(self):
        """Verify broker_disconnected response has correct fields"""
        resp = requests.get(f"{BASE_URL}/api/option-chain/CRUDEOIL")
        assert resp.status_code == 200
        data = resp.json()
        assert data['source'] == 'broker_disconnected'
        required_fields = ['status', 'source', 'instrument', 'config', 'market_message', 'chain', 'timestamp']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        print(f"PASS: broker_disconnected response has all required fields")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
