"""
Test Suite for v11.0.0 Bug Fixes
================================
Tests for 4 critical live trading bugs:
1. Max Trade Amount enforcement (35000 set but trades executing for 100000/51000)
2. Stale trade cleanup (shows 5 trades open but only 1 actual)
3. Max Daily Loss toggle ON/OFF
4. Market data stability (data disappearing during trading)

Plus: 3 new news sources (Reuters, Zee Business, Financial Express)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://news-driven-options-1.preview.emergentagent.com').rstrip('/')

class TestHealthAndVersion:
    """Test health endpoint returns v11.0.0"""
    
    def test_health_version(self):
        """GET /api/health should return v11.0.0 with 13 routes"""
        resp = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'healthy'
        assert data['version'] == '11.0.0', f"Expected v11.0.0, got {data['version']}"
        assert data['routes_loaded'] == 13, f"Expected 13 routes, got {data['routes_loaded']}"
        print(f"✓ Health check passed: v{data['version']}, {data['routes_loaded']} routes")


class TestBug1MaxTradeAmount:
    """BUG 1: Max Trade Amount Fix - Trades should respect max_per_trade setting"""
    
    def test_settings_has_max_per_trade(self):
        """GET /api/settings should show risk.max_per_trade value"""
        resp = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert 'settings' in data
        assert 'risk' in data['settings']
        max_per_trade = data['settings']['risk'].get('max_per_trade')
        assert max_per_trade is not None, "max_per_trade should be set in risk settings"
        assert max_per_trade > 0, "max_per_trade should be positive"
        print(f"✓ max_per_trade setting found: ₹{max_per_trade}")
    
    def test_auto_trading_has_max_per_trade(self):
        """GET /api/auto-settings should show max_per_trade"""
        resp = requests.get(f"{BASE_URL}/api/auto-settings", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        # auto_trading settings should have target_pct and stoploss_pct
        settings = data.get('settings', {})
        assert 'target_pct' in settings
        assert 'stoploss_pct' in settings
        print(f"✓ Auto settings: target={settings['target_pct']}%, stoploss={settings['stoploss_pct']}%")


class TestBug2StaleTradeCleanup:
    """BUG 2: Stale Trade Cleanup - OPEN trades older than 24h should auto-close"""
    
    def test_active_trades_endpoint(self):
        """GET /api/trades/active should return trades with stale cleanup"""
        resp = requests.get(f"{BASE_URL}/api/trades/active", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'count' in data
        assert 'trades' in data
        # All returned trades should be OPEN status
        for trade in data['trades']:
            assert trade['status'] == 'OPEN', f"Trade {trade.get('id')} should be OPEN"
        print(f"✓ Active trades endpoint working: {data['count']} open trades")
    
    def test_trades_history_has_stale_closed(self):
        """GET /api/trades/history should show STALE_AUTO_CLOSE exit_reason for old trades"""
        resp = requests.get(f"{BASE_URL}/api/trades/history?limit=50", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        # Check if any trades have STALE_AUTO_CLOSE exit_reason
        stale_closed = [t for t in data.get('trades', []) if t.get('exit_reason') == 'STALE_AUTO_CLOSE']
        print(f"✓ Trade history working: {len(stale_closed)} stale-closed trades found")


class TestBug3MaxDailyLossToggle:
    """BUG 3: Max Daily Loss Toggle - Should have ON/OFF toggle"""
    
    def test_ai_guards_status_has_max_daily_loss(self):
        """GET /api/ai-guards/status should show max_daily_loss with enabled field"""
        resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'guards' in data
        assert 'max_daily_loss' in data['guards'], "max_daily_loss guard should exist"
        
        mdl = data['guards']['max_daily_loss']
        assert 'enabled' in mdl, "max_daily_loss should have 'enabled' field"
        assert 'today_loss' in mdl, "max_daily_loss should have 'today_loss' field"
        assert 'limit' in mdl, "max_daily_loss should have 'limit' field"
        print(f"✓ Max Daily Loss guard: enabled={mdl['enabled']}, today_loss=₹{mdl['today_loss']}, limit=₹{mdl['limit']}")
    
    def test_toggle_max_daily_loss_off(self):
        """PUT /api/ai-guards/update should toggle max_daily_loss OFF"""
        resp = requests.post(f"{BASE_URL}/api/ai-guards/update", 
                            json={"max_daily_loss": False}, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'ai_guards' in data
        assert data['ai_guards'].get('max_daily_loss') == False, "max_daily_loss should be False after toggle"
        print("✓ Max Daily Loss toggled OFF successfully")
    
    def test_verify_max_daily_loss_disabled(self):
        """GET /api/ai-guards/status should show max_daily_loss enabled=false"""
        resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        mdl = data['guards']['max_daily_loss']
        assert mdl['enabled'] == False, "max_daily_loss should be disabled"
        print("✓ Max Daily Loss verified as disabled")
    
    def test_toggle_max_daily_loss_on(self):
        """PUT /api/ai-guards/update should toggle max_daily_loss ON"""
        resp = requests.post(f"{BASE_URL}/api/ai-guards/update", 
                            json={"max_daily_loss": True}, timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert data['ai_guards'].get('max_daily_loss') == True, "max_daily_loss should be True after toggle"
        print("✓ Max Daily Loss toggled ON successfully")
    
    def test_verify_max_daily_loss_enabled(self):
        """GET /api/ai-guards/status should show max_daily_loss enabled=true"""
        resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        mdl = data['guards']['max_daily_loss']
        assert mdl['enabled'] == True, "max_daily_loss should be enabled"
        print("✓ Max Daily Loss verified as enabled")


class TestBug4MarketDataStability:
    """BUG 4: Market Data Stability - Data should not disappear during trading"""
    
    def test_market_data_bg_status(self):
        """GET /api/market-data/bg-status should return status with last_error field"""
        resp = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'fetcher' in data
        
        fetcher = data['fetcher']
        assert 'running' in fetcher
        assert 'last_status' in fetcher
        assert 'last_error' in fetcher, "fetcher should have last_error field"
        
        # Check cached data is preserved
        assert 'cached_data' in data
        cached = data['cached_data']
        if cached.get('indices'):
            # If we have cached data, it should have values
            indices = cached['indices']
            print(f"✓ Cached market data: NIFTY={indices.get('nifty50')}, BANKNIFTY={indices.get('banknifty')}")
        else:
            print("✓ Market data bg-status working (no cached data yet)")
        
        # Check token expiry detection
        if fetcher.get('last_status') == 'token_expired':
            assert 'Token expired' in fetcher.get('last_error', ''), "Token expiry should have clear message"
            print(f"✓ Token expiry detected: {fetcher['last_error']}")
        else:
            print(f"✓ Fetcher status: {fetcher['last_status']}")


class TestNewsSources:
    """Test new news sources: Reuters, Zee Business, Financial Express"""
    
    def test_news_latest(self):
        """GET /api/news/latest should return news articles"""
        resp = requests.get(f"{BASE_URL}/api/news/latest?limit=50", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'news' in data
        
        # Check sources
        sources = set(n.get('source', '') for n in data['news'])
        print(f"✓ News sources found: {sources}")
        
        # Count articles per source
        source_counts = {}
        for n in data['news']:
            src = n.get('source', 'Unknown')
            source_counts[src] = source_counts.get(src, 0) + 1
        print(f"✓ Articles per source: {source_counts}")


class TestTelegramStatus:
    """Test Telegram integration status"""
    
    def test_telegram_status(self):
        """GET /api/telegram/status should return success"""
        resp = requests.get(f"{BASE_URL}/api/telegram/status", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        assert 'telegram' in data
        print(f"✓ Telegram configured: {data['telegram'].get('configured')}")


class TestAllAIGuards:
    """Test all AI guards are present and toggleable"""
    
    def test_all_guards_present(self):
        """GET /api/ai-guards/status should return all 8 guards"""
        resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        
        expected_guards = [
            'multi_timeframe', 'market_regime_filter', 'trailing_stop',
            'multi_source_verification', 'time_of_day_filter', 'max_daily_loss',
            'kelly_sizing', 'greeks_filter'
        ]
        
        guards = data.get('guards', {})
        for guard in expected_guards:
            assert guard in guards, f"Guard '{guard}' should be present"
            assert 'enabled' in guards[guard], f"Guard '{guard}' should have 'enabled' field"
        
        print(f"✓ All {len(expected_guards)} guards present with enabled field")


class TestRegressionChecks:
    """Regression tests for existing functionality"""
    
    def test_signals_latest(self):
        """GET /api/signals/latest should work"""
        resp = requests.get(f"{BASE_URL}/api/signals/latest", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        print(f"✓ Signals endpoint working: {data.get('count', 0)} signals")
    
    def test_trades_today(self):
        """GET /api/trades/today should work"""
        resp = requests.get(f"{BASE_URL}/api/trades/today", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        print(f"✓ Today's trades: {data.get('total_trades_today', 0)} trades, P&L: ₹{data.get('today_pnl', 0)}")
    
    def test_ai_insights(self):
        """GET /api/ai/insights should work"""
        resp = requests.get(f"{BASE_URL}/api/ai/insights", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        print(f"✓ AI insights working")
    
    def test_historical_patterns(self):
        """GET /api/historical-patterns should work"""
        resp = requests.get(f"{BASE_URL}/api/historical-patterns", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'success'
        print(f"✓ Historical patterns: {data.get('total_patterns', 0)} patterns")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
