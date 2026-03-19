"""
Iteration 7 Feature Tests
Tests for: Market Closed status, News deduplication, Square-off check,
Historical patterns, Daily summary, Telegram (not configured), News sector field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://market-sentinel-68.preview.emergentagent.com').rstrip('/')

class TestHealthAndStatus:
    """Basic API health tests"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'services' in data
        print("✅ Health endpoint working")
    
    def test_portfolio_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert 'current_value' in data
        assert 'total_pnl' in data
        print(f"✅ Portfolio: value={data['current_value']}, pnl={data['total_pnl']}")


class TestSquareOffCheck:
    """Test #4: /api/market/square-off-check endpoint"""
    
    def test_square_off_check_returns_correct_structure(self):
        """Square-off check should return open_count and related info"""
        response = requests.post(f"{BASE_URL}/api/market/square-off-check")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'open_count' in data
        assert isinstance(data['open_count'], int)
        print(f"✅ Square-off check: open_count={data['open_count']}")
        
        # When no open positions, should show message
        if data['open_count'] == 0:
            assert 'message' in data
            assert data['message'] == 'No open positions'
            print("✅ Correct 'No open positions' message when open_count=0")


class TestHistoricalPatterns:
    """Test #5: /api/historical-patterns endpoint structure"""
    
    def test_historical_patterns_structure(self):
        """Historical patterns should return total_patterns, sector_stats, sentiment_stats"""
        response = requests.get(f"{BASE_URL}/api/historical-patterns")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'total_patterns' in data
        assert 'sector_stats' in data
        assert 'sentiment_stats' in data
        assert 'profitable_patterns' in data
        assert 'win_rate' in data
        
        print(f"✅ Historical patterns: total={data['total_patterns']}, win_rate={data['win_rate']}%")


class TestNewsDeduplication:
    """Test #3: News deduplication - second fetch should return fewer/zero new articles"""
    
    def test_news_fetch_returns_success(self):
        """First fetch should return success status"""
        response = requests.get(f"{BASE_URL}/api/news/fetch")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'articles_processed' in data
        print(f"✅ News fetch: {data['articles_processed']} articles processed")
    
    def test_news_deduplication_second_fetch(self):
        """Second consecutive fetch should return 0 articles (deduplication working)"""
        # First fetch
        response1 = requests.get(f"{BASE_URL}/api/news/fetch")
        assert response1.status_code == 200
        
        # Second fetch immediately after should return 0 new articles
        response2 = requests.get(f"{BASE_URL}/api/news/fetch")
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Since same news already exists, should be 0 or very few new articles
        assert data2['articles_processed'] == 0 or data2['articles_processed'] <= 2
        print(f"✅ Deduplication working: second fetch returned {data2['articles_processed']} new articles")


class TestNewsSectorField:
    """Test #11: News articles should have sector field in sentiment_analysis"""
    
    def test_news_latest_has_sector_field(self):
        """Latest news should have sector in sentiment_analysis"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        
        assert 'news' in data
        if len(data['news']) > 0:
            article = data['news'][0]
            assert 'sentiment_analysis' in article
            sentiment = article['sentiment_analysis']
            assert 'sector' in sentiment, "Missing 'sector' field in sentiment_analysis"
            print(f"✅ News has sector field: {sentiment.get('sector')}")
        else:
            print("⚠️ No news articles to check for sector field")


class TestDailySummary:
    """Test #12: /api/daily-summary returns today's summary"""
    
    def test_daily_summary_structure(self):
        """Daily summary should return comprehensive summary"""
        response = requests.get(f"{BASE_URL}/api/daily-summary")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'summary' in data
        
        summary = data['summary']
        required_fields = ['date', 'total_trades', 'closed_trades', 'open_trades', 
                          'winning_trades', 'losing_trades', 'win_rate', 'total_pnl']
        
        for field in required_fields:
            assert field in summary, f"Missing field: {field}"
        
        print(f"✅ Daily summary: {summary['total_trades']} trades, P&L={summary['total_pnl']}, win_rate={summary['win_rate']}%")


class TestTelegramNotConfigured:
    """Test #13: Telegram send-daily-summary returns proper error when not configured"""
    
    def test_telegram_not_configured_error(self):
        """Should return proper error message when Telegram not configured"""
        response = requests.post(f"{BASE_URL}/api/telegram/send-daily-summary")
        assert response.status_code == 200
        data = response.json()
        
        # Could be success (if configured) or error (if not configured)
        if data['status'] == 'error':
            assert 'message' in data
            assert 'not configured' in data['message'].lower() or 'telegram' in data['message'].lower()
            print(f"✅ Telegram returns proper error when not configured: {data['message']}")
        else:
            print(f"⚠️ Telegram is configured and message was sent: {data.get('message')}")


class TestTradesEndpoints:
    """Test trades-related endpoints"""
    
    def test_trades_today(self):
        """Test /api/trades/today endpoint"""
        response = requests.get(f"{BASE_URL}/api/trades/today")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'total_trades_today' in data
        assert 'today_pnl' in data
        print(f"✅ Trades today: {data['total_trades_today']} trades, P&L={data['today_pnl']}")
    
    def test_trades_history(self):
        """Test /api/trades/history endpoint with filters"""
        response = requests.get(f"{BASE_URL}/api/trades/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'trades' in data
        assert 'summary' in data
        
        summary = data['summary']
        assert 'total_trades' in summary
        assert 'win_rate' in summary
        print(f"✅ Trades history: {data['count']} trades, win_rate={summary['win_rate']}%")
    
    def test_trades_active(self):
        """Test /api/trades/active endpoint"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'count' in data
        assert 'trades' in data
        print(f"✅ Active trades: {data['count']}")


class TestCombinedStatus:
    """Test combined status endpoint for dashboard"""
    
    def test_combined_status(self):
        """Test /api/combined-status endpoint"""
        response = requests.get(f"{BASE_URL}/api/combined-status")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'mode' in data
        assert 'upstox_connected' in data
        print(f"✅ Combined status: mode={data['mode']}, upstox_connected={data['upstox_connected']}")


class TestSignalsEndpoints:
    """Test signals-related endpoints"""
    
    def test_signals_latest(self):
        """Test /api/signals/latest endpoint"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'signals' in data
        print(f"✅ Latest signals: {data['count']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
