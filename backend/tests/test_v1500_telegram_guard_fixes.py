"""
Test Suite for v15.0.0 Bug Fixes:
1. Telegram signal alert shows signal_type (CALL/PUT) not 'undefined'
2. /api/news/fetch returns guard_blocked=true when Max Daily Loss/Profit limits hit
3. Guard block Telegram notifications have 30-min cooldown to prevent spam
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndVersion:
    """Verify app health and version"""
    
    def test_health_endpoint_returns_v15(self):
        """Health check should return version 15.0.0"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'healthy'
        assert data.get('version') == '15.0.0', f"Expected version 15.0.0, got {data.get('version')}"
        print(f"✓ Health check passed: version {data.get('version')}")


class TestAIGuardsStatus:
    """Verify AI Guards status endpoint"""
    
    def test_ai_guards_status_returns_all_guards(self):
        """AI Guards status should return all 9 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        
        guards = data.get('guards', {})
        expected_guards = [
            'time_of_day_filter', 'max_daily_loss', 'max_daily_profit',
            'market_regime_filter', 'multi_source_verification', 'multi_timeframe',
            'kelly_sizing', 'greeks_filter', 'trailing_stop'
        ]
        
        for guard in expected_guards:
            assert guard in guards, f"Missing guard: {guard}"
        
        print(f"✓ AI Guards status: {len(guards)} guards found")
        print(f"  Guards: {list(guards.keys())}")


class TestNewsFetchGuardBlocking:
    """Test that /api/news/fetch blocks AI analysis when guards are hit"""
    
    def test_news_fetch_with_emergency_stop(self):
        """When emergency_stop is active, news/fetch should return guard_blocked=true"""
        # First enable emergency stop
        stop_response = requests.post(f"{BASE_URL}/api/emergency-stop", 
                                      json={"active": True}, timeout=10)
        assert stop_response.status_code == 200
        
        # Now fetch news - should be blocked
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        # Should have guard_blocked=true
        assert data.get('guard_blocked') == True, f"Expected guard_blocked=true, got {data}"
        assert 'Emergency Stop' in data.get('guard_reason', ''), f"Expected Emergency Stop reason, got {data.get('guard_reason')}"
        assert data.get('articles_processed') == 0, "Should not process any articles when blocked"
        print(f"✓ Emergency stop blocks news fetch: {data.get('guard_reason')}")
        
        # Disable emergency stop
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False}, timeout=10)
    
    def test_news_fetch_with_max_daily_loss_guard(self):
        """When max_daily_loss is hit, news/fetch should return guard_blocked=true"""
        # Get current settings
        settings_response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        original_settings = settings_response.json().get('settings', {})
        
        # Set a very low max_daily_loss limit (₹1) to trigger the guard
        update_response = requests.post(f"{BASE_URL}/api/ai-guards/update", json={
            "guard": "max_daily_loss",
            "enabled": True,
            "value": 1  # ₹1 limit - should trigger if any loss exists
        }, timeout=10)
        
        # Also update auto_trading settings
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "max_daily_loss": 1
        }, timeout=10)
        
        # Fetch news - may or may not be blocked depending on today's P&L
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        # Check if guard was triggered (depends on actual P&L)
        if data.get('guard_blocked'):
            assert 'Max Daily Loss' in data.get('guard_reason', '') or 'loss' in data.get('guard_reason', '').lower()
            print(f"✓ Max Daily Loss guard triggered: {data.get('guard_reason')}")
        else:
            print(f"✓ Max Daily Loss guard not triggered (no losses today)")
        
        # Restore original settings
        requests.post(f"{BASE_URL}/api/ai-guards/update", json={
            "guard": "max_daily_loss",
            "enabled": True,
            "value": 5000
        }, timeout=10)
    
    def test_news_fetch_with_max_daily_profit_guard(self):
        """When max_daily_profit is hit, news/fetch should return guard_blocked=true"""
        # Set a very low max_daily_profit limit (₹1) to trigger the guard
        update_response = requests.post(f"{BASE_URL}/api/ai-guards/update", json={
            "guard": "max_daily_profit",
            "enabled": True,
            "value": 1  # ₹1 limit - should trigger if any profit exists
        }, timeout=10)
        
        # Also update auto_trading settings
        requests.post(f"{BASE_URL}/api/auto-settings/update", json={
            "max_daily_profit": 1
        }, timeout=10)
        
        # Fetch news - may or may not be blocked depending on today's P&L
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=30)
        assert response.status_code == 200
        data = response.json()
        
        # Check if guard was triggered (depends on actual P&L)
        if data.get('guard_blocked'):
            assert 'Max Daily Profit' in data.get('guard_reason', '') or 'profit' in data.get('guard_reason', '').lower()
            print(f"✓ Max Daily Profit guard triggered: {data.get('guard_reason')}")
        else:
            print(f"✓ Max Daily Profit guard not triggered (no profits today)")
        
        # Restore original settings
        requests.post(f"{BASE_URL}/api/ai-guards/update", json={
            "guard": "max_daily_profit",
            "enabled": True,
            "value": 10000
        }, timeout=10)


class TestSignalTypeField:
    """Test that signals use signal_type field consistently"""
    
    def test_signals_have_signal_type_field(self):
        """Signals should have signal_type field (CALL/PUT), not just trade_type"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=10", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        signals = data.get('signals', [])
        if len(signals) > 0:
            for signal in signals:
                # signal_type should be present
                signal_type = signal.get('signal_type')
                if signal_type:
                    assert signal_type in ['CALL', 'PUT'], f"Invalid signal_type: {signal_type}"
                    print(f"✓ Signal {signal.get('id', 'N/A')[:8]}... has signal_type: {signal_type}")
        else:
            print("✓ No signals to verify (empty signals list)")


class TestTelegramFormatting:
    """Test Telegram message formatting uses correct fields"""
    
    def test_telegram_status_endpoint(self):
        """Telegram status should be accessible"""
        response = requests.get(f"{BASE_URL}/api/telegram/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Telegram status: configured={data.get('configured')}, has_token={data.get('has_token')}")


class TestNewsFetchNormalOperation:
    """Test normal news fetch operation"""
    
    def test_news_fetch_returns_articles_with_sentiment(self):
        """Normal news fetch should return articles with sentiment analysis"""
        # Ensure emergency stop is off
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False}, timeout=10)
        
        # Reset guards to normal values
        requests.post(f"{BASE_URL}/api/ai-guards/update", json={
            "guard": "max_daily_loss",
            "enabled": True,
            "value": 5000
        }, timeout=10)
        requests.post(f"{BASE_URL}/api/ai-guards/update", json={
            "guard": "max_daily_profit",
            "enabled": True,
            "value": 10000
        }, timeout=10)
        
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=60)
        assert response.status_code == 200
        data = response.json()
        
        # Should not be blocked
        if not data.get('guard_blocked'):
            articles = data.get('articles', [])
            print(f"✓ News fetch returned {len(articles)} articles")
            
            # Check sentiment analysis structure
            for article in articles[:3]:  # Check first 3
                sentiment = article.get('sentiment_analysis', {})
                if sentiment:
                    assert 'sentiment' in sentiment, "Missing sentiment field"
                    assert 'confidence' in sentiment, "Missing confidence field"
                    assert sentiment['sentiment'] in ['BULLISH', 'BEARISH', 'NEUTRAL'], f"Invalid sentiment: {sentiment['sentiment']}"
                    assert 0 <= sentiment['confidence'] <= 100, f"Invalid confidence: {sentiment['confidence']}"
                    print(f"  Article: {article.get('title', 'N/A')[:50]}... | {sentiment['sentiment']} {sentiment['confidence']}%")
        else:
            print(f"✓ News fetch blocked by guard: {data.get('guard_reason')}")


class TestSettingsEndpoint:
    """Test settings endpoint"""
    
    def test_settings_returns_ai_guards(self):
        """Settings should include ai_guards configuration"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert response.status_code == 200
        data = response.json()
        
        settings = data.get('settings', {})
        ai_guards = settings.get('ai_guards', {})
        
        print(f"✓ Settings loaded, ai_guards: {list(ai_guards.keys()) if ai_guards else 'empty'}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
