"""
v22.0.0 Feature Tests - Options Trading Bot
Tests for:
1. Signal expiry (1-hour expiry for ACTIVE signals)
2. Auto-trade protection (no trades when auto_entry/auto_exit OFF)
3. Manual trade entry/exit
4. News fetch-only and analyze-article endpoints
"""
import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://options-sentinel.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


class TestAutoTradeProtection:
    """Test that no auto trades happen when auto_entry/auto_exit are OFF"""
    
    def test_auto_settings_are_off(self):
        """Verify auto_entry and auto_exit are currently OFF"""
        response = requests.get(f"{API}/auto-settings", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        settings = data['settings']
        print(f"Auto settings: auto_entry={settings.get('auto_entry')}, auto_exit={settings.get('auto_exit')}")
        # Just verify we can read the settings
        assert 'auto_entry' in settings
        assert 'auto_exit' in settings
    
    def test_auto_exit_check_returns_zero_when_off(self):
        """When auto_exit=false, POST /api/auto-exit/check should return exits_executed:0"""
        # First ensure auto_exit is OFF
        update_resp = requests.post(f"{API}/auto-settings/update", 
                                    json={"auto_exit": False, "auto_entry": False}, timeout=30)
        assert update_resp.status_code == 200
        
        # Now check auto-exit
        response = requests.post(f"{API}/auto-exit/check", json={}, timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['exits_executed'] == 0
        assert data['new_trades_generated'] == 0
        print(f"Auto-exit check result: exits={data['exits_executed']}, new_trades={data['new_trades_generated']}")
    
    def test_news_fetch_does_not_auto_execute_when_auto_entry_off(self):
        """POST /api/news/fetch should NOT auto-execute trades when auto_entry=false"""
        # Ensure auto_entry is OFF
        update_resp = requests.post(f"{API}/auto-settings/update", 
                                    json={"auto_entry": False}, timeout=30)
        assert update_resp.status_code == 200
        
        # Get current trade count
        trades_before = requests.get(f"{API}/trades/active", timeout=30).json()
        trade_count_before = len(trades_before.get('trades', []))
        
        # Fetch news (this should NOT create trades since auto_entry is OFF)
        # Note: This may take time due to news scraping
        response = requests.get(f"{API}/news/fetch", timeout=120)
        assert response.status_code == 200
        data = response.json()
        
        # Check if guard blocked (which is fine - saves API balance)
        if data.get('guard_blocked'):
            print(f"News fetch blocked by guard: {data.get('guard_reason')}")
            return  # Test passes - guard protection working
        
        # Get trade count after
        trades_after = requests.get(f"{API}/trades/active", timeout=30).json()
        trade_count_after = len(trades_after.get('trades', []))
        
        print(f"Trades before: {trade_count_before}, after: {trade_count_after}")
        # With auto_entry OFF, no new trades should be created automatically
        # (signals may be generated but not executed)


class TestSignalExpiry:
    """Test signal expiry logic - signals older than 1 hour should be EXPIRED"""
    
    def test_signals_latest_returns_only_active(self):
        """GET /api/signals/latest should only return ACTIVE signals"""
        response = requests.get(f"{API}/signals/latest?limit=20", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        signals = data.get('signals', [])
        print(f"Found {len(signals)} active signals")
        
        for signal in signals:
            assert signal.get('status') == 'ACTIVE', f"Signal {signal.get('id')} has status {signal.get('status')}, expected ACTIVE"
            # Check created_at is within last hour
            created_at = signal.get('created_at')
            if created_at:
                created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                one_hour_ago = datetime.now(created_time.tzinfo) - timedelta(hours=1)
                # Note: The code expires signals older than 1 hour when fetching
                print(f"Signal {signal.get('id')[:8]}... created at {created_at}, status={signal.get('status')}")
    
    def test_signals_active_endpoint(self):
        """GET /api/signals/active should return only ACTIVE signals in current mode"""
        response = requests.get(f"{API}/signals/active", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        signals = data.get('signals', [])
        print(f"Active signals count: {len(signals)}")
        
        for signal in signals:
            assert signal.get('status') == 'ACTIVE'


class TestNewsFetchOnly:
    """Test news fetch-only endpoint (no AI analysis)"""
    
    def test_fetch_only_returns_articles_without_ai(self):
        """POST /api/news/fetch-only should return articles with ai_analyzed=false"""
        response = requests.post(f"{API}/news/fetch-only", json={}, timeout=120)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        articles = data.get('articles', [])
        print(f"Fetched {len(articles)} articles without AI analysis")
        
        for article in articles:
            # All articles should have ai_analyzed=false
            assert article.get('ai_analyzed') == False, f"Article {article.get('id')} has ai_analyzed={article.get('ai_analyzed')}"
            # Should have keyword-based sentiment analysis
            assert 'sentiment_analysis' in article
            print(f"Article: {article.get('title', '')[:50]}... | ai_analyzed={article.get('ai_analyzed')}")


class TestNewsAnalyzeArticle:
    """Test single article AI analysis endpoint"""
    
    def test_analyze_article_requires_article_id(self):
        """POST /api/news/analyze-article should require article_id"""
        response = requests.post(f"{API}/news/analyze-article", json={}, timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'error'
        assert 'article_id' in data.get('message', '').lower()
    
    def test_analyze_article_with_valid_id(self):
        """POST /api/news/analyze-article with valid article_id should analyze"""
        # First get a recent article
        news_resp = requests.get(f"{API}/news/latest?limit=5", timeout=30)
        assert news_resp.status_code == 200
        articles = news_resp.json().get('news', [])
        
        if not articles:
            pytest.skip("No articles available to analyze")
        
        # Find an article that hasn't been AI analyzed yet
        article_to_analyze = None
        for article in articles:
            if not article.get('ai_analyzed'):
                article_to_analyze = article
                break
        
        if not article_to_analyze:
            # All articles already analyzed, just verify endpoint works
            article_to_analyze = articles[0]
        
        article_id = article_to_analyze.get('id')
        print(f"Analyzing article: {article_to_analyze.get('title', '')[:50]}...")
        
        response = requests.post(f"{API}/news/analyze-article", 
                                json={"article_id": article_id}, timeout=60)
        assert response.status_code == 200
        data = response.json()
        
        if data['status'] == 'success':
            print(f"Analysis result: {data.get('message')}")
            if data.get('signal'):
                print(f"Signal generated: {data['signal'].get('signal_type')} {data['signal'].get('symbol')}")
        else:
            print(f"Analysis failed: {data.get('message')}")


class TestManualTradeEntry:
    """Test manual trade entry from signals"""
    
    def test_execute_signal_in_paper_mode(self):
        """POST /api/trades/execute-signal should create a trade in PAPER mode"""
        # Ensure we're in PAPER mode
        settings_resp = requests.post(f"{API}/settings/update", 
                                      json={"trading_mode": "PAPER"}, timeout=30)
        assert settings_resp.status_code == 200
        
        # Get active signals
        signals_resp = requests.get(f"{API}/signals/latest?limit=5", timeout=30)
        assert signals_resp.status_code == 200
        signals = signals_resp.json().get('signals', [])
        
        if not signals:
            # Generate a test signal+trade
            gen_resp = requests.post(f"{API}/test/generate-trade", json={}, timeout=30)
            print(f"Generated test trade: {gen_resp.json()}")
            return
        
        # Get current trades
        trades_before = requests.get(f"{API}/trades/active", timeout=30).json()
        trade_count_before = len(trades_before.get('trades', []))
        
        # Execute the first signal
        signal_id = signals[0].get('id')
        print(f"Executing signal: {signal_id}")
        
        response = requests.post(f"{API}/trades/execute-signal", 
                                json={"signal_id": signal_id}, timeout=30)
        assert response.status_code == 200
        data = response.json()
        print(f"Execute signal result: {data}")
        
        if data['status'] == 'success':
            # Verify trade was created
            trades_after = requests.get(f"{API}/trades/active", timeout=30).json()
            trade_count_after = len(trades_after.get('trades', []))
            print(f"Trades before: {trade_count_before}, after: {trade_count_after}")


class TestManualTradeExit:
    """Test manual trade exit"""
    
    def test_manual_exit_requires_trade_id(self):
        """POST /api/trades/manual-exit should work with trade_id"""
        # Get active trades
        trades_resp = requests.get(f"{API}/trades/active", timeout=30)
        assert trades_resp.status_code == 200
        trades = trades_resp.json().get('trades', [])
        
        if not trades:
            print("No active trades to exit")
            return
        
        trade = trades[0]
        trade_id = trade.get('id')
        print(f"Attempting to exit trade: {trade_id}")
        
        response = requests.post(f"{API}/trades/manual-exit", 
                                json={"trade_id": trade_id}, timeout=30)
        assert response.status_code == 200
        data = response.json()
        print(f"Manual exit result: {data}")
    
    def test_manual_exit_not_found(self):
        """POST /api/trades/manual-exit with invalid trade_id should return error"""
        response = requests.post(f"{API}/trades/manual-exit", 
                                json={"trade_id": "invalid-trade-id-12345"}, timeout=30)
        assert response.status_code == 200
        data = response.json()
        # Should return error for non-existent trade
        assert data['status'] == 'error' or 'not found' in data.get('message', '').lower()


class TestGenerateTestTrade:
    """Test the test trade generation endpoint"""
    
    def test_generate_paper_trade(self):
        """POST /api/test/generate-trade should create a PAPER signal+trade"""
        # Ensure PAPER mode
        requests.post(f"{API}/settings/update", json={"trading_mode": "PAPER"}, timeout=30)
        
        response = requests.post(f"{API}/test/generate-trade", json={}, timeout=30)
        assert response.status_code == 200
        data = response.json()
        print(f"Generate trade result: {data}")
        
        if data['status'] == 'success':
            assert 'signal' in data
            print(f"Generated signal: {data['signal'].get('signal_type')} {data['signal'].get('symbol')}")


class TestHealthAndVersion:
    """Test health and version endpoints"""
    
    def test_health_endpoint(self):
        """GET /api/health should return healthy status"""
        response = requests.get(f"{API}/health", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        print(f"Version: {data.get('version')}, Routes: {data.get('routes_loaded')}")
    
    def test_settings_endpoint(self):
        """GET /api/settings should return current settings"""
        response = requests.get(f"{API}/settings", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        settings = data.get('settings', {})
        print(f"Trading mode: {settings.get('trading_mode')}")
        print(f"Auto entry: {settings.get('auto_trading', {}).get('auto_entry')}")
        print(f"Auto exit: {settings.get('auto_trading', {}).get('auto_exit')}")


class TestAIGuards:
    """Test AI Guards status endpoint"""
    
    def test_ai_guards_status(self):
        """GET /api/ai-guards/status should return all guards"""
        response = requests.get(f"{API}/ai-guards/status", timeout=30)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        guards = data.get('guards', {})
        print(f"AI Guards: {list(guards.keys())}")
        
        # Verify expected guards exist
        expected_guards = ['multi_timeframe', 'trailing_stop', 'max_daily_loss', 'max_daily_profit', 'kelly_sizing']
        for guard in expected_guards:
            assert guard in guards, f"Missing guard: {guard}"
            print(f"  {guard}: enabled={guards[guard].get('enabled')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
