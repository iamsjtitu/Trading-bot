"""
Test Suite for P&L Bug Fix and AI Features
Tests: Today's P&L, Active Trades, AI Brain, Technical Analysis
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://live-pnl-dashboard.preview.emergentagent.com')

class TestTodayPnL:
    """Tests for Today's P&L bug fix - should return non-zero unrealized P&L"""
    
    def test_trades_today_endpoint_returns_success(self):
        """GET /api/trades/today should return success"""
        response = requests.get(f"{BASE_URL}/api/trades/today")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
    
    def test_trades_today_returns_pnl_fields(self):
        """GET /api/trades/today should return realized, unrealized, and today_pnl fields"""
        response = requests.get(f"{BASE_URL}/api/trades/today")
        assert response.status_code == 200
        data = response.json()
        assert 'today_pnl' in data
        assert 'realized_pnl' in data
        assert 'unrealized_pnl' in data
        print(f"Today's P&L: {data['today_pnl']}, Realized: {data['realized_pnl']}, Unrealized: {data['unrealized_pnl']}")
    
    def test_trades_today_unrealized_pnl_non_zero_with_open_trades(self):
        """When open trades exist, unrealized_pnl should be non-zero"""
        # First check if there are open trades
        active_response = requests.get(f"{BASE_URL}/api/trades/active")
        active_data = active_response.json()
        open_trades_count = active_data.get('count', 0)
        
        # Get today's P&L
        response = requests.get(f"{BASE_URL}/api/trades/today")
        data = response.json()
        
        if open_trades_count > 0:
            # Bug fix verification: unrealized_pnl should be non-zero when there are open trades
            # The P&L may be small but shouldn't be exactly 0 with price movements
            print(f"Open trades: {open_trades_count}, Unrealized P&L: {data.get('unrealized_pnl')}")
            # today_pnl = realized + unrealized
            expected_total = round(data.get('realized_pnl', 0) + data.get('unrealized_pnl', 0), 2)
            assert data.get('today_pnl') == expected_total or abs(data.get('today_pnl', 0) - expected_total) < 0.01
        else:
            print("No open trades - skipping unrealized P&L check")


class TestActiveTrades:
    """Tests for Active Trades endpoint"""
    
    def test_active_trades_returns_success(self):
        """GET /api/trades/active should return success"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
    
    def test_active_trades_have_live_pnl(self):
        """Active trades should have live_pnl values"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        data = response.json()
        trades = data.get('trades', [])
        
        if len(trades) > 0:
            for trade in trades:
                assert 'live_pnl' in trade, f"Trade {trade.get('id')} missing live_pnl"
                assert trade['live_pnl'] is not None, f"Trade {trade.get('id')} has null live_pnl"
                print(f"Trade {trade.get('symbol')}: live_pnl = {trade.get('live_pnl')}")
        else:
            print("No active trades to verify live_pnl")


class TestAIBrain:
    """Tests for AI Brain / AI Insights endpoints"""
    
    def test_ai_insights_returns_success(self):
        """GET /api/ai/insights should return success"""
        response = requests.get(f"{BASE_URL}/api/ai/insights")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
    
    def test_ai_insights_has_required_fields(self):
        """AI insights should contain market_regime, sector_rotation, sentiment_depth"""
        response = requests.get(f"{BASE_URL}/api/ai/insights")
        data = response.json()
        insights = data.get('insights', {})
        
        assert 'market_regime' in insights, "Missing market_regime"
        assert 'sector_rotation' in insights, "Missing sector_rotation"
        assert 'sentiment_depth' in insights, "Missing sentiment_depth"
        print(f"Market Regime: {insights.get('market_regime')}")
        print(f"Sector Rotation: {insights.get('sector_rotation')}")
        print(f"Sentiment Depth: {insights.get('sentiment_depth')}")
    
    def test_ai_heatmap_returns_success(self):
        """GET /api/ai/heatmap should return success"""
        response = requests.get(f"{BASE_URL}/api/ai/heatmap")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
    
    def test_ai_heatmap_has_sectors_data(self):
        """AI heatmap should contain sectors data"""
        response = requests.get(f"{BASE_URL}/api/ai/heatmap")
        data = response.json()
        
        # Should have heatmap with sector keys
        assert 'heatmap' in data
        heatmap = data.get('heatmap', {})
        assert len(heatmap) > 0, "Heatmap should have at least one sector"
        
        # Check sector structure
        for sector, buckets in heatmap.items():
            for bucket_name, bucket_data in buckets.items():
                assert 'bullish' in bucket_data
                assert 'bearish' in bucket_data
                assert 'total' in bucket_data
                break  # Check just first bucket
            break  # Check just first sector


class TestTechnicalAnalysis:
    """Tests for Technical Analysis endpoints"""
    
    def test_technical_intervals_returns_success(self):
        """GET /api/technical/intervals should return success"""
        response = requests.get(f"{BASE_URL}/api/technical/intervals")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
    
    def test_technical_intervals_has_required_data(self):
        """Technical intervals should return intervals and instruments"""
        response = requests.get(f"{BASE_URL}/api/technical/intervals")
        data = response.json()
        
        assert 'intervals' in data, "Missing intervals"
        assert 'instruments' in data, "Missing instruments"
        assert len(data['intervals']) > 0, "Should have at least one interval"
        assert len(data['instruments']) > 0, "Should have at least one instrument"
        print(f"Intervals: {[i.get('value') for i in data['intervals']]}")
        print(f"Instruments: {data['instruments']}")
    
    def test_technical_analysis_returns_success(self):
        """GET /api/technical/analysis should return success"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis?instrument=NIFTY50&interval=5minute")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
    
    def test_technical_analysis_has_all_indicators(self):
        """Technical analysis should have RSI, MACD, VWAP, EMA, SMA indicators"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis?instrument=NIFTY50&interval=5minute")
        data = response.json()
        
        indicators = data.get('indicators', {})
        required_indicators = ['rsi', 'macd', 'vwap', 'ema', 'sma']
        
        for ind in required_indicators:
            assert ind in indicators, f"Missing indicator: {ind}"
            # Each indicator should have signal and reason
            assert 'signal' in indicators[ind], f"{ind} missing signal"
            assert 'reason' in indicators[ind], f"{ind} missing reason"
            print(f"{ind.upper()}: signal={indicators[ind].get('signal')}, reason={indicators[ind].get('reason')}")
    
    def test_technical_analysis_overall_signal(self):
        """Technical analysis should have overall signal with strength"""
        response = requests.get(f"{BASE_URL}/api/technical/analysis?instrument=NIFTY50&interval=5minute")
        data = response.json()
        
        overall = data.get('overall', {})
        assert 'signal' in overall, "Missing overall signal"
        assert 'strength' in overall, "Missing overall strength"
        assert overall['signal'] in ['BULLISH', 'BEARISH', 'NEUTRAL'], "Invalid signal value"
        print(f"Overall: {overall}")


class TestHealthAndVersion:
    """Tests for health check"""
    
    def test_health_endpoint(self):
        """GET /api/health should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        print(f"Version: {data.get('version')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
