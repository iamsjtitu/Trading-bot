"""
Iteration 18 Bug Fixes Tests:
1. Option Chain instruments dropdown - API format & 9 instruments (NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX, CRUDEOIL, GOLD, SILVER)
2. Option Chain auto-refresh changed to 1s
3. Broker switching - descriptions added & re-check connection
4. MCX commodity data (Crude Oil, Gold, Silver) added to market ticker, WebSocket, and all backends
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestOptionChainInstruments:
    """Test option chain instruments API returns correct format with all 9 instruments"""

    def test_instruments_endpoint_returns_success(self):
        """GET /api/option-chain/instruments should return 200 with status success"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'instruments' in data

    def test_instruments_returns_object_not_array(self):
        """Instruments should be returned as object with keys, not array"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        # Must be a dict/object, not a list
        assert isinstance(instruments, dict), "Instruments should be an object/dict, not array"

    def test_instruments_count_is_nine(self):
        """Should return exactly 9 instruments"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        assert len(instruments) == 9, f"Expected 9 instruments, got {len(instruments)}"

    def test_all_index_instruments_present(self):
        """All index options should be present: NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        expected_index = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']
        for inst in expected_index:
            assert inst in instruments, f"Missing instrument: {inst}"

    def test_all_mcx_commodities_present(self):
        """MCX commodities should be present: CRUDEOIL, GOLD, SILVER"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        expected_mcx = ['CRUDEOIL', 'GOLD', 'SILVER']
        for inst in expected_mcx:
            assert inst in instruments, f"Missing MCX commodity: {inst}"

    def test_instruments_have_label_field(self):
        """Each instrument should have a 'label' field"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        for key, val in instruments.items():
            assert 'label' in val, f"Instrument {key} missing 'label' field"
            assert val['label'], f"Instrument {key} has empty label"

    def test_instruments_have_exchange_field(self):
        """Each instrument should have an 'exchange' field (NSE, BSE, or MCX)"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        for key, val in instruments.items():
            assert 'exchange' in val, f"Instrument {key} missing 'exchange' field"
            assert val['exchange'] in ['NSE', 'BSE', 'MCX'], f"Instrument {key} has invalid exchange: {val.get('exchange')}"

    def test_mcx_instruments_have_correct_exchange(self):
        """MCX commodities should have exchange='MCX'"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        mcx_instruments = ['CRUDEOIL', 'GOLD', 'SILVER']
        for inst in mcx_instruments:
            assert instruments[inst].get('exchange') == 'MCX', f"{inst} should have exchange='MCX'"


class TestOptionChainData:
    """Test option chain data endpoints for different instruments"""

    def test_nifty50_option_chain(self):
        """GET /api/option-chain/NIFTY50 should return option chain data"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY50")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'NIFTY50'
        assert 'chain' in data
        assert isinstance(data['chain'], list)
        assert len(data['chain']) > 0

    def test_gold_option_chain(self):
        """GET /api/option-chain/GOLD should return MCX Gold option chain"""
        response = requests.get(f"{BASE_URL}/api/option-chain/GOLD")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'GOLD'
        assert data.get('config', {}).get('exchange') == 'MCX'
        assert 'chain' in data
        assert len(data['chain']) > 0

    def test_crudeoil_option_chain(self):
        """GET /api/option-chain/CRUDEOIL should return MCX Crude Oil option chain"""
        response = requests.get(f"{BASE_URL}/api/option-chain/CRUDEOIL")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'CRUDEOIL'
        assert data.get('config', {}).get('exchange') == 'MCX'
        assert 'chain' in data

    def test_silver_option_chain(self):
        """GET /api/option-chain/SILVER should return MCX Silver option chain"""
        response = requests.get(f"{BASE_URL}/api/option-chain/SILVER")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'SILVER'
        assert data.get('config', {}).get('exchange') == 'MCX'


class TestBrokersEndpoint:
    """Test brokers list endpoint for descriptions"""

    def test_brokers_list_returns_success(self):
        """GET /api/brokers/list should return 200"""
        response = requests.get(f"{BASE_URL}/api/brokers/list")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'

    def test_brokers_have_description_field(self):
        """Each broker should have a 'description' field"""
        response = requests.get(f"{BASE_URL}/api/brokers/list")
        data = response.json()
        brokers = data.get('brokers', [])
        assert len(brokers) > 0, "No brokers returned"
        for broker in brokers:
            assert 'description' in broker, f"Broker {broker.get('name')} missing description field"
            assert broker['description'], f"Broker {broker.get('name')} has empty description"


class TestInstrumentsEndpoint:
    """Test /api/instruments endpoint for MCX support"""

    def test_instruments_endpoint_returns_success(self):
        """GET /api/instruments should return 200"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'

    def test_instruments_includes_mcx(self):
        """Instruments should include MCX commodities"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        data = response.json()
        instruments = data.get('instruments', {})
        assert 'CRUDEOIL' in instruments
        assert 'GOLD' in instruments
        assert 'SILVER' in instruments

    def test_instruments_details_include_exchange(self):
        """Instrument details should include exchange field"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        data = response.json()
        details = data.get('details', {})
        mcx_instruments = ['CRUDEOIL', 'GOLD', 'SILVER']
        for inst in mcx_instruments:
            assert details.get(inst, {}).get('exchange') == 'MCX', f"{inst} should have exchange=MCX"


class TestAppVersion:
    """Test app version is 2.0.0"""

    def test_root_endpoint_version(self):
        """GET /api/ should return app_version 2.0.0"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get('app_version') == '2.0.0', f"Expected version 2.0.0, got {data.get('app_version')}"


class TestMarketStatus:
    """Test market status endpoint"""

    def test_market_status_returns_success(self):
        """GET /api/market-status should return valid response"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'is_open' in data
        assert 'message' in data


class TestHealthAndRegression:
    """Health check and regression tests"""

    def test_health_endpoint(self):
        """GET /api/health should return healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'

    def test_settings_endpoint(self):
        """GET /api/settings should return settings"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'

    def test_portfolio_endpoint(self):
        """GET /api/portfolio should return portfolio data"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
