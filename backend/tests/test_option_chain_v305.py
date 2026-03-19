"""
Test Suite for Option Chain Bug Fix - v3.0.5
Tests the fix for Upstox API requiring expiry_date parameter.
The 400 error 'Required request parameter expiry_date is not present' should be resolved.
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://auto-trade-signals-18.preview.emergentagent.com').rstrip('/')


class TestOptionChainAPI:
    """Tests for Option Chain endpoints - verifies no 400 errors"""
    
    def test_option_chain_nifty50_no_400_error(self):
        """GET /api/option-chain/NIFTY50 should return valid JSON (not 400 error)"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY50", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get('status') == 'success', f"Expected status=success, got {data.get('status')}"
        assert data.get('instrument') == 'NIFTY50'
        # Source should be market_closed, broker_disconnected, or live (not error/400)
        assert data.get('source') in ['market_closed', 'broker_disconnected', 'live', 'broker_error'], f"Unexpected source: {data.get('source')}"
        # If broker_error, should NOT contain '400' in message
        if data.get('source') == 'broker_error':
            market_msg = data.get('market_message', '')
            assert '400' not in market_msg or 'expiry_date' not in market_msg, f"Still getting 400 error: {market_msg}"
        print(f"PASS: NIFTY50 option chain - source={data.get('source')}")
    
    def test_option_chain_banknifty_no_400_error(self):
        """GET /api/option-chain/BANKNIFTY should return valid JSON"""
        response = requests.get(f"{BASE_URL}/api/option-chain/BANKNIFTY", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'BANKNIFTY'
        assert data.get('source') in ['market_closed', 'broker_disconnected', 'live', 'broker_error']
        print(f"PASS: BANKNIFTY option chain - source={data.get('source')}")
    
    def test_option_chain_sensex_bse_instrument(self):
        """GET /api/option-chain/SENSEX should return valid JSON for BSE instrument"""
        response = requests.get(f"{BASE_URL}/api/option-chain/SENSEX", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'SENSEX'
        # Check config has exchange=BSE
        config = data.get('config', {})
        assert config.get('exchange') == 'BSE', f"Expected BSE exchange, got {config.get('exchange')}"
        print(f"PASS: SENSEX option chain - source={data.get('source')}, exchange={config.get('exchange')}")
    
    def test_option_chain_finnifty(self):
        """GET /api/option-chain/FINNIFTY should return valid JSON"""
        response = requests.get(f"{BASE_URL}/api/option-chain/FINNIFTY", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'FINNIFTY'
        print(f"PASS: FINNIFTY option chain - source={data.get('source')}")
    
    def test_option_chain_midcpnifty(self):
        """GET /api/option-chain/MIDCPNIFTY should return valid JSON"""
        response = requests.get(f"{BASE_URL}/api/option-chain/MIDCPNIFTY", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'MIDCPNIFTY'
        print(f"PASS: MIDCPNIFTY option chain - source={data.get('source')}")
    
    def test_option_chain_bankex(self):
        """GET /api/option-chain/BANKEX should return valid JSON"""
        response = requests.get(f"{BASE_URL}/api/option-chain/BANKEX", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('instrument') == 'BANKEX'
        print(f"PASS: BANKEX option chain - source={data.get('source')}")


class TestInstrumentsAPI:
    """Tests for Instruments endpoints"""
    
    def test_instruments_returns_6_instruments(self):
        """GET /api/instruments should return 6 instruments with active field"""
        response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        
        instruments = data.get('instruments', {})
        assert len(instruments) == 6, f"Expected 6 instruments, got {len(instruments)}"
        
        expected = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']
        for inst in expected:
            assert inst in instruments, f"Missing instrument: {inst}"
        
        # Should have 'active' field
        assert 'active' in data, "Missing 'active' field"
        print(f"PASS: /api/instruments returns 6 instruments, active={data.get('active')}")
    
    def test_instrument_set_and_persistence(self):
        """POST /api/instruments/set should persist and GET should return active=BANKNIFTY"""
        # Set instrument to BANKNIFTY
        response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "BANKNIFTY"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('active') == 'BANKNIFTY'
        
        # Verify persistence
        response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('active') == 'BANKNIFTY', f"Expected active=BANKNIFTY, got {data.get('active')}"
        print("PASS: Instrument persistence verified - BANKNIFTY")


class TestAutoEntryStatus:
    """Tests for Auto-Entry Status endpoint"""
    
    def test_auto_entry_status_returns_active_instrument(self):
        """GET /api/auto-entry/status should return correct active_instrument"""
        response = requests.get(f"{BASE_URL}/api/auto-entry/status", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert 'active_instrument' in data, "Missing 'active_instrument' field"
        
        # active_instrument should be one of the 6 instruments
        valid_instruments = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']
        assert data.get('active_instrument') in valid_instruments, f"Invalid active_instrument: {data.get('active_instrument')}"
        print(f"PASS: /api/auto-entry/status active_instrument={data.get('active_instrument')}")


class TestOptionChainInstruments:
    """Tests for Option Chain Instruments endpoint"""
    
    def test_option_chain_instruments_no_mcx(self):
        """GET /api/option-chain/instruments should return 6 instruments (no MCX)"""
        response = requests.get(f"{BASE_URL}/api/option-chain/instruments", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        
        instruments = data.get('instruments', {})
        assert len(instruments) == 6, f"Expected 6 instruments, got {len(instruments)}"
        
        # No MCX instruments should be present
        for key in instruments:
            assert 'MCX' not in key.upper(), f"MCX instrument found: {key}"
            inst = instruments[key]
            assert inst.get('exchange') in ['NSE', 'BSE'], f"Unexpected exchange: {inst.get('exchange')}"
        
        print(f"PASS: /api/option-chain/instruments returns 6 NSE/BSE instruments (no MCX)")


class TestBrokersAPI:
    """Tests for Brokers endpoint"""
    
    def test_brokers_list(self):
        """GET /api/brokers/list should return 6 brokers"""
        response = requests.get(f"{BASE_URL}/api/brokers/list", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        
        brokers = data.get('brokers', [])
        assert len(brokers) == 6, f"Expected 6 brokers, got {len(brokers)}"
        print(f"PASS: /api/brokers/list returns {len(brokers)} brokers")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
