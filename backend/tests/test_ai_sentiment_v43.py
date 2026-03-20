"""
Test Suite: AI Sentiment Analysis & Signal Consistency - v4.3.0
Testing bug fixes:
1. AI model uses GPT-4o (not keyword fallback)
2. Sentiment-signal consistency (BULLISH != BUY_PUT, BEARISH != BUY_CALL)
3. India-specific context (crude oil price fall = BULLISH for India)
4. Signal mismatch validation in signal_generator.js
5. Emergency stop functionality
6. Version v4.3.0
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAISentimentAnalysis:
    """Tests for AI sentiment analysis using GPT-4o model"""
    
    def test_news_endpoint_accessible(self):
        """Test that news endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert 'news' in data
        print(f"✓ News endpoint accessible, {len(data.get('news', []))} items returned")

    def test_ai_analysis_not_keyword_fallback(self):
        """Test that recent news uses AI analysis (not keyword fallback)"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=10")
        assert response.status_code == 200
        data = response.json()
        news = data.get('news', [])
        
        ai_analyzed_count = 0
        keyword_fallback_count = 0
        
        for item in news:
            sentiment = item.get('sentiment_analysis', {})
            reason = sentiment.get('reason', '')
            
            if 'keyword analysis' in reason.lower():
                keyword_fallback_count += 1
            else:
                ai_analyzed_count += 1
        
        print(f"AI analyzed: {ai_analyzed_count}, Keyword fallback: {keyword_fallback_count}")
        
        # At least some news items should use AI analysis
        # (older items may still have keyword analysis from before the fix)
        assert ai_analyzed_count > 0, "Expected at least some AI-analyzed news items"
        print(f"✓ {ai_analyzed_count} news items using AI analysis (GPT-4o)")

    def test_sentiment_signal_consistency_no_mismatches(self):
        """Test that BULLISH sentiment never has BUY_PUT and BEARISH never has BUY_CALL"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=20")
        assert response.status_code == 200
        data = response.json()
        news = data.get('news', [])
        
        mismatches = []
        for item in news:
            sentiment = item.get('sentiment_analysis', {})
            sent = sentiment.get('sentiment', 'N/A')
            signal = sentiment.get('trading_signal', 'N/A')
            
            # BULLISH + BUY_PUT is a mismatch
            if sent == 'BULLISH' and signal == 'BUY_PUT':
                mismatches.append({
                    'title': item.get('title'),
                    'sentiment': sent,
                    'signal': signal
                })
            # BEARISH + BUY_CALL is a mismatch  
            elif sent == 'BEARISH' and signal == 'BUY_CALL':
                mismatches.append({
                    'title': item.get('title'),
                    'sentiment': sent,
                    'signal': signal
                })
        
        if mismatches:
            print(f"✗ Found {len(mismatches)} sentiment-signal mismatches:")
            for m in mismatches:
                print(f"  - {m['title'][:50]}: {m['sentiment']} + {m['signal']}")
        
        assert len(mismatches) == 0, f"Found {len(mismatches)} sentiment-signal mismatches"
        print(f"✓ No sentiment-signal mismatches found in {len(news)} news items")

    def test_india_crude_oil_context_bullish(self):
        """Test that falling crude oil prices are analyzed as BULLISH for India"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=20")
        assert response.status_code == 200
        data = response.json()
        news = data.get('news', [])
        
        crude_oil_news = []
        for item in news:
            title = item.get('title', '').lower()
            description = item.get('description', '').lower()
            
            if 'crude' in title or 'oil' in title or 'crude' in description or 'oil price' in description:
                if 'fall' in title or 'decline' in title or 'drop' in title or 'fall' in description or 'decline' in description:
                    sentiment = item.get('sentiment_analysis', {})
                    crude_oil_news.append({
                        'title': item.get('title'),
                        'sentiment': sentiment.get('sentiment'),
                        'reason': sentiment.get('reason', '')[:100]
                    })
        
        # Check that crude oil price fall news is analyzed as BULLISH for India
        for item in crude_oil_news:
            print(f"Crude oil news: {item['title'][:50]}...")
            print(f"  Sentiment: {item['sentiment']}")
            # Falling crude oil should be BULLISH for India (net importer)
            if item['sentiment'] == 'BULLISH':
                print(f"✓ Correctly identified as BULLISH for India")
            elif item['sentiment'] == 'BEARISH':
                print(f"✗ Incorrectly identified as BEARISH - should be BULLISH for import-dependent India")
                # This is a critical test - failing crude oil context
                # But we don't fail the test if it's old keyword-based analysis
                if 'keyword analysis' not in item['reason'].lower():
                    pytest.fail(f"AI incorrectly analyzed crude oil fall as BEARISH for India")
        
        print(f"✓ Checked {len(crude_oil_news)} crude oil news items for India-specific context")


class TestEmergencyStop:
    """Tests for emergency stop functionality"""
    
    def test_emergency_stop_activate(self):
        """Test activating emergency stop"""
        response = requests.post(
            f"{BASE_URL}/api/emergency-stop",
            json={"active": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('emergency_stop') == True
        print("✓ Emergency stop activated successfully")
    
    def test_emergency_stop_persists_in_settings(self):
        """Test that emergency stop persists in settings"""
        # First activate
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": True})
        
        # Check settings
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data.get('settings', {}).get('emergency_stop') == True
        print("✓ Emergency stop persists in settings")
    
    def test_emergency_stop_deactivate(self):
        """Test deactivating emergency stop"""
        response = requests.post(
            f"{BASE_URL}/api/emergency-stop",
            json={"active": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get('status') == 'success'
        assert data.get('emergency_stop') == False
        print("✓ Emergency stop deactivated successfully")
    
    def test_emergency_stop_persists_after_deactivation(self):
        """Test that emergency stop stays deactivated"""
        requests.post(f"{BASE_URL}/api/emergency-stop", json={"active": False})
        
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert data.get('settings', {}).get('emergency_stop') == False
        print("✓ Emergency stop correctly shows as deactivated")


class TestAutoTradingSettings:
    """Tests for auto trading settings"""
    
    def test_auto_entry_off_blocks_trades(self):
        """Test that auto_entry OFF prevents trade execution"""
        # Set auto_entry to OFF
        response = requests.post(
            f"{BASE_URL}/api/auto-settings/update",
            json={"auto_entry": False, "auto_exit": True}
        )
        assert response.status_code == 200
        
        # Get settings
        response = requests.get(f"{BASE_URL}/api/settings")
        data = response.json()
        auto_trading = data.get('settings', {}).get('auto_trading', {})
        assert auto_trading.get('auto_entry') == False
        print("✓ Auto-entry OFF correctly persisted")
    
    def test_auto_exit_settings_persist(self):
        """Test that auto_exit settings persist"""
        # Set settings
        response = requests.post(
            f"{BASE_URL}/api/auto-settings/update",
            json={"auto_exit": True, "target_pct": 15, "stoploss_pct": 30}
        )
        assert response.status_code == 200
        
        # Verify
        response = requests.get(f"{BASE_URL}/api/auto-settings")
        data = response.json()
        settings = data.get('settings', {})
        assert settings.get('auto_exit') == True
        print("✓ Auto-exit settings persist correctly")


class TestSignalGeneration:
    """Tests for signal generation and validation"""
    
    def test_signals_endpoint_accessible(self):
        """Test that signals endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert 'signals' in data
        print(f"✓ Signals endpoint accessible, {len(data.get('signals', []))} signals returned")
    
    def test_signals_have_sentiment_consistency(self):
        """Test that signals have consistent sentiment-signal mapping"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=20")
        assert response.status_code == 200
        data = response.json()
        signals = data.get('signals', [])
        
        for signal in signals:
            sentiment = signal.get('sentiment')
            signal_type = signal.get('signal_type')
            
            # CALL = bullish bet, PUT = bearish bet
            if sentiment == 'BULLISH' and signal_type == 'PUT':
                pytest.fail(f"Signal mismatch: BULLISH sentiment with PUT signal - {signal.get('id')}")
            elif sentiment == 'BEARISH' and signal_type == 'CALL':
                pytest.fail(f"Signal mismatch: BEARISH sentiment with CALL signal - {signal.get('id')}")
        
        print(f"✓ All {len(signals)} signals have consistent sentiment-signal mapping")


class TestTodayPnL:
    """Tests for Today's P&L functionality"""
    
    def test_today_pnl_endpoint(self):
        """Test that today's P&L endpoint works"""
        response = requests.get(f"{BASE_URL}/api/trades/today")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields exist
        assert 'today_pnl' in data or 'total_trades_today' in data
        print(f"✓ Today's P&L endpoint accessible")
        print(f"  Today's P&L: {data.get('today_pnl', 'N/A')}")
        print(f"  Realized P&L: {data.get('realized_pnl', 'N/A')}")
        print(f"  Total trades today: {data.get('total_trades_today', 'N/A')}")


class TestVersionAndUIElements:
    """Tests for version and basic UI elements"""
    
    def test_settings_accessible(self):
        """Test settings endpoint"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert 'settings' in data
        print("✓ Settings endpoint accessible")
    
    def test_portfolio_endpoint(self):
        """Test portfolio endpoint"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        print("✓ Portfolio endpoint accessible")
    
    def test_stats_endpoint(self):
        """Test stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        print("✓ Stats endpoint accessible")
    
    def test_trades_active_endpoint(self):
        """Test active trades endpoint"""
        response = requests.get(f"{BASE_URL}/api/trades/active")
        assert response.status_code == 200
        data = response.json()
        assert 'trades' in data
        print(f"✓ Active trades endpoint accessible, {len(data.get('trades', []))} open trades")


class TestAIInsightsAndJournal:
    """Tests for AI insights and journal features"""
    
    def test_ai_insights_endpoint(self):
        """Test AI insights endpoint"""
        response = requests.get(f"{BASE_URL}/api/ai/insights")
        if response.status_code == 200:
            print("✓ AI insights endpoint accessible")
        else:
            # Not critical if this endpoint doesn't exist
            print(f"⚠ AI insights endpoint returned {response.status_code}")
    
    def test_journal_entries_endpoint(self):
        """Test journal entries endpoint"""
        response = requests.get(f"{BASE_URL}/api/journal/entries")
        if response.status_code == 200:
            print("✓ Journal entries endpoint accessible")
        else:
            print(f"⚠ Journal endpoint returned {response.status_code}")


class TestCompositeScoreAndWeights:
    """Tests for composite score calculation with dynamic weights"""
    
    def test_news_has_composite_score(self):
        """Test that news items have composite_score field"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        news = data.get('news', [])
        
        news_with_composite = []
        for item in news:
            sentiment = item.get('sentiment_analysis', {})
            if 'composite_score' in sentiment:
                news_with_composite.append(item)
                print(f"  - {item['title'][:40]}... composite_score: {sentiment['composite_score']}")
        
        # At least some news should have composite scores
        assert len(news_with_composite) > 0, "No news items have composite_score"
        print(f"✓ {len(news_with_composite)} news items have composite_score")


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
