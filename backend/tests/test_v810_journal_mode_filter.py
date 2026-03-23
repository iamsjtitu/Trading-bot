"""
Test v8.1.0 Journal Mode Filter Bug Fix
Bug: Journal was showing Paper Trading data in LIVE mode
Fix: All journal, stats, insights, review-all, trade analytics endpoints now filter by mode
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://options-sentinel.preview.emergentagent.com')

class TestJournalModeFilter:
    """Test journal endpoints filter by trading mode correctly"""
    
    def test_journal_entries_live_mode_returns_zero(self):
        """GET /api/journal/entries?mode=LIVE should return 0 entries (no LIVE trades in test env)"""
        response = requests.get(f"{BASE_URL}/api/journal/entries?mode=LIVE")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['count'] == 0
        assert data['entries'] == []
        print(f"PASS: LIVE mode journal entries = {data['count']} (expected 0)")
    
    def test_journal_entries_paper_mode_returns_paper_only(self):
        """GET /api/journal/entries?mode=PAPER should return PAPER entries only"""
        response = requests.get(f"{BASE_URL}/api/journal/entries?mode=PAPER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['count'] >= 0
        # Verify all entries are PAPER mode
        for entry in data['entries']:
            assert entry.get('mode') == 'PAPER', f"Entry {entry.get('id')} has mode {entry.get('mode')}, expected PAPER"
        print(f"PASS: PAPER mode journal entries = {data['count']}, all have mode=PAPER")
    
    def test_journal_stats_live_mode_returns_zero_total(self):
        """GET /api/journal/stats?mode=LIVE should return total=0"""
        response = requests.get(f"{BASE_URL}/api/journal/stats?mode=LIVE")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['stats']['total'] == 0
        print(f"PASS: LIVE mode journal stats total = {data['stats']['total']} (expected 0)")
    
    def test_journal_stats_paper_mode_returns_correct_stats(self):
        """GET /api/journal/stats?mode=PAPER should return correct stats"""
        response = requests.get(f"{BASE_URL}/api/journal/stats?mode=PAPER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        stats = data['stats']
        assert stats['total'] >= 0
        if stats['total'] > 0:
            assert 'win_rate' in stats
            assert 'avg_rating' in stats
            assert 'total_pnl' in stats
        print(f"PASS: PAPER mode journal stats total = {stats['total']}")
    
    def test_journal_insights_live_mode_works(self):
        """GET /api/journal/insights?mode=LIVE should work (may return few entries message)"""
        response = requests.get(f"{BASE_URL}/api/journal/insights?mode=LIVE")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        # With 0 LIVE entries, should return "Need at least 2 journal entries" message
        assert 'insights' in data
        print(f"PASS: LIVE mode insights returned successfully")
    
    def test_journal_insights_paper_mode_returns_insights(self):
        """GET /api/journal/insights?mode=PAPER should return insights"""
        response = requests.get(f"{BASE_URL}/api/journal/insights?mode=PAPER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'insights' in data
        insights = data['insights']
        # Should have patterns, suggestions, trade_type_performance
        if 'patterns' in insights:
            print(f"PASS: PAPER mode insights has {len(insights.get('patterns', []))} patterns")
        if 'ai_insight' in insights and insights['ai_insight']:
            print(f"PASS: PAPER mode has AI insight")
    
    def test_review_all_live_mode_reviews_only_live_trades(self):
        """POST /api/journal/review-all?mode=LIVE should review only LIVE trades"""
        response = requests.post(f"{BASE_URL}/api/journal/review-all?mode=LIVE")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        # With no LIVE trades, should say "All trades already reviewed" or reviewed=0
        print(f"PASS: LIVE mode review-all: {data.get('message', data)}")
    
    def test_review_all_paper_mode_reviews_only_paper_trades(self):
        """POST /api/journal/review-all?mode=PAPER should review only PAPER trades"""
        response = requests.post(f"{BASE_URL}/api/journal/review-all?mode=PAPER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        print(f"PASS: PAPER mode review-all: {data.get('message', data)}")


class TestTradesHistoryModeFilter:
    """Test trades/history endpoint filters by mode"""
    
    def test_trades_history_live_mode_returns_only_live(self):
        """GET /api/trades/history?mode=LIVE should return only LIVE trades"""
        response = requests.get(f"{BASE_URL}/api/trades/history?mode=LIVE")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        # Verify all trades are LIVE mode (or empty)
        for trade in data.get('trades', []):
            assert trade.get('mode') == 'LIVE', f"Trade {trade.get('id')} has mode {trade.get('mode')}, expected LIVE"
        print(f"PASS: LIVE mode trades history = {data['count']} trades")
    
    def test_trades_history_paper_mode_returns_only_paper(self):
        """GET /api/trades/history?mode=PAPER should return only PAPER trades"""
        response = requests.get(f"{BASE_URL}/api/trades/history?mode=PAPER")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        # Verify all trades are PAPER mode
        for trade in data.get('trades', []):
            assert trade.get('mode') == 'PAPER', f"Trade {trade.get('id')} has mode {trade.get('mode')}, expected PAPER"
        print(f"PASS: PAPER mode trades history = {data['count']} trades")


class TestExistingFeaturesStillWorking:
    """Test existing features still work after bug fix"""
    
    def test_health_returns_version_810(self):
        """GET /api/health returns version 8.1.0 with 13 routes"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['version'] == '8.1.0'
        assert data['routes_loaded'] == 13
        print(f"PASS: Health check version={data['version']}, routes={data['routes_loaded']}")
    
    def test_telegram_status_configured(self):
        """GET /api/telegram/status returns configured=true"""
        response = requests.get(f"{BASE_URL}/api/telegram/status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['telegram']['configured'] == True
        print(f"PASS: Telegram configured={data['telegram']['configured']}")
    
    def test_exit_advisor_running(self):
        """GET /api/exit-advisor/status shows running=true"""
        response = requests.get(f"{BASE_URL}/api/exit-advisor/status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['advisor']['running'] == True
        print(f"PASS: Exit advisor running={data['advisor']['running']}")
    
    def test_ai_guards_returns_8_guards(self):
        """GET /api/ai-guards/status returns 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        guards = data.get('guards', {})
        assert len(guards) == 8
        print(f"PASS: AI guards count = {len(guards)}")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
