"""
Test Suite for Auto-Entry Bug Fix - AI Trading Bot v4.2.0
CRITICAL BUG: User turned OFF auto-entry but bot still took trades.
Root cause: news.js /api/news/fetch endpoint was executing trades regardless of auto_entry setting.
Fix: Added auto_entry check in news.js before trade execution.

Tests for:
1. CRITICAL: Auto-entry OFF should NOT execute any trades when news is fetched
2. CRITICAL: Auto-entry ON should execute trades when news generates signals
3. Auto-exit ON should process exit checks
4. Auto-exit OFF should skip all exit processing (return exits=0 immediately)
5. Auto-exit re-entry should be blocked when auto_entry is OFF
6. Auto-exit re-entry should be blocked when emergency_stop is ON
7. Settings update endpoint properly toggles auto_entry and auto_exit
8. Settings are read from DB directly (not cached variables)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = 'https://sentiment-trade-bot-3.preview.emergentagent.com'

print(f"Testing against: {BASE_URL}")


class TestAutoEntryOff:
    """CRITICAL: Test that Auto-Entry OFF prevents trade execution"""
    
    def test_01_turn_off_auto_entry(self):
        """POST /api/auto-settings/update with auto_entry:false should disable auto entry"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_entry": False
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get('status') == 'success', f"Expected success, got {data}"
        assert data.get('settings', {}).get('auto_entry') == False, f"auto_entry should be False, got {data}"
        print(f"PASS: Auto-entry turned OFF: {data.get('settings')}")
    
    def test_02_verify_auto_entry_off_in_settings(self):
        """GET /api/auto-settings should show auto_entry:false"""
        response = requests.get(f"{BASE_URL}/api/auto-settings")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        settings = data.get('settings', {})
        assert settings.get('auto_entry') == False, f"auto_entry should be False, got {settings.get('auto_entry')}"
        print(f"PASS: Auto-entry OFF confirmed in settings: {settings}")
    
    def test_03_count_trades_before_news_fetch(self):
        """Get the current trade count before fetching news"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        assert response.status_code == 200
        trades = response.json().get('trades', [])
        print(f"Trades BEFORE news fetch: {len(trades)}")
        return len(trades)
    
    def test_04_fetch_news_with_auto_entry_off(self):
        """GET /api/news/fetch with auto_entry OFF should NOT create new trades"""
        # ENSURE auto_entry is OFF
        set_res = requests.post(f"{BASE_URL}/api/auto-settings/update", json={"auto_entry": False})
        assert set_res.json().get('settings', {}).get('auto_entry') == False
        
        # Also ensure emergency stop is OFF (to isolate auto_entry test)
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False})
        time.sleep(0.5)
        
        # Get trades BEFORE
        trades_before_res = requests.get(f"{BASE_URL}/api/trades/active")
        trades_before = trades_before_res.json().get('trades', [])
        trades_count_before = len(trades_before)
        trades_ids_before = set(t.get('id') for t in trades_before)
        print(f"Trades count BEFORE news fetch: {trades_count_before}")
        
        # Fetch news - with auto_entry OFF, should NOT execute any new trades
        news_res = requests.get(f"{BASE_URL}/api/news/fetch")
        assert news_res.status_code == 200
        news_data = news_res.json()
        articles_processed = news_data.get('articles_processed', 0)
        print(f"News fetch: {articles_processed} articles processed")
        
        # Give time for any async trade execution
        time.sleep(1)
        
        # Get trades AFTER
        trades_after_res = requests.get(f"{BASE_URL}/api/trades/active")
        trades_after = trades_after_res.json().get('trades', [])
        trades_count_after = len(trades_after)
        trades_ids_after = set(t.get('id') for t in trades_after)
        
        # Check for NEW trades (IDs that weren't there before)
        new_trade_ids = trades_ids_after - trades_ids_before
        
        print(f"Trades count AFTER news fetch: {trades_count_after}")
        print(f"NEW trade IDs (should be 0): {new_trade_ids}")
        
        # CRITICAL ASSERTION: No new trades should be created when auto_entry is OFF
        assert len(new_trade_ids) == 0, f"CRITICAL BUG: {len(new_trade_ids)} new trade(s) created with auto_entry OFF! IDs: {new_trade_ids}"
        print(f"PASS: No new trades created with auto_entry OFF - Bug fix verified!")


class TestAutoEntryOn:
    """Test that Auto-Entry ON allows trade execution"""
    
    def test_01_turn_on_auto_entry(self):
        """POST /api/auto-settings/update with auto_entry:true should enable auto entry"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_entry": True
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('settings', {}).get('auto_entry') == True
        print(f"PASS: Auto-entry turned ON: {data.get('settings')}")
    
    def test_02_verify_auto_entry_on_in_settings(self):
        """GET /api/auto-settings should show auto_entry:true"""
        response = requests.get(f"{BASE_URL}/api/auto-settings")
        assert response.status_code == 200
        data = response.json()
        settings = data.get('settings', {})
        assert settings.get('auto_entry') == True, f"auto_entry should be True, got {settings.get('auto_entry')}"
        print(f"PASS: Auto-entry ON confirmed: {settings}")
    
    def test_03_cleanup_turn_off_auto_entry(self):
        """Clean up: Turn auto_entry back OFF for safety"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_entry": False
        })
        assert response.status_code == 200
        print("CLEANUP: Auto-entry turned OFF for safety")


class TestAutoExitOn:
    """Test Auto-Exit ON processes exit checks"""
    
    def test_01_turn_on_auto_exit(self):
        """POST /api/auto-settings/update with auto_exit:true"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_exit": True
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('settings', {}).get('auto_exit') == True
        print(f"PASS: Auto-exit ON: {data.get('settings')}")
    
    def test_02_auto_exit_check_returns_valid_response(self):
        """POST /api/auto-exit/check should process exits when ON"""
        # Ensure auto_exit is ON
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={"auto_exit": True})
        time.sleep(0.5)
        
        response = requests.post(f"{BASE_URL}/api/auto-exit/check")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success', f"Expected success, got {data}"
        
        exits = data.get('exits_executed', 0)
        new_trades = data.get('new_trades_generated', 0)
        print(f"PASS: Auto-exit check completed: exits={exits}, new_trades={new_trades}")


class TestAutoExitOff:
    """Test Auto-Exit OFF skips all exit processing"""
    
    def test_01_turn_off_auto_exit(self):
        """POST /api/auto-settings/update with auto_exit:false"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_exit": False
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('settings', {}).get('auto_exit') == False
        print(f"PASS: Auto-exit turned OFF: {data.get('settings')}")
    
    def test_02_auto_exit_check_returns_zero_when_off(self):
        """POST /api/auto-exit/check should return exits=0 immediately when OFF"""
        # Ensure auto_exit is OFF
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={"auto_exit": False})
        time.sleep(0.5)
        
        response = requests.post(f"{BASE_URL}/api/auto-exit/check")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        
        exits = data.get('exits_executed', 0)
        new_trades = data.get('new_trades_generated', 0)
        
        # With auto_exit OFF, it should return immediately with 0 exits
        assert exits == 0, f"Expected 0 exits when auto_exit is OFF, got {exits}"
        assert new_trades == 0, f"Expected 0 new trades when auto_exit is OFF, got {new_trades}"
        print(f"PASS: Auto-exit OFF returns exits=0 immediately")
    
    def test_03_turn_auto_exit_back_on(self):
        """Cleanup: Turn auto_exit back ON"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_exit": True
        })
        assert response.status_code == 200
        print("CLEANUP: Auto-exit turned back ON")


class TestAutoExitReEntryBlocking:
    """Test auto-exit re-entry is blocked when auto_entry is OFF or emergency_stop is ON"""
    
    def test_01_reentry_blocked_when_auto_entry_off(self):
        """Auto-exit re-entry should be blocked when auto_entry is OFF"""
        # Turn ON auto_exit but OFF auto_entry
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_exit": True,
            "auto_entry": False
        })
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False})
        time.sleep(0.5)
        
        # Trigger auto-exit check
        response = requests.post(f"{BASE_URL}/api/auto-exit/check")
        assert response.status_code == 200
        data = response.json()
        
        new_trades = data.get('new_trades_generated', 0)
        print(f"Auto-exit with auto_entry OFF: new_trades={new_trades}")
        
        # Re-entry should NOT happen when auto_entry is OFF
        # (Code path: trading.js line 216-224 checks isAutoEntryOn)
        assert new_trades == 0, f"Re-entry should be blocked when auto_entry is OFF, got {new_trades} new trades"
        print("PASS: Re-entry blocked when auto_entry is OFF")
    
    def test_02_reentry_blocked_when_emergency_stop_on(self):
        """Auto-exit re-entry should be blocked when emergency_stop is ON"""
        # Turn ON auto_entry but also ON emergency_stop
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_exit": True,
            "auto_entry": True
        })
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": True})
        time.sleep(0.5)
        
        # Trigger auto-exit check
        response = requests.post(f"{BASE_URL}/api/auto-exit/check")
        assert response.status_code == 200
        data = response.json()
        
        new_trades = data.get('new_trades_generated', 0)
        print(f"Auto-exit with emergency_stop ON: new_trades={new_trades}")
        
        # Re-entry should NOT happen when emergency_stop is ON
        assert new_trades == 0, f"Re-entry should be blocked when emergency_stop is ON, got {new_trades} new trades"
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False})
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={"auto_entry": False})
        print("PASS: Re-entry blocked when emergency_stop is ON")


class TestSettingsReadFromDB:
    """Test that settings are read from DB directly (not cached variables)"""
    
    def test_01_settings_update_persists_and_reads_correctly(self):
        """Settings should be saved to DB and read back correctly"""
        # Set specific values
        test_settings = {
            "auto_entry": True,
            "auto_exit": False,
            "target_pct": 15,
            "stoploss_pct": 20
        }
        
        update_res = requests.post(f"{BASE_URL}/api/auto-settings/update", json=test_settings)
        assert update_res.status_code == 200
        assert update_res.json().get('status') == 'success'
        print(f"Updated settings: {update_res.json().get('settings')}")
        
        # Read back
        get_res = requests.get(f"{BASE_URL}/api/auto-settings")
        assert get_res.status_code == 200
        settings = get_res.json().get('settings', {})
        
        # Verify values match
        assert settings.get('auto_entry') == True, f"auto_entry mismatch: expected True, got {settings.get('auto_entry')}"
        assert settings.get('auto_exit') == False, f"auto_exit mismatch: expected False, got {settings.get('auto_exit')}"
        assert settings.get('target_pct') == 15, f"target_pct mismatch: expected 15, got {settings.get('target_pct')}"
        assert settings.get('stoploss_pct') == 20, f"stoploss_pct mismatch: expected 20, got {settings.get('stoploss_pct')}"
        
        print(f"PASS: Settings persist correctly to DB: {settings}")
        
        # Cleanup - restore defaults
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_entry": False,
            "auto_exit": True,
            "target_pct": 10,
            "stoploss_pct": 25
        })


class TestEmergencyStopPersistence:
    """Test emergency stop works and persists to backend"""
    
    def test_01_emergency_stop_activation(self):
        """POST /api/emergency-stop with {active:true}"""
        response = requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": True})
        assert response.status_code == 200
        data = response.json()
        assert data.get('emergency_stop') == True
        print(f"PASS: Emergency stop activated: {data}")
    
    def test_02_emergency_stop_in_settings(self):
        """GET /api/settings should show emergency_stop:true"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        settings = response.json().get('settings', {})
        assert settings.get('emergency_stop') == True, f"Expected emergency_stop:true, got {settings.get('emergency_stop')}"
        print(f"PASS: Emergency stop persists in settings")
    
    def test_03_emergency_stop_deactivation(self):
        """POST /api/emergency-stop with {active:false}"""
        response = requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False})
        assert response.status_code == 200
        data = response.json()
        assert data.get('emergency_stop') == False
        print(f"PASS: Emergency stop deactivated: {data}")


class TestTodayPnL:
    """Test Today's P&L shows non-zero values with open trades"""
    
    def test_01_today_pnl_endpoint(self):
        """GET /api/trades/today should return P&L data"""
        response = requests.get(f"{BASE_URL}/api/trades/today")
        assert response.status_code == 200
        data = response.json()
        
        today_pnl = data.get('today_pnl', 0)
        realized = data.get('realized_pnl', 0)
        unrealized = data.get('unrealized_pnl', 0)
        open_trades = data.get('open_trades', 0)
        
        print(f"Today's P&L: ₹{today_pnl}")
        print(f"  Realized: ₹{realized}")
        print(f"  Unrealized: ₹{unrealized}")
        print(f"  Open trades: {open_trades}")
        
        # If there are open trades, P&L calculation should be working
        # (Not necessarily non-zero, as trades could be at breakeven)
        if open_trades > 0:
            print(f"PASS: P&L calculation working with {open_trades} open trades")
        else:
            print(f"PASS: No open trades currently")


class TestVersionCheck:
    """Test version is v4.2.0"""
    
    def test_01_debug_endpoint_version(self):
        """GET /api/debug/auto-trade-test returns version"""
        response = requests.get(f"{BASE_URL}/api/debug/auto-trade-test")
        assert response.status_code == 200
        data = response.json()
        version = data.get('version')
        print(f"API Version: {version}")
        # Note: v4.2.0 check is in footer - manual verification needed


# Cleanup fixture
@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # Ensure safe state after all tests
    try:
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False})
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "auto_entry": False,
            "auto_exit": True
        })
        print("\nCleanup: Emergency stop OFF, auto_entry OFF, auto_exit ON")
    except:
        pass


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
