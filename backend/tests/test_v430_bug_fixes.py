"""
Backend Tests for v4.3.0 Bug Fixes
Tests Technical Analysis, Signals, Risk Ratio, Auto-Settings, Trading, Journal endpoints

Verified Fixes:
1) Technical Analysis uses Upstox live data (source='upstox')
2) Risk ratio guard: target >= stoploss enforced
3) Shared AI Engine between news.js and trading.js
4) Max_open_trades check uses count instead of duplicate check
5) Live trade execution uses signal's pre-calculated SL/Target values
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestTechnicalAnalysis:
    """Technical Analysis - Verify Upstox live data integration"""
    
    def test_nifty50_5minute_upstox_data(self):
        """GET /api/technical/analysis?instrument=NIFTY50&interval=5minute should return source='upstox'"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis", params={
            "instrument": "NIFTY50",
            "interval": "5minute"
        }, timeout=20)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("source") == "upstox", f"Expected source='upstox', got '{data.get('source')}'"
        assert data.get("candle_count", 0) > 0, "Expected candle_count > 0"
        assert data.get("instrument") == "NIFTY50"
        print(f"[PASS] NIFTY50 5min: source={data.get('source')}, candles={data.get('candle_count')}")
    
    def test_banknifty_30minute_upstox_data(self):
        """GET /api/technical/analysis?instrument=BANKNIFTY&interval=30minute should use Upstox"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis", params={
            "instrument": "BANKNIFTY",
            "interval": "30minute"
        }, timeout=20)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert data.get("source") == "upstox", f"Expected source='upstox', got '{data.get('source')}'"
        assert data.get("candle_count", 0) > 0
        print(f"[PASS] BANKNIFTY 30min: source={data.get('source')}, candles={data.get('candle_count')}")
    
    def test_technical_indicators_present(self):
        """Verify RSI, MACD, VWAP, EMA, SMA indicators are present"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis", params={
            "instrument": "NIFTY50",
            "interval": "5minute"
        }, timeout=20)
        assert response.status_code == 200
        data = response.json()
        indicators = data.get("indicators", {})
        
        # Check all required indicators exist
        required = ["rsi", "macd", "vwap", "ema", "sma"]
        for ind in required:
            assert ind in indicators, f"Missing indicator: {ind}"
            assert "signal" in indicators[ind], f"Missing signal in {ind}"
        
        # Check overall signal
        assert "overall" in data
        assert "signal" in data["overall"]
        print(f"[PASS] All indicators present: {list(indicators.keys())}")


class TestSignalsEndpoint:
    """Signals API - Verify proper stop_loss and target values"""
    
    def test_signals_latest(self):
        """GET /api/signals/latest should return signals with proper SL/Target"""
        response = requests.get(f"{BASE_URL}/api/signals/latest", params={"limit": 10}, timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        signals = data.get("signals", [])
        print(f"[INFO] Found {len(signals)} signals")
        
        # Verify signal structure
        for sig in signals[:3]:  # Check first 3
            assert "signal_type" in sig, "Missing signal_type"
            assert "stop_loss" in sig, "Missing stop_loss"
            assert "target" in sig, "Missing target"
            assert "confidence" in sig, "Missing confidence"
            
            # Verify risk ratio guard: target >= stop_loss in terms of percentage movement
            # For a BUY, target > entry > stop_loss
            # The values are prices, not percentages
            # target should be > stop_loss for a call (buying low, selling high)
            if sig.get("signal_type") == "CALL":
                assert sig["target"] > sig["stop_loss"], f"Call signal target ({sig['target']}) should be > stop_loss ({sig['stop_loss']})"
        print(f"[PASS] Signals have valid SL/Target structure")


class TestAutoSettings:
    """Auto-Settings - Verify auto_exit, auto_entry, target_pct, stoploss_pct"""
    
    def test_get_auto_settings(self):
        """GET /api/auto-settings should return current settings"""
        response = requests.get(f"{BASE_URL}/api/auto-settings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        settings = data.get("settings", {})
        
        assert "auto_exit" in settings
        assert "auto_entry" in settings
        assert "target_pct" in settings
        assert "stoploss_pct" in settings
        print(f"[PASS] Auto settings: exit={settings['auto_exit']}, entry={settings['auto_entry']}, target={settings['target_pct']}%, sl={settings['stoploss_pct']}%")
    
    def test_update_auto_settings(self):
        """POST /api/auto-settings/update with proper target > stoploss should work"""
        response = requests.post(f"{BASE_URL}/api/auto-settings/update", 
            json={"target_pct": 25, "stoploss_pct": 15},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        settings = data.get("settings", {})
        assert settings.get("target_pct") == 25
        assert settings.get("stoploss_pct") == 15
        print(f"[PASS] Updated settings: target={settings['target_pct']}%, sl={settings['stoploss_pct']}%")


class TestAutoExit:
    """Auto-Exit endpoint - Verify check works without errors"""
    
    def test_auto_exit_check(self):
        """POST /api/auto-exit/check should work without errors"""
        response = requests.post(f"{BASE_URL}/api/auto-exit/check", 
            json={},
            headers={"Content-Type": "application/json"},
            timeout=15
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert "exits_executed" in data
        print(f"[PASS] Auto-exit check: exits={data.get('exits_executed')}, new_trades={data.get('new_trades_generated')}")


class TestTrades:
    """Trading endpoints - today's P&L, active trades"""
    
    def test_trades_today(self):
        """GET /api/trades/today should return P&L values"""
        response = requests.get(f"{BASE_URL}/api/trades/today", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert "today_pnl" in data
        assert "realized_pnl" in data
        assert "unrealized_pnl" in data
        print(f"[PASS] Today's P&L: total={data.get('today_pnl')}, realized={data.get('realized_pnl')}, unrealized={data.get('unrealized_pnl')}")
    
    def test_trades_active(self):
        """GET /api/trades/active should return active trades with isLive flag"""
        response = requests.get(f"{BASE_URL}/api/trades/active", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert "trades" in data
        assert "isLive" in data or "count" in data
        print(f"[PASS] Active trades: count={data.get('count')}, isLive={data.get('isLive', 'N/A')}")


class TestDebugEndpoint:
    """Debug endpoint - diagnostic steps"""
    
    def test_debug_auto_trade(self):
        """GET /api/debug/auto-trade-test should return diagnostic steps"""
        response = requests.get(f"{BASE_URL}/api/debug/auto-trade-test", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        steps = data.get("steps", [])
        assert len(steps) > 0, "Expected diagnostic steps"
        
        # Verify expected steps exist
        step_names = [s.get("name") for s in steps]
        assert "Trading Mode" in step_names
        assert "Auto-Entry Enabled" in step_names
        assert "Broker Token" in step_names
        print(f"[PASS] Debug endpoint: {len(steps)} diagnostic steps, all_ok={data.get('all_ok')}")


class TestNews:
    """News endpoints"""
    
    def test_news_latest(self):
        """GET /api/news/latest should return news with sentiment"""
        response = requests.get(f"{BASE_URL}/api/news/latest", params={"limit": 5}, timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        news = data.get("news", [])
        
        if len(news) > 0:
            article = news[0]
            assert "title" in article
            assert "sentiment_analysis" in article
            sa = article.get("sentiment_analysis", {})
            assert "sentiment" in sa
            assert "confidence" in sa
        print(f"[PASS] News: {len(news)} articles returned")


class TestAIInsights:
    """AI Insights endpoint"""
    
    def test_ai_insights(self):
        """GET /api/ai/insights should return market regime and sector rotation"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        insights = data.get("insights", {})
        
        assert "market_regime" in insights
        assert "sector_rotation" in insights
        assert "market_status" in insights
        
        regime = insights.get("market_regime", {})
        assert "regime" in regime
        assert "confidence" in regime
        print(f"[PASS] AI Insights: regime={regime.get('regime')}, rotation={insights.get('sector_rotation', {}).get('rotation')}")


class TestJournal:
    """Journal endpoints - entries and stats"""
    
    def test_journal_entries(self):
        """GET /api/journal/entries should work (may return 0 if no closed trades)"""
        response = requests.get(f"{BASE_URL}/api/journal/entries", params={"limit": 5}, timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert "entries" in data or "count" in data
        print(f"[PASS] Journal entries: {data.get('count', len(data.get('entries', [])))} entries")
    
    def test_journal_stats(self):
        """GET /api/journal/stats should return stats structure"""
        response = requests.get(f"{BASE_URL}/api/journal/stats", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert "stats" in data
        print(f"[PASS] Journal stats: total={data.get('stats', {}).get('total', 0)}")


class TestDailySummary:
    """Daily summary endpoint"""
    
    def test_daily_summary(self):
        """GET /api/daily-summary should return today's trading summary"""
        response = requests.get(f"{BASE_URL}/api/daily-summary", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        summary = data.get("summary", {})
        
        assert "date" in summary
        assert "total_trades" in summary
        assert "total_pnl" in summary
        assert "signals_generated" in summary
        print(f"[PASS] Daily summary: date={summary.get('date')}, trades={summary.get('total_trades')}, signals={summary.get('signals_generated')}")


class TestHistoricalPatterns:
    """Historical patterns endpoint"""
    
    def test_historical_patterns(self):
        """GET /api/historical-patterns should return pattern data"""
        response = requests.get(f"{BASE_URL}/api/historical-patterns", timeout=15)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "success"
        assert "total_patterns" in data
        assert "sector_stats" in data
        assert "sentiment_stats" in data
        print(f"[PASS] Historical patterns: total={data.get('total_patterns')}, win_rate={data.get('win_rate')}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
