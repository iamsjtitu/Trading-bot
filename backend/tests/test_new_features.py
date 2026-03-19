"""
Test suite for AI Trading Bot - Iteration 5 New Features
Testing: 
1. Trade History API with filters, sorting, and summary stats
2. Daily Summary API
3. Telegram Send Daily Summary API
4. Sentiment Service sector detection
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://auto-trade-signals-18.preview.emergentagent.com')


class TestHealthAndBasic:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "services" in data
        print(f"PASS: Health check - {data['status']}")
    
    def test_portfolio_endpoint(self):
        """Test /api/portfolio returns valid portfolio data"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert "initial_capital" in data
        assert "current_value" in data
        assert "total_pnl" in data
        print(f"PASS: Portfolio - Value: {data['current_value']}, P&L: {data['total_pnl']}")


class TestTradeHistoryAPI:
    """Tests for enhanced Trade History API with filters and summary"""
    
    def test_trade_history_basic(self):
        """Test /api/trades/history returns trades and summary"""
        response = requests.get(f"{BASE_URL}/api/trades/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "trades" in data
        assert "summary" in data
        assert "count" in data
        print(f"PASS: Trade history basic - {data['count']} trades returned")
    
    def test_trade_history_has_summary_stats(self):
        """Test summary object has all required stats"""
        response = requests.get(f"{BASE_URL}/api/trades/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        summary = data.get("summary", {})
        
        # Check all required summary fields
        required_fields = ['total_trades', 'win_rate', 'total_pnl', 'avg_win', 
                           'best_trade', 'worst_trade', 'closed_trades', 
                           'open_trades', 'winning_trades', 'losing_trades']
        for field in required_fields:
            assert field in summary, f"Missing summary field: {field}"
        
        print(f"PASS: Summary stats - Total: {summary['total_trades']}, Win Rate: {summary['win_rate']}%, P&L: {summary['total_pnl']}")
    
    def test_trade_history_filter_by_status_closed(self):
        """Test filtering trades by status=CLOSED"""
        response = requests.get(f"{BASE_URL}/api/trades/history?status=CLOSED&limit=20")
        assert response.status_code == 200
        data = response.json()
        trades = data.get("trades", [])
        # All returned trades should be CLOSED
        for trade in trades:
            assert trade.get("status") == "CLOSED", f"Expected CLOSED status, got {trade.get('status')}"
        print(f"PASS: Filter by CLOSED - {len(trades)} trades returned, all CLOSED")
    
    def test_trade_history_filter_by_status_open(self):
        """Test filtering trades by status=OPEN"""
        response = requests.get(f"{BASE_URL}/api/trades/history?status=OPEN&limit=20")
        assert response.status_code == 200
        data = response.json()
        trades = data.get("trades", [])
        for trade in trades:
            assert trade.get("status") == "OPEN", f"Expected OPEN status, got {trade.get('status')}"
        print(f"PASS: Filter by OPEN - {len(trades)} trades returned")
    
    def test_trade_history_filter_by_type_call(self):
        """Test filtering trades by trade_type=CALL"""
        response = requests.get(f"{BASE_URL}/api/trades/history?trade_type=CALL&limit=20")
        assert response.status_code == 200
        data = response.json()
        trades = data.get("trades", [])
        for trade in trades:
            assert trade.get("trade_type") == "CALL", f"Expected CALL type, got {trade.get('trade_type')}"
        print(f"PASS: Filter by CALL - {len(trades)} trades returned")
    
    def test_trade_history_filter_by_type_put(self):
        """Test filtering trades by trade_type=PUT"""
        response = requests.get(f"{BASE_URL}/api/trades/history?trade_type=PUT&limit=20")
        assert response.status_code == 200
        data = response.json()
        trades = data.get("trades", [])
        for trade in trades:
            assert trade.get("trade_type") == "PUT", f"Expected PUT type, got {trade.get('trade_type')}"
        print(f"PASS: Filter by PUT - {len(trades)} trades returned")
    
    def test_trade_history_sort_by_pnl(self):
        """Test sorting trades by P&L"""
        response = requests.get(f"{BASE_URL}/api/trades/history?sort_by=pnl&sort_order=desc&limit=10")
        assert response.status_code == 200
        data = response.json()
        trades = data.get("trades", [])
        if len(trades) > 1:
            pnl_values = [t.get("pnl", 0) or 0 for t in trades]
            # Check descending order
            for i in range(len(pnl_values) - 1):
                assert pnl_values[i] >= pnl_values[i+1], "P&L not in descending order"
        print(f"PASS: Sort by P&L desc - trades sorted correctly")
    
    def test_trade_history_sort_by_investment(self):
        """Test sorting trades by investment"""
        response = requests.get(f"{BASE_URL}/api/trades/history?sort_by=investment&sort_order=desc&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        print(f"PASS: Sort by investment - API accepts sort parameter")


class TestDailySummaryAPI:
    """Tests for Daily Summary API"""
    
    def test_daily_summary_returns_success(self):
        """Test /api/daily-summary returns valid summary"""
        response = requests.get(f"{BASE_URL}/api/daily-summary")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "summary" in data
        print(f"PASS: Daily summary returns success")
    
    def test_daily_summary_has_required_fields(self):
        """Test daily summary has all required fields"""
        response = requests.get(f"{BASE_URL}/api/daily-summary")
        assert response.status_code == 200
        data = response.json()
        summary = data.get("summary", {})
        
        required_fields = ['date', 'total_trades', 'closed_trades', 'open_trades',
                           'winning_trades', 'losing_trades', 'win_rate', 'total_pnl',
                           'total_invested', 'signals_generated', 'news_analyzed',
                           'best_trade', 'worst_trade']
        
        for field in required_fields:
            assert field in summary, f"Missing daily summary field: {field}"
        
        print(f"PASS: Daily summary - Date: {summary['date']}, Trades: {summary['total_trades']}, P&L: {summary['total_pnl']}")


class TestTelegramAPI:
    """Tests for Telegram Daily Summary API"""
    
    def test_send_daily_summary_without_config(self):
        """Test /api/telegram/send-daily-summary returns proper error when not configured"""
        response = requests.post(f"{BASE_URL}/api/telegram/send-daily-summary")
        assert response.status_code == 200
        data = response.json()
        # Should return error since Telegram is not configured
        assert data["status"] == "error"
        assert "not configured" in data.get("message", "").lower() or "telegram" in data.get("message", "").lower()
        print(f"PASS: Telegram API returns proper error: {data['message']}")


class TestSentimentServiceSector:
    """Tests for AI sentiment service with sector detection"""
    
    def test_news_latest_has_sentiment(self):
        """Test /api/news/latest returns news with sentiment analysis"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "news" in data
        print(f"PASS: News latest returns {len(data.get('news', []))} articles")
    
    def test_news_has_sector_field(self):
        """Test news articles have sector field in sentiment analysis"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=10")
        assert response.status_code == 200
        data = response.json()
        news = data.get("news", [])
        
        # Check that at least some news has sector in sentiment_analysis
        sectors_found = []
        for article in news:
            sentiment = article.get("sentiment_analysis", {})
            if sentiment and "sector" in sentiment:
                sectors_found.append(sentiment["sector"])
        
        assert len(sectors_found) > 0, "No sectors found in sentiment analysis"
        
        # Validate sector values
        valid_sectors = ['BANKING', 'IT', 'PHARMA', 'AUTO', 'ENERGY', 'METAL', 'FMCG', 'BROAD_MARKET']
        for sector in sectors_found:
            # Handle combined sectors like "BANKING/AUTO/METAL"
            parts = sector.split('/') if '/' in sector else [sector]
            for part in parts:
                assert part in valid_sectors, f"Invalid sector: {part}"
        
        print(f"PASS: Sectors found in sentiment: {set(sectors_found)}")


class TestStatsAndSettings:
    """Tests for Stats and Settings APIs"""
    
    def test_stats_endpoint(self):
        """Test /api/stats returns valid statistics"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "stats" in data
        stats = data["stats"]
        assert "total_trades" in stats
        assert "portfolio_value" in stats
        print(f"PASS: Stats - Trades: {stats['total_trades']}, Portfolio: {stats['portfolio_value']}")
    
    def test_settings_endpoint(self):
        """Test /api/settings returns valid settings"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "settings" in data
        settings = data["settings"]
        assert "broker" in settings
        assert "risk" in settings
        assert "telegram" in settings  # New telegram settings
        print(f"PASS: Settings returned with telegram config present")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
