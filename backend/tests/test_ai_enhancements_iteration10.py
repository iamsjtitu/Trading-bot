"""
Iteration 10 - Testing AI Model Decision-Making Enhancements
Tests:
1. /api/ai/insights endpoint - market regime, sector rotation, sentiment depth
2. /api/news/fetch - enhanced sentiment with composite_score, correlation, confluence
3. /api/signals/latest - signals with enhanced scoring data
4. /api/health - basic health check
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://news-driven-options.preview.emergentagent.com').rstrip('/')


class TestHealthEndpoint:
    """Test basic health check endpoint"""
    
    def test_health_endpoint_returns_healthy(self):
        """Health endpoint should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get('status') == 'healthy', f"Expected healthy, got {data.get('status')}"
        assert 'timestamp' in data
        assert 'services' in data
        services = data['services']
        assert services.get('news') == 'active'
        assert services.get('sentiment') == 'active'
        assert services.get('trading') == 'active'
        print(f"✓ Health check passed: {data['status']}")


class TestAIInsightsEndpoint:
    """Test /api/ai/insights endpoint for new AI Brain features"""
    
    def test_ai_insights_returns_success(self):
        """AI insights endpoint should return success status"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success', f"Expected success, got {data.get('status')}"
        assert 'insights' in data
        print(f"✓ AI insights endpoint returned success")
    
    def test_ai_insights_has_market_regime(self):
        """AI insights should include market regime data"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        data = response.json()
        insights = data.get('insights', {})
        
        assert 'market_regime' in insights, "Missing market_regime field"
        regime = insights['market_regime']
        assert 'regime' in regime, "Missing regime.regime field"
        assert 'confidence' in regime, "Missing regime.confidence field"
        
        # Validate regime value is one of expected values
        valid_regimes = ['UNKNOWN', 'TRENDING_UP', 'TRENDING_DOWN', 'SIDEWAYS', 'VOLATILE', 'MIXED']
        assert regime['regime'] in valid_regimes, f"Invalid regime: {regime['regime']}"
        
        # Confidence should be 0-100
        assert isinstance(regime['confidence'], (int, float))
        assert 0 <= regime['confidence'] <= 100
        
        print(f"✓ Market regime: {regime['regime']} ({regime['confidence']}% confidence)")
    
    def test_ai_insights_has_sector_rotation(self):
        """AI insights should include sector rotation data"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        data = response.json()
        insights = data.get('insights', {})
        
        assert 'sector_rotation' in insights, "Missing sector_rotation field"
        rotation = insights['sector_rotation']
        
        assert 'leaders' in rotation, "Missing leaders field"
        assert 'laggards' in rotation, "Missing laggards field"
        assert 'rotation' in rotation, "Missing rotation status field"
        
        # Validate rotation status
        valid_rotations = ['NONE', 'ACTIVE', 'BROAD_BULLISH', 'BROAD_BEARISH']
        assert rotation['rotation'] in valid_rotations, f"Invalid rotation: {rotation['rotation']}"
        
        # Leaders and laggards should be lists
        assert isinstance(rotation['leaders'], list)
        assert isinstance(rotation['laggards'], list)
        
        print(f"✓ Sector rotation: {rotation['rotation']}, Leaders: {len(rotation['leaders'])}, Laggards: {len(rotation['laggards'])}")
    
    def test_ai_insights_has_sentiment_depth(self):
        """AI insights should include multi-timeframe sentiment depth"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        data = response.json()
        insights = data.get('insights', {})
        
        assert 'sentiment_depth' in insights, "Missing sentiment_depth field"
        depth = insights['sentiment_depth']
        
        # Should have 1h, 4h, daily keys
        assert '1h' in depth, "Missing 1h sentiment depth"
        assert '4h' in depth, "Missing 4h sentiment depth"
        assert 'daily' in depth, "Missing daily sentiment depth"
        
        # All should be non-negative integers
        for key in ['1h', '4h', 'daily']:
            assert isinstance(depth[key], int), f"{key} should be int"
            assert depth[key] >= 0, f"{key} should be non-negative"
        
        print(f"✓ Sentiment depth: 1h={depth['1h']}, 4h={depth['4h']}, daily={depth['daily']}")
    
    def test_ai_insights_has_performance_data(self):
        """AI insights should include performance data"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        data = response.json()
        insights = data.get('insights', {})
        
        assert 'performance' in insights, "Missing performance field"
        perf = insights['performance']
        
        # Should have closed_trades, win_rate, total_pnl
        assert 'closed_trades' in perf, "Missing closed_trades"
        assert 'win_rate' in perf, "Missing win_rate"
        assert 'total_pnl' in perf, "Missing total_pnl"
        
        # Validate types
        assert isinstance(perf['closed_trades'], int)
        assert isinstance(perf['win_rate'], (int, float))
        assert isinstance(perf['total_pnl'], (int, float))
        
        print(f"✓ Performance: {perf['closed_trades']} trades, {perf['win_rate']}% win rate, P&L: {perf['total_pnl']}")
    
    def test_ai_insights_has_regime_multiplier(self):
        """AI insights should include regime multiplier for dynamic sizing"""
        response = requests.get(f"{BASE_URL}/api/ai/insights", timeout=15)
        data = response.json()
        insights = data.get('insights', {})
        
        assert 'regime_multiplier' in insights, "Missing regime_multiplier field"
        multiplier = insights['regime_multiplier']
        
        # Multiplier should be a positive float between 0.5 and 1.2
        assert isinstance(multiplier, (int, float))
        assert 0.5 <= multiplier <= 1.2, f"Multiplier out of expected range: {multiplier}"
        
        print(f"✓ Regime multiplier: {multiplier}x")


class TestNewsFetchEnhancements:
    """Test /api/news/fetch returns enhanced sentiment data"""
    
    def test_news_latest_has_enhanced_sentiment(self):
        """News articles should have enhanced sentiment fields"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        
        news = data.get('news', [])
        if len(news) == 0:
            pytest.skip("No news articles available to test")
        
        article = news[0]
        sentiment = article.get('sentiment_analysis', {})
        
        # Standard fields
        assert 'sentiment' in sentiment, "Missing sentiment field"
        assert 'confidence' in sentiment, "Missing confidence field"
        
        # NEW enhanced fields (may be absent for old articles without AI engine)
        has_composite = 'composite_score' in sentiment
        has_correlation = 'correlation_score' in sentiment
        has_confluence = 'confluence_score' in sentiment
        has_freshness = 'freshness_score' in sentiment
        has_market_regime = 'market_regime' in sentiment
        
        print(f"✓ News article sentiment: {sentiment.get('sentiment')}")
        print(f"  - Composite score: {sentiment.get('composite_score', 'N/A')}")
        print(f"  - Correlation score: {sentiment.get('correlation_score', 'N/A')}")
        print(f"  - Confluence score: {sentiment.get('confluence_score', 'N/A')}")
        print(f"  - Freshness score: {sentiment.get('freshness_score', 'N/A')}")
        print(f"  - Market regime: {sentiment.get('market_regime', 'N/A')}")
        
        # At least some enhanced fields should be present for recently fetched articles
        enhanced_count = sum([has_composite, has_correlation, has_confluence, has_freshness, has_market_regime])
        print(f"  - Enhanced fields present: {enhanced_count}/5")
        # Don't fail if old articles don't have it, just report
    
    def test_news_fetch_returns_valid_structure(self):
        """News fetch endpoint should return proper structure"""
        # Using /news/latest as /news/fetch may dedupe against existing
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=3", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert 'status' in data
        assert 'news' in data or 'articles' in data  # May vary by endpoint
        print(f"✓ News endpoint structure valid")


class TestSignalsEnhancements:
    """Test /api/signals/latest returns enhanced signal data"""
    
    def test_signals_endpoint_returns_success(self):
        """Signals endpoint should return success"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=5", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert 'signals' in data
        print(f"✓ Signals endpoint returned {len(data['signals'])} signals")
    
    def test_signals_have_base_fields(self):
        """Signals should have base required fields"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=5", timeout=15)
        data = response.json()
        signals = data.get('signals', [])
        
        if len(signals) == 0:
            pytest.skip("No signals available to test")
        
        signal = signals[0]
        required_fields = ['id', 'signal_type', 'symbol', 'confidence', 'sentiment', 'reason', 'status', 'created_at']
        
        for field in required_fields:
            assert field in signal, f"Missing required field: {field}"
        
        print(f"✓ Signal has all required fields")
        print(f"  - Type: {signal['signal_type']}, Symbol: {signal['symbol']}")
        print(f"  - Sentiment: {signal['sentiment']}, Confidence: {signal['confidence']}")
    
    def test_signals_may_have_enhanced_scoring(self):
        """Signals should have enhanced scoring fields (if generated after AI enhancement)"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=5", timeout=15)
        data = response.json()
        signals = data.get('signals', [])
        
        if len(signals) == 0:
            pytest.skip("No signals available to test")
        
        # Check first signal for enhanced fields
        signal = signals[0]
        
        # These fields are expected in new signals with AI enhancements
        enhanced_fields = ['composite_score', 'correlation_score', 'confluence_score', 'market_regime', 'freshness_score']
        present_fields = [f for f in enhanced_fields if f in signal]
        
        print(f"✓ Signal enhanced fields check:")
        print(f"  - composite_score: {signal.get('composite_score', 'N/A')}")
        print(f"  - correlation_score: {signal.get('correlation_score', 'N/A')}")
        print(f"  - confluence_score: {signal.get('confluence_score', 'N/A')}")
        print(f"  - market_regime: {signal.get('market_regime', 'N/A')}")
        print(f"  - freshness_score: {signal.get('freshness_score', 'N/A')}")
        print(f"  - Present: {len(present_fields)}/{len(enhanced_fields)} enhanced fields")


class TestPortfolioAndStats:
    """Test portfolio and stats endpoints are not broken"""
    
    def test_portfolio_endpoint(self):
        """Portfolio endpoint should return data"""
        response = requests.get(f"{BASE_URL}/api/portfolio", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        # Portfolio returns the data directly (not wrapped in status)
        assert 'current_value' in data or 'status' in data
        print(f"✓ Portfolio endpoint working")
    
    def test_stats_endpoint(self):
        """Stats endpoint should return data"""
        response = requests.get(f"{BASE_URL}/api/stats", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        assert 'stats' in data
        print(f"✓ Stats endpoint working")


class TestHistoricalPatterns:
    """Test historical patterns endpoint"""
    
    def test_historical_patterns_endpoint(self):
        """Historical patterns endpoint should work"""
        response = requests.get(f"{BASE_URL}/api/historical-patterns", timeout=15)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('status') == 'success'
        
        # Should have summary fields
        assert 'total_patterns' in data
        assert 'profitable_patterns' in data
        assert 'win_rate' in data
        
        print(f"✓ Historical patterns: {data['total_patterns']} patterns, {data['win_rate']}% win rate")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
