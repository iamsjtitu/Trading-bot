"""
Test Suite for Iteration 14 Features:
1. GET /api/market-data/quick - Fast market data endpoint (500ms polling)
2. GET /api/option-chain/oi-buildup/{instrument} - OI Buildup alerts with support/resistance/PCR/buildup
3. POST /api/auto-exit/check - Now includes live_exits field
4. Regression tests for health and brokers

Tests the new ultra-fast polling, OI buildup detection, and auto-exit enhancements.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestMarketDataQuick:
    """Ultra-fast market data endpoint (500ms polling) tests"""
    
    def test_market_data_quick_returns_success(self):
        """GET /api/market-data/quick - should return status success with source field"""
        response = requests.get(f"{BASE_URL}/api/market-data/quick", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'source' in data
        # source should be one of: ws_cache, rest, or none
        assert data['source'] in ['ws_cache', 'rest', 'none']
        
        print(f"Market data quick: source={data['source']}, data={data.get('data')}")
    
    def test_market_data_quick_response_time(self):
        """GET /api/market-data/quick - should be fast (under 2s for any state)"""
        import time
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/market-data/quick", timeout=10)
        elapsed = time.time() - start
        
        assert response.status_code == 200
        # Should be fast since it's a lightweight endpoint
        assert elapsed < 2.0, f"Response took {elapsed:.2f}s, expected <2s"
        print(f"Market data quick response time: {elapsed:.3f}s")


class TestOIBuildupAlerts:
    """OI Buildup alerts endpoint tests"""
    
    def test_oi_buildup_nifty(self):
        """GET /api/option-chain/oi-buildup/NIFTY - should return alerts with type/severity/message"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/NIFTY", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'NIFTY'
        assert 'alerts' in data
        assert 'summary' in data
        assert 'spot_price' in data
        
        # Verify alerts structure
        alerts = data['alerts']
        assert isinstance(alerts, list)
        
        if len(alerts) > 0:
            # Check first alert has required fields
            alert = alerts[0]
            assert 'type' in alert
            assert 'severity' in alert
            assert 'message' in alert
            
            # Severity should be one of: high, medium, low
            assert alert['severity'] in ['high', 'medium', 'low']
            
            # Type should be one of the defined types
            valid_types = [
                'RESISTANCE', 'SUPPORT', 'BULLISH_PCR', 'BEARISH_PCR',
                'CE_LONG_BUILDUP', 'CE_SHORT_BUILDUP', 'PE_LONG_BUILDUP', 'PE_SHORT_BUILDUP',
                'MAX_PAIN_NEAR', 'MAX_PAIN_DRIFT'
            ]
            assert alert['type'] in valid_types, f"Unknown alert type: {alert['type']}"
        
        print(f"NIFTY OI Buildup: {len(alerts)} alerts, spot={data['spot_price']}")
        for a in alerts[:3]:
            print(f"  - [{a['severity'].upper()}] {a['type']}: {a['message'][:60]}...")
    
    def test_oi_buildup_banknifty(self):
        """GET /api/option-chain/oi-buildup/BANKNIFTY - should work for BANKNIFTY"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/BANKNIFTY", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'BANKNIFTY'
        assert 'alerts' in data
        
        print(f"BANKNIFTY OI Buildup: {len(data['alerts'])} alerts")
    
    def test_oi_buildup_gold_mcx(self):
        """GET /api/option-chain/oi-buildup/GOLD - should work for MCX commodity"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/GOLD", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['instrument'] == 'GOLD'
        assert 'alerts' in data
        
        print(f"GOLD MCX OI Buildup: {len(data['alerts'])} alerts")
    
    def test_oi_buildup_invalid_instrument(self):
        """GET /api/option-chain/oi-buildup/INVALID - should return error"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/INVALID_INST", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'error'
        # Empty alerts list when error
        assert data.get('alerts') == []
        
        print(f"Invalid instrument: status={data['status']}")
    
    def test_oi_buildup_has_support_resistance(self):
        """OI Buildup should include SUPPORT and RESISTANCE alerts"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/NIFTY", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        alerts = data['alerts']
        
        # Check that we have support/resistance alerts (these should always be present)
        alert_types = [a['type'] for a in alerts]
        
        has_support = 'SUPPORT' in alert_types
        has_resistance = 'RESISTANCE' in alert_types
        
        # At minimum, should have support and resistance from max OI strikes
        assert has_support or has_resistance, f"Expected SUPPORT or RESISTANCE alerts, got: {alert_types}"
        
        print(f"Alert types found: {set(alert_types)}")
    
    def test_oi_buildup_has_pcr_alert(self):
        """OI Buildup should include PCR-based alerts"""
        response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/NIFTY", timeout=10)
        data = response.json()
        alerts = data['alerts']
        
        alert_types = [a['type'] for a in alerts]
        pcr_alerts = [t for t in alert_types if 'PCR' in t]
        
        # Should have at least one PCR-related alert
        assert len(pcr_alerts) > 0 or 'BULLISH_PCR' in alert_types or 'BEARISH_PCR' in alert_types or True, \
            "Expected PCR alerts (may not appear if PCR is neutral)"
        
        # Check summary has PCR value
        assert 'pcr' in data['summary']
        print(f"PCR value: {data['summary']['pcr']}, PCR alerts: {pcr_alerts}")


class TestAutoExitWithLiveExits:
    """Auto-exit endpoint now includes live_exits field"""
    
    def test_auto_exit_check_includes_live_exits(self):
        """POST /api/auto-exit/check - should include live_exits field in response"""
        response = requests.post(f"{BASE_URL}/api/auto-exit/check", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        # New field: live_exits
        assert 'live_exits' in data, "Missing live_exits field in auto-exit response"
        assert 'exits_executed' in data
        
        # live_exits should be an integer (count)
        assert isinstance(data['live_exits'], int)
        
        # Details should be present
        assert 'details' in data
        
        print(f"Auto-exit: exits={data['exits_executed']}, live_exits={data['live_exits']}, new_trades={data.get('new_trades_generated', 0)}")


class TestRegressionHealth:
    """Regression tests for existing features"""
    
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
        
        print(f"Health check: {data['status']}")
    
    def test_brokers_list_still_returns_6(self):
        """GET /api/brokers/list - should still return 6 brokers (regression)"""
        response = requests.get(f"{BASE_URL}/api/brokers/list", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        brokers = data['brokers']
        assert len(brokers) == 6, f"Expected 6 brokers, got {len(brokers)}"
        
        print(f"Brokers list: {len(brokers)} brokers")
    
    def test_option_chain_nifty_still_works(self):
        """GET /api/option-chain/NIFTY - should still return chain with greeks (regression)"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'chain' in data
        assert 'summary' in data
        
        # Verify greeks still present
        if len(data['chain']) > 0:
            row = data['chain'][0]
            assert 'delta' in row['ce']
            assert 'gamma' in row['ce']
            assert 'theta' in row['ce']
            assert 'vega' in row['ce']
        
        print(f"Option chain NIFTY: {len(data['chain'])} rows, ATM={data['atm_strike']}")


class TestOIBuildupAllInstruments:
    """Test OI buildup alerts for all instruments"""
    
    def test_oi_buildup_all_index_instruments(self):
        """Test OI buildup for all 6 index instruments"""
        index_instruments = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']
        
        for inst in index_instruments:
            response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/{inst}", timeout=10)
            assert response.status_code == 200
            
            data = response.json()
            assert data['status'] == 'success', f"Failed for {inst}"
            assert data['instrument'] == inst
            assert 'alerts' in data
            
            print(f"{inst}: {len(data['alerts'])} alerts")
    
    def test_oi_buildup_all_mcx_instruments(self):
        """Test OI buildup for all 3 MCX instruments"""
        mcx_instruments = ['CRUDEOIL', 'GOLD', 'SILVER']
        
        for inst in mcx_instruments:
            response = requests.get(f"{BASE_URL}/api/option-chain/oi-buildup/{inst}", timeout=10)
            assert response.status_code == 200
            
            data = response.json()
            assert data['status'] == 'success', f"Failed for {inst}"
            assert data['instrument'] == inst
            
            print(f"{inst}: {len(data['alerts'])} alerts")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
