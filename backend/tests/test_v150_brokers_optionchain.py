"""
Test Suite for v1.5.0 Features:
1. Multi-Broker Support (Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL)
2. Live Option Chain with Greeks (9 instruments - 6 index + 3 MCX)

Tests broker management APIs and option chain service endpoints.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBrokerManagement:
    """Broker management endpoint tests"""
    
    def test_get_brokers_list(self):
        """GET /api/brokers/list - should return all 6 brokers with active broker"""
        response = requests.get(f"{BASE_URL}/api/brokers/list", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'brokers' in data
        assert 'active' in data
        
        brokers = data['brokers']
        assert len(brokers) == 6, f"Expected 6 brokers, got {len(brokers)}"
        
        broker_ids = [b['id'] for b in brokers]
        expected_ids = ['upstox', 'zerodha', 'angelone', 'fivepaisa', 'paytm_money', 'iifl']
        assert set(broker_ids) == set(expected_ids), f"Broker IDs mismatch: {broker_ids}"
        
        # Verify each broker has required fields
        for broker in brokers:
            assert 'id' in broker
            assert 'name' in broker
            assert 'auth_type' in broker
            assert 'description' in broker
            print(f"Broker: {broker['name']} ({broker['id']}) - {broker['auth_type']}")
    
    def test_set_active_broker_zerodha(self):
        """POST /api/brokers/set-active - change to Zerodha"""
        response = requests.post(
            f"{BASE_URL}/api/brokers/set-active",
            json={"broker_id": "zerodha"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['active_broker'] == 'zerodha'
        print(f"Active broker set to: {data['active_broker']}")
    
    def test_set_active_broker_invalid(self):
        """POST /api/brokers/set-active - should fail for unknown broker"""
        response = requests.post(
            f"{BASE_URL}/api/brokers/set-active",
            json={"broker_id": "invalid_broker"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'error'
        assert 'Unknown broker' in data['message'] or 'invalid_broker' in data['message']
        print(f"Error response: {data['message']}")
    
    def test_get_active_broker(self):
        """GET /api/brokers/active - should return active broker info"""
        # First set to a known broker
        requests.post(
            f"{BASE_URL}/api/brokers/set-active",
            json={"broker_id": "upstox"},
            timeout=10
        )
        
        response = requests.get(f"{BASE_URL}/api/brokers/active", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'id' in data
        assert 'name' in data
        assert data['active'] == True
        print(f"Active broker: {data['name']} ({data['id']})")


class TestOptionChainInstruments:
    """Option chain instruments endpoint tests"""
    
    def test_get_instruments(self):
        """GET /api/option-chain/instruments - should return all 9 instruments"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'instruments' in data
        
        instruments = data['instruments']
        
        # Expected instruments: 6 index + 3 MCX
        expected = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX', 
                   'CRUDEOIL', 'GOLD', 'SILVER']
        assert len(instruments) == 9, f"Expected 9 instruments, got {len(instruments)}"
        
        for inst in expected:
            assert inst in instruments, f"Missing instrument: {inst}"
            print(f"Instrument: {inst} - {instruments[inst]['name']} ({instruments[inst]['exchange']})")
        
        # Verify index vs commodity types
        index_instruments = [k for k, v in instruments.items() if v.get('type') == 'index']
        commodity_instruments = [k for k, v in instruments.items() if v.get('type') == 'commodity']
        
        assert len(index_instruments) == 6, f"Expected 6 index instruments, got {len(index_instruments)}"
        assert len(commodity_instruments) == 3, f"Expected 3 commodity instruments, got {len(commodity_instruments)}"


class TestOptionChainData:
    """Option chain data endpoint tests"""
    
    def test_get_nifty_option_chain(self):
        """GET /api/option-chain/NIFTY - should return option chain with greeks"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'NIFTY'
        
        # Verify structure
        assert 'spot_price' in data
        assert 'atm_strike' in data
        assert 'chain' in data
        assert 'summary' in data
        assert 'config' in data
        
        # Verify summary has required fields
        summary = data['summary']
        assert 'total_ce_oi' in summary
        assert 'total_pe_oi' in summary
        assert 'pcr' in summary
        assert 'max_pain' in summary
        assert 'iv_atm' in summary
        
        print(f"NIFTY Spot: {data['spot_price']}, ATM: {data['atm_strike']}, PCR: {summary['pcr']}, Max Pain: {summary['max_pain']}")
        
        # Verify chain structure
        chain = data['chain']
        assert len(chain) > 0
        
        # Check first row for required fields
        row = chain[0]
        assert 'strike' in row
        assert 'ce' in row
        assert 'pe' in row
        assert 'is_atm' in row
        
        # Verify CE side has greeks
        ce = row['ce']
        assert 'ltp' in ce
        assert 'delta' in ce
        assert 'gamma' in ce
        assert 'theta' in ce
        assert 'vega' in ce
        assert 'iv' in ce
        assert 'oi' in ce
        
        # Verify PE side has greeks
        pe = row['pe']
        assert 'ltp' in pe
        assert 'delta' in pe
        assert 'gamma' in pe
        assert 'theta' in pe
        assert 'vega' in pe
        assert 'iv' in pe
        assert 'oi' in pe
        
        print(f"Chain rows: {len(chain)}, CE Delta range: {chain[0]['ce']['delta']} to {chain[-1]['ce']['delta']}")
    
    def test_get_banknifty_option_chain(self):
        """GET /api/option-chain/BANKNIFTY - should return different params from NIFTY"""
        nifty_resp = requests.get(f"{BASE_URL}/api/option-chain/NIFTY", timeout=10)
        banknifty_resp = requests.get(f"{BASE_URL}/api/option-chain/BANKNIFTY", timeout=10)
        
        assert banknifty_resp.status_code == 200
        
        nifty = nifty_resp.json()
        banknifty = banknifty_resp.json()
        
        assert banknifty['status'] == 'success'
        assert banknifty['instrument'] == 'BANKNIFTY'
        
        # Verify different lot sizes
        assert nifty['config']['lot_size'] != banknifty['config']['lot_size'] or \
               nifty['config']['strike_step'] != banknifty['config']['strike_step']
        
        print(f"NIFTY: lot={nifty['config']['lot_size']}, step={nifty['config']['strike_step']}")
        print(f"BANKNIFTY: lot={banknifty['config']['lot_size']}, step={banknifty['config']['strike_step']}")
    
    def test_get_gold_mcx_option_chain(self):
        """GET /api/option-chain/GOLD - should return MCX commodity option chain"""
        response = requests.get(f"{BASE_URL}/api/option-chain/GOLD", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'GOLD'
        
        # Verify it's MCX commodity
        assert data['config']['exchange'] == 'MCX'
        assert data['config']['type'] == 'commodity'
        
        print(f"GOLD MCX: Spot={data['spot_price']}, Lot={data['config']['lot_size']}, Step={data['config']['strike_step']}")
    
    def test_get_invalid_instrument(self):
        """GET /api/option-chain/INVALID - should return error"""
        response = requests.get(f"{BASE_URL}/api/option-chain/INVALID_INSTRUMENT", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'error'
        assert 'Unknown instrument' in data['message'] or 'INVALID' in data['message']
        print(f"Error response: {data['message']}")


class TestGreeksCalculation:
    """Greeks calculation endpoint tests"""
    
    def test_calculate_single_greeks(self):
        """POST /api/option-chain/greeks - should calculate greeks for single option"""
        payload = {
            'spot': 24000,
            'strike': 24000,
            'days_to_expiry': 7,
            'iv': 15,
            'option_type': 'CE'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/option-chain/greeks",
            json=payload,
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        # Verify all greeks are present
        assert 'delta' in data
        assert 'gamma' in data
        assert 'theta' in data
        assert 'vega' in data
        assert 'rho' in data
        assert 'price' in data
        
        # ATM call delta should be around 0.5
        assert 0.4 <= data['delta'] <= 0.6, f"ATM CE delta should be ~0.5, got {data['delta']}"
        
        # Gamma should be positive
        assert data['gamma'] > 0
        
        # Theta should be negative (time decay)
        assert data['theta'] < 0
        
        print(f"ATM CE Greeks: Delta={data['delta']}, Gamma={data['gamma']}, Theta={data['theta']}, Vega={data['vega']}, Price={data['price']}")
    
    def test_calculate_iv(self):
        """POST /api/option-chain/iv - should calculate implied volatility"""
        payload = {
            'market_price': 150,
            'spot': 24000,
            'strike': 24000,
            'days_to_expiry': 7,
            'option_type': 'CE'
        }
        
        response = requests.post(
            f"{BASE_URL}/api/option-chain/iv",
            json=payload,
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'iv' in data
        assert 'option_type' in data
        
        # IV should be a reasonable percentage
        assert 5 <= data['iv'] <= 100, f"IV should be between 5-100%, got {data['iv']}%"
        
        print(f"Calculated IV: {data['iv']}% for {data['option_type']}")


class TestRegressionHealth:
    """Regression tests for health and existing features"""
    
    def test_health_endpoint(self):
        """GET /api/health - should still be healthy (regression)"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'services' in data
        
        services = data['services']
        assert services['news'] == 'active'
        assert services['sentiment'] == 'active'
        assert services['trading'] == 'active'
        
        print(f"Health check passed: {data['status']}")


class TestAllBrokerSwitching:
    """Test switching between all 6 brokers"""
    
    def test_cycle_through_all_brokers(self):
        """Cycle through all brokers and verify switching works"""
        broker_ids = ['upstox', 'zerodha', 'angelone', 'fivepaisa', 'paytm_money', 'iifl']
        
        for broker_id in broker_ids:
            response = requests.post(
                f"{BASE_URL}/api/brokers/set-active",
                json={"broker_id": broker_id},
                timeout=10
            )
            assert response.status_code == 200
            
            data = response.json()
            assert data['status'] == 'success'
            assert data['active_broker'] == broker_id
            
            # Verify active broker returns correct info
            active_resp = requests.get(f"{BASE_URL}/api/brokers/active", timeout=10)
            active_data = active_resp.json()
            assert active_data['id'] == broker_id
            
            print(f"Switched to: {broker_id} - Active broker confirmed: {active_data['name']}")
        
        # Reset back to upstox
        requests.post(f"{BASE_URL}/api/brokers/set-active", json={"broker_id": "upstox"}, timeout=10)


class TestAllOptionChainInstruments:
    """Test option chain for all 9 instruments"""
    
    def test_all_index_instruments(self):
        """Test option chain for all 6 index instruments"""
        index_instruments = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']
        
        for inst in index_instruments:
            response = requests.get(f"{BASE_URL}/api/option-chain/{inst}", timeout=10)
            assert response.status_code == 200
            
            data = response.json()
            assert data['status'] == 'success', f"Failed for {inst}: {data.get('message', 'unknown error')}"
            assert data['instrument'] == inst
            assert data['config']['type'] == 'index'
            
            print(f"{inst}: Spot={data['spot_price']}, Lot={data['config']['lot_size']}, Exchange={data['config']['exchange']}")
    
    def test_all_mcx_instruments(self):
        """Test option chain for all 3 MCX commodity instruments"""
        mcx_instruments = ['CRUDEOIL', 'GOLD', 'SILVER']
        
        for inst in mcx_instruments:
            response = requests.get(f"{BASE_URL}/api/option-chain/{inst}", timeout=10)
            assert response.status_code == 200
            
            data = response.json()
            assert data['status'] == 'success', f"Failed for {inst}: {data.get('message', 'unknown error')}"
            assert data['instrument'] == inst
            assert data['config']['type'] == 'commodity'
            assert data['config']['exchange'] == 'MCX'
            
            print(f"{inst}: Spot={data['spot_price']}, Lot={data['config']['lot_size']}, Exchange={data['config']['exchange']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
