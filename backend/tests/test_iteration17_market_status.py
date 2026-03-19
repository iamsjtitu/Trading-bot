"""
Iteration 17 - Market Status Feature Tests

Tests for:
1. GET /api/market-status - market open/close status with next_open time
2. GET /api/market-holidays - upcoming NSE holidays
3. Version bump to 1.8.0 in /api/ root endpoint
4. Regression tests for existing endpoints
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://market-sentinel-68.preview.emergentagent.com').rstrip('/')

# ==================== New Market Status Feature Tests ====================

class TestMarketStatusEndpoint:
    """Test GET /api/market-status - Indian stock market open/close status"""
    
    def test_market_status_returns_success(self):
        """Verify market-status endpoint returns successful response"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
    
    def test_market_status_has_required_fields(self):
        """Verify market-status returns all required fields"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        assert response.status_code == 200
        
        data = response.json()
        
        # Required fields for any market status
        assert 'is_open' in data, "Missing field: is_open"
        assert 'reason' in data, "Missing field: reason"
        assert 'message' in data, "Missing field: message"
        assert 'holiday_name' in data, "Missing field: holiday_name"
        
        # Validate is_open is boolean
        assert isinstance(data['is_open'], bool), "is_open should be boolean"
        
        # Validate reason is valid
        valid_reasons = ['weekend', 'holiday', 'pre_open', 'before_hours', 'after_hours', 'trading_hours']
        assert data['reason'] in valid_reasons, f"Invalid reason: {data['reason']}"
        
        # Message should be a non-empty string
        assert isinstance(data['message'], str) and len(data['message']) > 0
    
    def test_market_status_open_fields(self):
        """When market is OPEN, verify closes_at and time_remaining fields"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        data = response.json()
        
        if data['is_open']:
            # Market is open - should have closes_at and time_remaining
            assert 'closes_at' in data, "When open, should have closes_at field"
            assert 'time_remaining' in data, "When open, should have time_remaining field"
            assert data['message'] == 'Market Open'
        print(f"Market status: is_open={data['is_open']}, reason={data['reason']}, message={data['message']}")
    
    def test_market_status_closed_fields(self):
        """When market is CLOSED, verify next_open and next_open_label fields"""
        response = requests.get(f"{BASE_URL}/api/market-status")
        data = response.json()
        
        if not data['is_open']:
            # Market is closed - should have next_open info
            assert 'next_open' in data, "When closed, should have next_open field"
            assert 'next_open_label' in data, "When closed, should have next_open_label field"
            
            # next_open should be ISO format datetime
            if data['next_open']:
                try:
                    datetime.fromisoformat(data['next_open'].replace('Z', '+00:00'))
                except ValueError:
                    pytest.fail(f"next_open is not valid ISO datetime: {data['next_open']}")
            
            # next_open_label should be human-readable
            assert isinstance(data['next_open_label'], str)
            print(f"Market closed. Next open: {data['next_open_label']}")


class TestMarketHolidaysEndpoint:
    """Test GET /api/market-holidays - upcoming NSE holidays"""
    
    def test_market_holidays_returns_success(self):
        """Verify market-holidays endpoint returns successful response"""
        response = requests.get(f"{BASE_URL}/api/market-holidays")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
    
    def test_market_holidays_returns_list(self):
        """Verify market-holidays returns a list of holidays"""
        response = requests.get(f"{BASE_URL}/api/market-holidays")
        data = response.json()
        
        assert 'holidays' in data, "Missing field: holidays"
        assert isinstance(data['holidays'], list), "holidays should be a list"
    
    def test_market_holidays_structure(self):
        """Verify each holiday has required fields: date, day, name"""
        response = requests.get(f"{BASE_URL}/api/market-holidays")
        data = response.json()
        
        holidays = data['holidays']
        
        # Should have at least 1 upcoming holiday (2025-2026 list)
        assert len(holidays) >= 1, "Should have at least 1 upcoming holiday"
        
        for holiday in holidays:
            assert 'date' in holiday, f"Holiday missing date field: {holiday}"
            assert 'day' in holiday, f"Holiday missing day field: {holiday}"
            assert 'name' in holiday, f"Holiday missing name field: {holiday}"
            
            # Validate date format (YYYY-MM-DD)
            try:
                datetime.strptime(holiday['date'], '%Y-%m-%d')
            except ValueError:
                pytest.fail(f"Invalid date format: {holiday['date']}")
            
            # Day should be a weekday name
            valid_days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
            assert holiday['day'] in valid_days, f"Invalid day: {holiday['day']}"
        
        print(f"Found {len(holidays)} upcoming holidays. Next: {holidays[0] if holidays else 'None'}")
    
    def test_market_holidays_count_parameter(self):
        """Verify count parameter limits results"""
        response = requests.get(f"{BASE_URL}/api/market-holidays?count=3")
        data = response.json()
        
        holidays = data['holidays']
        assert len(holidays) <= 3, f"Expected max 3 holidays, got {len(holidays)}"


class TestVersionBump:
    """Test version bump to 1.8.0 in /api/ root endpoint"""
    
    def test_root_endpoint_version(self):
        """Verify /api/ returns app_version 1.8.0"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        
        data = response.json()
        assert 'app_version' in data, "Missing app_version field in /api/ response"
        assert data['app_version'] == '1.8.0', f"Expected version 1.8.0, got {data['app_version']}"
        
        # Also check message and status
        assert 'message' in data
        assert 'status' in data
        assert data['status'] == 'active'
        print(f"API version: {data['app_version']}")


# ==================== Regression Tests ====================

class TestRegressionHealth:
    """Regression test for health endpoint"""
    
    def test_health_returns_healthy(self):
        """Verify health endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'services' in data


class TestRegressionSettings:
    """Regression test for settings endpoint"""
    
    def test_settings_returns_data(self):
        """Verify settings endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'settings' in data


class TestRegressionPortfolio:
    """Regression test for portfolio endpoint"""
    
    def test_portfolio_returns_data(self):
        """Verify portfolio endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        
        data = response.json()
        # Portfolio returns data directly, no 'status' wrapper
        assert 'initial_capital' in data or 'current_value' in data


class TestRegressionInstruments:
    """Regression test for instruments endpoint"""
    
    def test_instruments_returns_data(self):
        """Verify instruments endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/instruments")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'instruments' in data
        assert len(data['instruments']) >= 6


class TestRegressionOptionChain:
    """Regression test for option chain endpoint"""
    
    def test_option_chain_nifty_works(self):
        """Verify option chain for NIFTY still works"""
        response = requests.get(f"{BASE_URL}/api/option-chain/NIFTY")
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'chain' in data
        assert 'spot_price' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
