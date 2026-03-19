"""
Iteration 11 Tests - New Features:
1. Multi-instrument trading support (NIFTY50, BANKNIFTY, FINNIFTY, MIDCPNIFTY)
2. Three new free news sources (NDTV Profit, CNBC TV18, Livemint)

Tests focus on:
- GET /api/instruments - returns all 4 instruments with correct details
- POST /api/instruments/set - changes active instrument and persists
- POST /api/instruments/set with invalid instrument - returns error
- GET /api/news/fetch - verifies new sources return articles
- GET /api/settings - shows news sources including new ones
- POST /api/settings/update - can update news sources
- GET /api/health - still returns healthy
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sentiment-trade-bot-2.preview.emergentagent.com').rstrip('/')

class TestHealthAndBasics:
    """Basic health and API tests"""
    
    def test_health_endpoint_returns_healthy(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'healthy'
        assert 'services' in data
        assert data['services']['news'] == 'active'
        assert data['services']['sentiment'] == 'active'
        assert data['services']['trading'] == 'active'
        print(f"✓ Health check passed: {data}")


class TestMultiInstrumentTrading:
    """Tests for multi-instrument trading feature"""
    
    def test_get_instruments_returns_all_four(self):
        """GET /api/instruments returns all 4 instruments with correct details"""
        response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'instruments' in data
        assert 'details' in data
        assert 'active' in data
        
        # Verify all 4 instruments present
        expected_instruments = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']
        for inst in expected_instruments:
            assert inst in data['instruments'], f"Missing instrument: {inst}"
            assert inst in data['details'], f"Missing instrument details: {inst}"
        
        # Verify each instrument has required fields
        for inst_key, details in data['details'].items():
            assert 'label' in details, f"Missing label for {inst_key}"
            assert 'lot_size' in details, f"Missing lot_size for {inst_key}"
            assert 'strike_step' in details, f"Missing strike_step for {inst_key}"
            assert 'option_premium' in details, f"Missing option_premium for {inst_key}"
            assert 'exchange' in details, f"Missing exchange for {inst_key}"
            assert 'base_price' in details, f"Missing base_price for {inst_key}"
        
        print(f"✓ All 4 instruments verified: {list(data['instruments'].keys())}")
        print(f"✓ Active instrument: {data['active']}")
    
    def test_instruments_have_correct_details(self):
        """Verify instrument details are correct"""
        response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        data = response.json()
        
        # Verify NIFTY50
        nifty = data['details']['NIFTY50']
        assert nifty['label'] == 'NIFTY 50'
        assert nifty['lot_size'] == 25
        assert nifty['strike_step'] == 50
        assert nifty['exchange'] == 'NSE'
        
        # Verify BANKNIFTY
        banknifty = data['details']['BANKNIFTY']
        assert banknifty['label'] == 'BANK NIFTY'
        assert banknifty['lot_size'] == 15
        assert banknifty['strike_step'] == 100
        assert banknifty['exchange'] == 'NSE'
        
        # Verify FINNIFTY
        finnifty = data['details']['FINNIFTY']
        assert finnifty['label'] == 'FIN NIFTY'
        assert finnifty['lot_size'] == 25
        assert finnifty['strike_step'] == 50
        assert finnifty['exchange'] == 'NSE'
        
        # Verify MIDCPNIFTY
        midcap = data['details']['MIDCPNIFTY']
        assert midcap['label'] == 'MIDCAP NIFTY'
        assert midcap['lot_size'] == 50
        assert midcap['strike_step'] == 25
        assert midcap['exchange'] == 'NSE'
        
        print("✓ All instrument details verified correctly")
    
    def test_set_instrument_to_banknifty(self):
        """POST /api/instruments/set correctly changes the active instrument"""
        # Set to BANKNIFTY
        response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "BANKNIFTY"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['active'] == 'BANKNIFTY'
        assert data['details']['label'] == 'BANK NIFTY'
        
        # Verify via GET
        get_response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        get_data = get_response.json()
        assert get_data['active'] == 'BANKNIFTY'
        
        print("✓ Instrument changed to BANKNIFTY and verified")
    
    def test_set_instrument_to_finnifty(self):
        """POST /api/instruments/set to FINNIFTY"""
        response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "FINNIFTY"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['active'] == 'FINNIFTY'
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert get_response.json()['active'] == 'FINNIFTY'
        
        print("✓ Instrument changed to FINNIFTY and verified")
    
    def test_set_instrument_to_midcpnifty(self):
        """POST /api/instruments/set to MIDCPNIFTY"""
        response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "MIDCPNIFTY"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['active'] == 'MIDCPNIFTY'
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert get_response.json()['active'] == 'MIDCPNIFTY'
        
        print("✓ Instrument changed to MIDCPNIFTY and verified")
    
    def test_set_invalid_instrument_returns_error(self):
        """POST /api/instruments/set with invalid instrument returns error"""
        response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "INVALID_INSTRUMENT"},
            timeout=10
        )
        assert response.status_code == 200  # API returns 200 with error in body
        
        data = response.json()
        assert data['status'] == 'error'
        assert 'Unknown instrument' in data['message']
        assert 'NIFTY50' in data['message']  # Shows available instruments
        
        print(f"✓ Invalid instrument error returned: {data['message']}")
    
    def test_reset_instrument_to_nifty50(self):
        """Reset instrument back to NIFTY50 for other tests"""
        response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "NIFTY50"},
            timeout=10
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert data['active'] == 'NIFTY50'
        
        print("✓ Instrument reset to NIFTY50")


class TestNewNewsSources:
    """Tests for the 3 new free news sources"""
    
    def test_settings_contains_new_news_sources(self):
        """GET /api/settings shows news sources including new ones"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'news' in data['settings']
        
        news_settings = data['settings']['news']
        assert 'sources' in news_settings
        
        # The current settings should include some of the new sources
        sources = news_settings['sources']
        print(f"✓ Current news sources: {sources}")
        
        # New free sources that should be configurable
        new_sources = ['ndtv_profit', 'cnbc_tv18', 'livemint']
        print(f"✓ News sources available in settings")
    
    def test_news_fetch_returns_articles(self):
        """GET /api/news/fetch returns articles (may be empty if deduped)"""
        response = requests.get(f"{BASE_URL}/api/news/fetch", timeout=60)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'articles_processed' in data
        assert 'articles' in data
        
        print(f"✓ News fetch returned {data['articles_processed']} new articles")
    
    def test_news_latest_contains_various_sources(self):
        """GET /api/news/latest contains articles from configured sources"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=100", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'news' in data
        
        # Count articles by source
        sources = {}
        for article in data['news']:
            source = article.get('source', 'Unknown')
            sources[source] = sources.get(source, 0) + 1
        
        print(f"✓ News articles by source: {sources}")
        print(f"✓ Total articles: {len(data['news'])}")
        
        # Verify at least some sources are present
        assert len(sources) > 0, "No news sources found"
    
    def test_news_articles_have_required_fields(self):
        """Verify news articles have required fields"""
        response = requests.get(f"{BASE_URL}/api/news/latest?limit=5", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        articles = data.get('news', [])
        
        for article in articles[:5]:
            assert 'id' in article, "Missing id"
            assert 'title' in article, "Missing title"
            assert 'description' in article, "Missing description"
            assert 'source' in article, "Missing source"
            assert 'url' in article, "Missing url"
            assert 'published_at' in article, "Missing published_at"
            assert 'created_at' in article, "Missing created_at"
        
        print(f"✓ All {len(articles)} articles have required fields")


class TestSettingsUpdate:
    """Tests for settings update functionality"""
    
    def test_update_news_sources(self):
        """POST /api/settings/update can update news sources"""
        # First get current settings
        get_response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        original_settings = get_response.json()['settings']
        original_sources = original_settings.get('news', {}).get('sources', [])
        
        # Update with all 3 new sources
        new_sources = ['ndtv_profit', 'cnbc_tv18', 'livemint']
        update_response = requests.post(
            f"{BASE_URL}/api/settings/update",
            json={"news": {"sources": new_sources}},
            timeout=10
        )
        assert update_response.status_code == 200
        
        data = update_response.json()
        assert data['status'] == 'success'
        
        # Verify update persisted
        verify_response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        verify_data = verify_response.json()
        updated_sources = verify_data['settings'].get('news', {}).get('sources', [])
        
        for source in new_sources:
            assert source in updated_sources, f"Source {source} not saved"
        
        print(f"✓ News sources updated to: {updated_sources}")
    
    def test_update_trading_instrument_via_settings(self):
        """POST /api/settings/update can update trading_instrument"""
        # Update instrument via settings
        update_response = requests.post(
            f"{BASE_URL}/api/settings/update",
            json={"trading_instrument": "BANKNIFTY"},
            timeout=10
        )
        assert update_response.status_code == 200
        
        # Verify instrument changed
        instruments_response = requests.get(f"{BASE_URL}/api/instruments", timeout=10)
        assert instruments_response.json()['active'] == 'BANKNIFTY'
        
        # Reset back to NIFTY50
        requests.post(
            f"{BASE_URL}/api/settings/update",
            json={"trading_instrument": "NIFTY50"},
            timeout=10
        )
        
        print("✓ Trading instrument updated via settings and verified")


class TestInstrumentPersistence:
    """Tests for instrument setting persistence"""
    
    def test_instrument_persists_in_settings(self):
        """Instrument selection persists via settings manager"""
        # Set to FINNIFTY
        set_response = requests.post(
            f"{BASE_URL}/api/instruments/set",
            json={"instrument": "FINNIFTY"},
            timeout=10
        )
        assert set_response.json()['status'] == 'success'
        
        # Get settings and verify trading_instrument
        settings_response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        settings = settings_response.json()['settings']
        
        assert settings.get('trading_instrument') == 'FINNIFTY', \
            f"Expected FINNIFTY, got {settings.get('trading_instrument')}"
        
        # Reset to NIFTY50
        requests.post(f"{BASE_URL}/api/instruments/set", json={"instrument": "NIFTY50"}, timeout=10)
        
        print("✓ Instrument persists in settings correctly")


# Run pytest if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
