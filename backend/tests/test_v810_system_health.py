"""
v8.1.0 System Health Dashboard Verification Tests
Double verification for live trading - comprehensive testing of all 38 items
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sentiment-trade-bot-3.preview.emergentagent.com').rstrip('/')

class TestVersionVerification:
    """Test items 1-3: Version 8.1.0 verification"""
    
    def test_health_returns_version_810(self):
        """Item 1: /api/health returns version 8.1.0"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('version') == '8.1.0', f"Expected 8.1.0, got {data.get('version')}"
        assert data.get('status') == 'healthy'
        print(f"✓ /api/health version: {data.get('version')}")
    
    def test_debug_returns_version_810(self):
        """Item 2: /api/debug returns version 8.1.0"""
        response = requests.get(f"{BASE_URL}/api/debug", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('version') == '8.1.0', f"Expected 8.1.0, got {data.get('version')}"
        print(f"✓ /api/debug version: {data.get('version')}")
    
    def test_auto_trade_test_returns_version_810(self):
        """Item 3: /api/debug/auto-trade-test returns version 8.1.0"""
        response = requests.get(f"{BASE_URL}/api/debug/auto-trade-test", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('version') == '8.1.0', f"Expected 8.1.0, got {data.get('version')}"
        print(f"✓ /api/debug/auto-trade-test version: {data.get('version')}")


class TestTelegramEndpoints:
    """Test items 15-18: Telegram endpoints"""
    
    def test_telegram_status(self):
        """Item 15: /api/telegram/status returns success with configured=true"""
        response = requests.get(f"{BASE_URL}/api/telegram/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        telegram = data.get('telegram', {})
        assert telegram.get('configured') == True, f"Telegram not configured: {telegram}"
        print(f"✓ Telegram configured: {telegram.get('configured')}, has_token: {telegram.get('has_token')}")
    
    def test_telegram_test_message(self):
        """Item 16: /api/telegram/test should return success"""
        response = requests.post(f"{BASE_URL}/api/telegram/test", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success', f"Telegram test failed: {data}"
        print(f"✓ Telegram test message sent successfully")
    
    def test_telegram_morning_briefing(self):
        """Item 17: /api/telegram/morning-briefing should work"""
        response = requests.post(f"{BASE_URL}/api/telegram/morning-briefing", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success', f"Morning briefing failed: {data}"
        print(f"✓ Morning briefing sent successfully")
    
    def test_telegram_daily_summary(self):
        """Item 18: /api/telegram/daily-summary should work"""
        response = requests.post(f"{BASE_URL}/api/telegram/daily-summary", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success', f"Daily summary failed: {data}"
        print(f"✓ Daily summary sent successfully")


class TestOptionsEndpoints:
    """Test items 19-20: Options/Greeks endpoints"""
    
    def test_options_greeks(self):
        """Item 19: /api/options/greeks returns valid Greeks"""
        response = requests.get(f"{BASE_URL}/api/options/greeks?spot=24000&strike=24000&type=CE", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        greeks = data.get('greeks', {})
        assert 'delta' in greeks
        assert 'gamma' in greeks
        assert 'theta' in greeks
        assert 'vega' in greeks
        print(f"✓ Greeks: delta={greeks.get('delta')}, gamma={greeks.get('gamma')}, theta={greeks.get('theta')}, vega={greeks.get('vega')}")
    
    def test_position_sizing(self):
        """Item 20: /api/position-sizing returns valid Kelly Criterion data"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'trading_mode' in data
        print(f"✓ Position sizing: trading_mode={data.get('trading_mode')}")


class TestExitAdvisor:
    """Test items 21-22: Exit Advisor endpoints"""
    
    def test_exit_advisor_status(self):
        """Item 21: /api/exit-advisor/status shows running=true"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        advisor = data.get('advisor', {})
        assert advisor.get('running') == True, f"Exit advisor not running: {advisor}"
        print(f"✓ Exit advisor running: {advisor.get('running')}")
    
    def test_exit_advisor_advice(self):
        """Item 22: /api/exit-advisor/advice returns advice map"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/advice", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'advice' in data
        print(f"✓ Exit advisor advice: {len(data.get('advice', {}))} entries")


class TestBackgroundJobs:
    """Test item 23: Background jobs status"""
    
    def test_health_shows_background_jobs_running(self):
        """Item 23: /api/health shows all 3 background jobs running"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        bg = data.get('background_fetcher', {})
        assert bg.get('running') == True, f"Background fetcher not running: {bg}"
        
        advisor = data.get('exit_advisor', {})
        assert advisor.get('running') == True, f"Exit advisor not running: {advisor}"
        
        briefing = data.get('morning_briefing', {})
        assert briefing.get('running') == True, f"Morning briefing not running: {briefing}"
        
        print(f"✓ All 3 background jobs running: fetcher={bg.get('running')}, advisor={advisor.get('running')}, briefing={briefing.get('running')}")


class TestAIGuards:
    """Test item 24: AI Guards status"""
    
    def test_ai_guards_status(self):
        """Item 24: /api/ai-guards/status returns 8 guards with details"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        guards = data.get('guards', {})
        assert len(guards) == 8, f"Expected 8 guards, got {len(guards)}"
        
        expected_guards = ['multi_timeframe', 'market_regime_filter', 'trailing_stop', 
                          'multi_source_verification', 'time_of_day_filter', 'max_daily_loss',
                          'kelly_sizing', 'greeks_filter']
        for guard in expected_guards:
            assert guard in guards, f"Missing guard: {guard}"
        
        print(f"✓ AI Guards: {len(guards)} guards found")
        for name, details in guards.items():
            print(f"  - {name}: enabled={details.get('enabled')}")


class TestTradesEndpoints:
    """Test items 25-27: Trades endpoints"""
    
    def test_trades_active(self):
        """Item 25: /api/trades/active returns success"""
        response = requests.get(f"{BASE_URL}/api/trades/active", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"✓ Active trades: {data.get('count', 0)} trades")
    
    def test_trades_today(self):
        """Item 26: /api/trades/today returns success with pnl fields"""
        response = requests.get(f"{BASE_URL}/api/trades/today", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'today_pnl' in data
        assert 'realized_pnl' in data
        assert 'unrealized_pnl' in data
        print(f"✓ Today trades: pnl={data.get('today_pnl')}, realized={data.get('realized_pnl')}, unrealized={data.get('unrealized_pnl')}")
    
    def test_trades_history(self):
        """Item 27: /api/trades/history returns success with summary"""
        response = requests.get(f"{BASE_URL}/api/trades/history", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'summary' in data
        summary = data.get('summary', {})
        assert 'total_trades' in summary
        assert 'win_rate' in summary
        print(f"✓ Trade history: {summary.get('total_trades')} trades, win_rate={summary.get('win_rate')}%")


class TestSignalsAndSettings:
    """Test items 28-29: Signals and auto-settings"""
    
    def test_signals_latest(self):
        """Item 28: /api/signals/latest returns success"""
        response = requests.get(f"{BASE_URL}/api/signals/latest", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"✓ Latest signals: {data.get('count', 0)} signals")
    
    def test_auto_settings(self):
        """Item 29: /api/auto-settings returns success with required fields"""
        response = requests.get(f"{BASE_URL}/api/auto-settings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        settings = data.get('settings', {})
        assert 'auto_exit' in settings
        assert 'auto_entry' in settings
        assert 'target_pct' in settings
        assert 'stoploss_pct' in settings
        print(f"✓ Auto settings: auto_exit={settings.get('auto_exit')}, auto_entry={settings.get('auto_entry')}, target={settings.get('target_pct')}%, sl={settings.get('stoploss_pct')}%")


class TestOtherEndpoints:
    """Test items 30-35: Other critical endpoints"""
    
    def test_news_latest(self):
        """Item 30: /api/news/latest returns success"""
        response = requests.get(f"{BASE_URL}/api/news/latest", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"✓ Latest news: {len(data.get('news', []))} articles")
    
    def test_portfolio(self):
        """Item 31: /api/portfolio returns success"""
        response = requests.get(f"{BASE_URL}/api/portfolio", timeout=10)
        assert response.status_code == 200
        data = response.json()
        # Portfolio endpoint returns data directly or with status field
        assert 'current_value' in data or data.get('status') == 'success'
        print(f"✓ Portfolio: current_value={data.get('current_value')}")
    
    def test_settings(self):
        """Item 32: /api/settings returns success with all sections"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        settings = data.get('settings', {})
        assert 'trading_mode' in settings
        assert 'broker' in settings
        assert 'risk' in settings
        print(f"✓ Settings: trading_mode={settings.get('trading_mode')}")
    
    def test_historical_patterns(self):
        """Item 33: /api/historical-patterns returns success"""
        response = requests.get(f"{BASE_URL}/api/historical-patterns", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        print(f"✓ Historical patterns: {data.get('total_patterns', 0)} patterns")
    
    def test_ai_insights(self):
        """Item 34: /api/ai/insights returns success with market_status"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        # market_status is nested inside insights object
        insights = data.get('insights', {})
        assert 'market_status' in insights or 'market_status' in data
        market_status = insights.get('market_status', data.get('market_status', {}))
        print(f"✓ AI insights: market_status={market_status}")
    
    def test_market_data_bg_status(self):
        """Item 35: /api/market-data/bg-status returns fetcher status"""
        response = requests.get(f"{BASE_URL}/api/market-data/bg-status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        fetcher = data.get('fetcher', {})
        assert 'running' in fetcher
        print(f"✓ Market data bg status: running={fetcher.get('running')}")


class TestRoutesCount:
    """Test item 36: Routes loaded count"""
    
    def test_routes_loaded_count(self):
        """Item 36: Routes loaded count = 13"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        routes = data.get('routes_loaded', 0)
        assert routes == 13, f"Expected 13 routes, got {routes}"
        print(f"✓ Routes loaded: {routes}/13")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
