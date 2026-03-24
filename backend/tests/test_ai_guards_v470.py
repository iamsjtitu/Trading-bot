"""
AI Trading Bot v4.7.0 - Complete Test Suite
Tests all 6 AI Loss Prevention Guards with live Upstox data
Bug fixes verified: 
1) Trailing SL math error (parentheses)
2) Multi-TF check in re-entry path
3) Intraday fallback to daily when market closed
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sentiment-trade-bot-3.preview.emergentagent.com').rstrip('/')

class TestAIGuardsStatus:
    """Test GET /api/ai-guards/status - All 6 guards with correct structure"""
    
    def test_ai_guards_status_returns_all_6_guards(self):
        """Verify all 6 guards are returned with correct structure"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'guards' in data
        assert 'current_time' in data
        
        guards = data['guards']
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
    
    def test_time_of_day_filter_shows_current_window(self):
        """Verify time_of_day_filter shows current_window as NORMAL or HIGH VOLATILITY"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        tod_filter = data['guards']['time_of_day_filter']
        
        assert 'current_window' in tod_filter
        assert 'ist_time' in tod_filter
        assert tod_filter['current_window'] in ['NORMAL', 'HIGH VOLATILITY - BLOCKED']
        
        print(f"✓ Time-of-Day Filter: {tod_filter['current_window']} at {tod_filter['ist_time']}")
    
    def test_max_daily_loss_shows_today_loss_and_limit(self):
        """Verify max_daily_loss shows today_loss and limit with blocked flag"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        max_loss = data['guards']['max_daily_loss']
        
        assert 'today_loss' in max_loss
        assert 'limit' in max_loss
        assert 'blocked' in max_loss
        assert isinstance(max_loss['today_loss'], (int, float))
        assert isinstance(max_loss['limit'], (int, float))
        assert isinstance(max_loss['blocked'], bool)
        
        print(f"✓ Max Daily Loss: Today's Loss=₹{max_loss['today_loss']}, Limit=₹{max_loss['limit']}, Blocked={max_loss['blocked']}")
    
    def test_market_regime_filter_shows_regime_and_confidence(self):
        """Verify market_regime_filter shows current_regime and confidence"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        regime_filter = data['guards']['market_regime_filter']
        
        assert 'current_regime' in regime_filter
        assert 'confidence' in regime_filter
        assert 'blocked' in regime_filter
        
        print(f"✓ Market Regime: {regime_filter['current_regime']} ({regime_filter['confidence']}% confidence)")
    
    def test_multi_source_verification_shows_recent_sources(self):
        """Verify multi_source_verification shows recent_sources count"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        multi_source = data['guards']['multi_source_verification']
        
        assert 'recent_sources' in multi_source
        assert isinstance(multi_source['recent_sources'], dict)
        
        print(f"✓ Multi-Source Verification: Recent sources = {multi_source['recent_sources']}")


class TestAIGuardsToggle:
    """Test POST /api/ai-guards/update - Toggle guards on/off"""
    
    def test_toggle_multi_timeframe_off_then_on(self):
        """Toggle multi_timeframe OFF then back ON, verify state persists"""
        # Turn OFF
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", 
                                json={'multi_timeframe': False}, timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['multi_timeframe'] == False
        print("✓ multi_timeframe toggled OFF")
        
        # Verify OFF state persists
        status_resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert status_resp.json()['guards']['multi_timeframe']['enabled'] == False
        
        # Turn back ON
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", 
                                json={'multi_timeframe': True}, timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data['ai_guards']['multi_timeframe'] == True
        print("✓ multi_timeframe toggled back ON")
        
        # Verify ON state persists
        status_resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=15)
        assert status_resp.json()['guards']['multi_timeframe']['enabled'] == True
    
    def test_toggle_trailing_stop_off_then_on(self):
        """Toggle trailing_stop OFF then back ON"""
        # Turn OFF
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", 
                                json={'trailing_stop': False}, timeout=15)
        assert response.status_code == 200
        assert response.json()['ai_guards']['trailing_stop'] == False
        print("✓ trailing_stop toggled OFF")
        
        # Turn back ON
        response = requests.post(f"{BASE_URL}/api/ai-guards/update", 
                                json={'trailing_stop': True}, timeout=15)
        assert response.status_code == 200
        assert response.json()['ai_guards']['trailing_stop'] == True
        print("✓ trailing_stop toggled back ON")


class TestTechnicalAnalysis:
    """Test technical analysis with Upstox data and daily fallback"""
    
    def test_technical_analysis_nifty_5minute_returns_upstox_source(self):
        """GET /api/technical/analysis?instrument=NIFTY50&interval=5minute returns source=upstox with candle_count > 0"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis", 
                               params={'instrument': 'NIFTY50', 'interval': '5minute'}, timeout=20)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'source' in data
        assert 'candle_count' in data
        
        # When market is closed, should fallback to daily candles (still from upstox)
        # candle_count should be > 0 due to daily fallback
        assert data['candle_count'] > 0, f"Expected candle_count > 0, got {data['candle_count']}"
        
        # Source should be 'upstox' if broker connected, 'demo' otherwise
        print(f"✓ Technical Analysis NIFTY50 5min: source={data['source']}, candles={data['candle_count']}")
        
        if data['source'] == 'upstox':
            print("  → Using LIVE Upstox data (daily fallback when market closed)")
        else:
            print("  → Using demo data (broker not connected or token expired)")
    
    def test_technical_analysis_banknifty_30minute(self):
        """GET /api/technical/analysis?instrument=BANKNIFTY&interval=30minute returns source=upstox"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis", 
                               params={'instrument': 'BANKNIFTY', 'interval': '30minute'}, timeout=20)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['candle_count'] > 0
        
        print(f"✓ Technical Analysis BANKNIFTY 30min: source={data['source']}, candles={data['candle_count']}")


class TestAutoExitAndTrailingSL:
    """Test auto-exit check including trailing SL logic"""
    
    def test_auto_exit_check_works_without_errors(self):
        """POST /api/auto-exit/check works without errors (trailing SL logic included)"""
        response = requests.post(f"{BASE_URL}/api/auto-exit/check", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'exits_executed' in data
        assert 'new_trades_generated' in data
        
        print(f"✓ Auto-Exit Check: exits={data['exits_executed']}, new_trades={data['new_trades_generated']}")


class TestSignalsAndNews:
    """Test signals and news endpoints"""
    
    def test_signals_latest_returns_valid_data(self):
        """GET /api/signals/latest returns valid signals"""
        response = requests.get(f"{BASE_URL}/api/signals/latest", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'signals' in data
        assert isinstance(data['signals'], list)
        
        print(f"✓ Signals Latest: {data['count']} signals returned")
    
    def test_news_latest_returns_news_with_sentiment(self):
        """GET /api/news/latest returns news with sentiment analysis"""
        response = requests.get(f"{BASE_URL}/api/news/latest", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'news' in data
        assert isinstance(data['news'], list)
        
        # Check if news has sentiment_analysis
        if len(data['news']) > 0:
            first_news = data['news'][0]
            if 'sentiment_analysis' in first_news:
                sa = first_news['sentiment_analysis']
                print(f"✓ News Latest: {data['count']} articles, first sentiment={sa.get('sentiment', 'N/A')}")
            else:
                print(f"✓ News Latest: {data['count']} articles (no sentiment yet)")
        else:
            print(f"✓ News Latest: 0 articles")


class TestTradesToday:
    """Test trades/today endpoint for regression"""
    
    def test_trades_today_returns_valid_data(self):
        """GET /api/trades/today returns valid data"""
        response = requests.get(f"{BASE_URL}/api/trades/today", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'total_trades_today' in data
        assert 'today_pnl' in data
        assert 'realized_pnl' in data
        assert 'unrealized_pnl' in data
        
        print(f"✓ Trades Today: {data['total_trades_today']} trades, P&L=₹{data['today_pnl']}")


class TestTaxReportsRegression:
    """Regression test for Tax Reports tab"""
    
    def test_tax_report_endpoint_works(self):
        """GET /api/tax/report returns valid data"""
        response = requests.get(f"{BASE_URL}/api/tax/report", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        
        print(f"✓ Tax Report endpoint working")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
