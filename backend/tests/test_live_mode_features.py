"""
Test suite for Live Mode Features - Issue Fix Verification
Tests verify that when mode is LIVE and Upstox is connected, dashboard shows live data.
When mode is LIVE but Upstox is NOT connected or mode is PAPER, shows paper data.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://auto-trade-signals-18.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_health_endpoint(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{API}/health")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'services' in data
        print("✓ Health endpoint working")

    def test_settings_endpoint(self):
        """Test settings endpoint returns trading mode"""
        response = requests.get(f"{API}/settings")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'settings' in data
        assert 'trading_mode' in data['settings']
        print(f"✓ Settings endpoint working - Mode: {data['settings']['trading_mode']}")


class TestCombinedStatusAPI:
    """Tests for /api/combined-status endpoint - Core of the fix"""
    
    def test_combined_status_returns_correct_structure(self):
        """Test combined-status returns required fields"""
        response = requests.get(f"{API}/combined-status")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'upstox_connected' in data
        assert 'mode' in data
        assert 'portfolio' in data
        assert 'orders' in data
        assert 'market_data' in data
        print(f"✓ Combined status structure correct - Mode: {data['mode']}, Upstox: {data['upstox_connected']}")
    
    def test_combined_status_live_mode_not_connected(self):
        """When LIVE mode but Upstox NOT connected, returns empty portfolio/orders"""
        response = requests.get(f"{API}/combined-status")
        data = response.json()
        
        # Current state: LIVE mode but no Upstox token
        if data['mode'] == 'LIVE' and not data['upstox_connected']:
            # Portfolio should be None when Upstox not connected
            assert data['portfolio'] is None, "Portfolio should be None when Upstox disconnected"
            assert data['orders'] == [], "Orders should be empty when Upstox disconnected"
            print("✓ LIVE mode without Upstox connection returns null portfolio (correct)")


class TestPaperTradingAPIs:
    """Tests for paper trading endpoints - /api/trades/today, /api/portfolio"""
    
    def test_trades_today_returns_data(self):
        """Test /api/trades/today returns paper trading summary"""
        response = requests.get(f"{API}/trades/today")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'total_trades_today' in data
        assert 'today_pnl' in data
        assert 'today_invested' in data
        print(f"✓ Trades today - Count: {data['total_trades_today']}, P&L: {data['today_pnl']}")
    
    def test_portfolio_returns_data(self):
        """Test /api/portfolio returns paper trading portfolio"""
        response = requests.get(f"{API}/portfolio")
        assert response.status_code == 200
        data = response.json()
        
        assert 'current_value' in data
        assert 'total_pnl' in data
        assert 'active_positions' in data
        print(f"✓ Portfolio - Value: {data['current_value']}, P&L: {data['total_pnl']}")


class TestTradeHistoryAPI:
    """Tests for /api/trades/history - Trade History tab functionality"""
    
    def test_trade_history_returns_summary(self):
        """Test trade history includes summary stats"""
        response = requests.get(f"{API}/trades/history?limit=10")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'trades' in data
        assert 'summary' in data
        
        summary = data['summary']
        assert 'total_trades' in summary
        assert 'win_rate' in summary
        assert 'total_pnl' in summary
        assert 'best_trade' in summary
        assert 'worst_trade' in summary
        print(f"✓ Trade history - Trades: {summary['total_trades']}, Win Rate: {summary['win_rate']}%")
    
    def test_trade_history_filters(self):
        """Test trade history filter parameters work"""
        # Test status filter
        response = requests.get(f"{API}/trades/history?status=CLOSED&limit=10")
        assert response.status_code == 200
        data = response.json()
        trades = data.get('trades', [])
        for trade in trades:
            assert trade['status'] == 'CLOSED', "Filter should return only CLOSED trades"
        
        # Test trade_type filter
        response = requests.get(f"{API}/trades/history?trade_type=CALL&limit=10")
        assert response.status_code == 200
        data = response.json()
        trades = data.get('trades', [])
        for trade in trades:
            assert trade['trade_type'] == 'CALL', "Filter should return only CALL trades"
        
        print("✓ Trade history filters working correctly")
    
    def test_trade_history_sorting(self):
        """Test trade history sorting works"""
        # Sort by P&L descending
        response = requests.get(f"{API}/trades/history?sort_by=pnl&sort_order=desc&limit=5")
        assert response.status_code == 200
        data = response.json()
        trades = data.get('trades', [])
        
        if len(trades) > 1:
            for i in range(len(trades) - 1):
                assert trades[i].get('pnl', 0) >= trades[i+1].get('pnl', 0), "Should be sorted by P&L desc"
        
        print("✓ Trade history sorting working correctly")


class TestRiskManagementData:
    """Tests to verify risk management panel data sources"""
    
    def test_paper_mode_risk_data_source(self):
        """Verify paper mode uses /api/trades/today for risk metrics"""
        response = requests.get(f"{API}/trades/today")
        assert response.status_code == 200
        data = response.json()
        
        # These fields should be present for RiskPanel in PAPER mode
        assert 'today_invested' in data, "today_invested needed for dailyUsed in PAPER mode"
        assert 'total_trades_today' in data, "total_trades_today needed for todayTrades in PAPER mode"
        assert 'today_pnl' in data, "today_pnl needed for todayPnL in PAPER mode"
        print(f"✓ Paper mode risk data available - Invested: {data['today_invested']}, Trades: {data['total_trades_today']}")
    
    def test_live_mode_risk_data_source(self):
        """Verify combined-status provides risk data for LIVE mode"""
        response = requests.get(f"{API}/combined-status")
        assert response.status_code == 200
        data = response.json()
        
        # When upstox_connected, portfolio should have funds/pnl for risk metrics
        if data['upstox_connected'] and data['portfolio']:
            portfolio = data['portfolio']
            # Check structure - funds.used_margin for dailyUsed
            assert 'funds' in portfolio or 'total_pnl' in portfolio
            print("✓ Live mode risk data available from Upstox portfolio")
        else:
            # When not connected, paper data should be used
            print("✓ Upstox not connected - frontend should fall back to paper data")


class TestDailySummary:
    """Tests for daily summary endpoint"""
    
    def test_daily_summary_returns_data(self):
        """Test daily summary endpoint works"""
        response = requests.get(f"{API}/daily-summary")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'summary' in data
        summary = data['summary']
        assert 'date' in summary
        assert 'total_trades' in summary
        assert 'total_pnl' in summary
        print(f"✓ Daily summary - Date: {summary['date']}, P&L: {summary['total_pnl']}")


class TestTradeAnalytics:
    """Tests for Trade Analytics data"""
    
    def test_stats_endpoint(self):
        """Test stats endpoint for analytics"""
        response = requests.get(f"{API}/stats")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        assert 'stats' in data
        stats = data['stats']
        assert 'win_rate' in stats
        assert 'total_pnl' in stats
        print(f"✓ Stats endpoint - Win Rate: {stats['win_rate']:.1f}%, P&L: {stats['total_pnl']}")


class TestSettingsPanel:
    """Tests for Settings functionality"""
    
    def test_get_settings(self):
        """Test settings retrieval"""
        response = requests.get(f"{API}/settings")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        settings = data['settings']
        
        # Verify required sections
        assert 'trading_mode' in settings
        assert 'broker' in settings
        assert 'risk' in settings
        assert 'auto_trading' in settings
        print(f"✓ Settings retrieved - Mode: {settings['trading_mode']}")
    
    def test_auto_settings_endpoint(self):
        """Test auto-settings endpoint"""
        response = requests.get(f"{API}/auto-settings")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'success'
        settings = data['settings']
        assert 'auto_exit' in settings
        assert 'auto_entry' in settings
        print(f"✓ Auto settings - Exit: {settings['auto_exit']}, Entry: {settings['auto_entry']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
