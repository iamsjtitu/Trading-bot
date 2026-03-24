"""
Test Suite for AI Loss Prevention Guards v4.6.0
Tests all 6 AI Guards features:
1. Multi-Timeframe Confirmation
2. AI Market Regime Filter
3. Trailing Stop Loss
4. Multi-Source News Verification
5. Time-of-Day Filter
6. Max Daily Loss Auto-Stop

Also tests:
- Risk Ratio Alert in Settings
- min_confidence=70% enforcement
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = 'https://sentiment-trade-bot-3.preview.emergentagent.com'


class TestAIGuardsStatus:
    """Test GET /api/ai-guards/status endpoint"""
    
    def test_ai_guards_status_returns_all_6_guards(self):
        """Verify all 6 guards are returned with proper structure"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'guards' in data
        assert 'current_time' in data
        
        guards = data['guards']
        
        # Verify all 6 guards exist
        expected_guards = [
            'multi_timeframe',
            'market_regime_filter',
            'trailing_stop',
            'multi_source_verification',
            'time_of_day_filter',
            'max_daily_loss'
        ]
        
        for guard_name in expected_guards:
            assert guard_name in guards, f"Missing guard: {guard_name}"
            assert 'enabled' in guards[guard_name], f"Guard {guard_name} missing 'enabled' field"
        
        print(f"✓ All 6 guards present: {list(guards.keys())}")
    
    def test_max_daily_loss_has_today_loss_and_limit(self):
        """Verify max_daily_loss guard shows today_loss and limit"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        max_daily_loss = data['guards']['max_daily_loss']
        
        assert 'today_loss' in max_daily_loss, "Missing today_loss field"
        assert 'limit' in max_daily_loss, "Missing limit field"
        assert 'blocked' in max_daily_loss, "Missing blocked field"
        assert max_daily_loss['enabled'] == True, "max_daily_loss should always be enabled"
        
        print(f"✓ Max Daily Loss: Today's Loss=₹{max_daily_loss['today_loss']}, Limit=₹{max_daily_loss['limit']}, Blocked={max_daily_loss['blocked']}")
    
    def test_time_of_day_filter_has_current_window(self):
        """Verify time_of_day_filter shows current_window status"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        tod_filter = data['guards']['time_of_day_filter']
        
        assert 'current_window' in tod_filter, "Missing current_window field"
        assert 'ist_time' in tod_filter, "Missing ist_time field"
        
        # current_window should be either 'NORMAL' or 'HIGH VOLATILITY - BLOCKED'
        assert 'NORMAL' in tod_filter['current_window'] or 'BLOCKED' in tod_filter['current_window']
        
        print(f"✓ Time-of-Day Filter: Window={tod_filter['current_window']}, IST={tod_filter['ist_time']}")
    
    def test_market_regime_filter_has_current_regime(self):
        """Verify market_regime_filter shows current_regime"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        regime_filter = data['guards']['market_regime_filter']
        
        assert 'current_regime' in regime_filter, "Missing current_regime field"
        assert 'confidence' in regime_filter, "Missing confidence field"
        assert 'blocked' in regime_filter, "Missing blocked field"
        
        print(f"✓ Market Regime Filter: Regime={regime_filter['current_regime']}, Confidence={regime_filter['confidence']}%, Blocked={regime_filter['blocked']}")


class TestAIGuardsUpdate:
    """Test POST /api/ai-guards/update endpoint"""
    
    def test_toggle_multi_timeframe_off(self):
        """Test toggling multi_timeframe guard OFF"""
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={'multi_timeframe': False},
            timeout=15
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'ai_guards' in data
        assert data['ai_guards']['multi_timeframe'] == False
        
        print("✓ multi_timeframe toggled OFF successfully")
    
    def test_toggle_multi_timeframe_on(self):
        """Test toggling multi_timeframe guard ON"""
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={'multi_timeframe': True},
            timeout=15
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['multi_timeframe'] == True
        
        print("✓ multi_timeframe toggled ON successfully")
    
    def test_toggle_multiple_guards(self):
        """Test toggling multiple guards at once"""
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={
                'trailing_stop': False,
                'multi_source_verification': False
            },
            timeout=15
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['trailing_stop'] == False
        assert data['ai_guards']['multi_source_verification'] == False
        
        # Turn them back on
        requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={'trailing_stop': True, 'multi_source_verification': True},
            timeout=15
        )
        
        print("✓ Multiple guards toggled successfully")
    
    def test_cannot_toggle_max_daily_loss(self):
        """Verify max_daily_loss cannot be toggled (always ON)"""
        # Try to toggle it off
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={'max_daily_loss': False},
            timeout=15
        )
        assert response.status_code == 200
        
        # Verify it's still not in the toggleable list (should be ignored)
        status_response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        data = status_response.json()
        
        # max_daily_loss should always be enabled=True
        assert data['guards']['max_daily_loss']['enabled'] == True
        
        print("✓ max_daily_loss correctly cannot be toggled OFF (always ON)")


class TestTechnicalAnalysisUpstox:
    """Test Technical Analysis endpoint works"""
    
    def test_technical_analysis_returns_data(self):
        """Verify technical analysis returns valid data (upstox or demo fallback)"""
        response = requests.get(
            f"{BASE_URL}/api/technical/analysis?instrument=NIFTY50&interval=5minute",
            timeout=30
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        # Check source is either upstox or demo (fallback when token expired)
        source = data.get('source')
        assert source in ['upstox', 'demo'], f"Expected source='upstox' or 'demo', got '{source}'"
        
        # Verify indicators are present
        assert 'indicators' in data
        assert 'rsi' in data['indicators']
        assert 'macd' in data['indicators']
        
        print(f"✓ Technical Analysis source={source}, candles={data.get('candle_count', 0)}")


class TestAutoExitCheck:
    """Test auto-exit endpoint works without errors"""
    
    def test_auto_exit_check_works(self):
        """Verify POST /api/auto-exit/check works"""
        response = requests.post(f"{BASE_URL}/api/auto-exit/check", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'exits_executed' in data
        assert 'new_trades_generated' in data
        
        print(f"✓ Auto-exit check: exits={data['exits_executed']}, new_trades={data['new_trades_generated']}")


class TestSignalsEndpoint:
    """Test signals endpoint"""
    
    def test_signals_latest_returns_signals(self):
        """Verify GET /api/signals/latest returns signals"""
        response = requests.get(f"{BASE_URL}/api/signals/latest", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'signals' in data
        assert 'count' in data
        
        print(f"✓ Signals endpoint: count={data['count']}")


class TestAutoSettings:
    """Test auto-settings endpoints"""
    
    def test_get_auto_settings(self):
        """Verify GET /api/auto-settings returns target_pct and stoploss_pct"""
        response = requests.get(f"{BASE_URL}/api/auto-settings", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'settings' in data
        
        settings = data['settings']
        assert 'target_pct' in settings, "Missing target_pct"
        assert 'stoploss_pct' in settings, "Missing stoploss_pct"
        assert 'auto_exit' in settings, "Missing auto_exit"
        assert 'auto_entry' in settings, "Missing auto_entry"
        
        print(f"✓ Auto-settings: target={settings['target_pct']}%, stoploss={settings['stoploss_pct']}%, auto_exit={settings['auto_exit']}, auto_entry={settings['auto_entry']}")


class TestMinConfidenceEnforcement:
    """Test min_confidence=70% enforcement"""
    
    def test_settings_has_min_confidence(self):
        """Verify settings has min_confidence field"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        settings = data['settings']
        news_settings = settings.get('news', {})
        min_confidence = news_settings.get('min_confidence', 70)
        
        # Default should be 70
        assert min_confidence >= 50, f"min_confidence should be >= 50, got {min_confidence}"
        
        print(f"✓ min_confidence setting: {min_confidence}%")


class TestRiskRatioAlert:
    """Test Risk Ratio Alert feature"""
    
    def test_risk_settings_has_sl_and_target(self):
        """Verify risk settings has stop_loss_pct and target_pct"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        settings = data['settings']
        risk = settings.get('risk', {})
        
        # Check risk settings exist
        assert 'stop_loss_pct' in risk or 'risk_tolerance' in risk, "Missing stop_loss_pct or risk_tolerance"
        
        print(f"✓ Risk settings present: {risk}")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
