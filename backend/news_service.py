import os
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class NewsService:
    def __init__(self):
        self.news_api_key = os.getenv('NEWS_API_KEY', '')
        self.alpha_vantage_key = os.getenv('ALPHA_VANTAGE_KEY', '')
        
    async def fetch_market_news(self, max_articles: int = 20) -> List[Dict]:
        """Fetch latest market news from multiple sources"""
        all_news = []
        
        # Fetch from NewsAPI if key is available
        if self.news_api_key and self.news_api_key != 'get_from_newsapi_org':
            try:
                news_api_articles = await self._fetch_from_newsapi(max_articles)
                all_news.extend(news_api_articles)
            except Exception as e:
                logger.error(f"NewsAPI fetch error: {e}")
        
        # Fallback to demo/mock news for paper trading
        if len(all_news) == 0:
            all_news = self._get_demo_news()
            
        return all_news[:max_articles]
    
    async def _fetch_from_newsapi(self, max_articles: int) -> List[Dict]:
        """Fetch from NewsAPI.org"""
        url = 'https://newsapi.org/v2/everything'
        params = {
            'q': 'stock market OR nifty OR sensex OR options trading OR india market',
            'language': 'en',
            'sortBy': 'publishedAt',
            'pageSize': max_articles,
            'apiKey': self.news_api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        articles = []
        for article in data.get('articles', []):
            articles.append({
                'title': article.get('title', ''),
                'description': article.get('description', ''),
                'content': article.get('content', ''),
                'source': article.get('source', {}).get('name', 'Unknown'),
                'url': article.get('url', ''),
                'published_at': article.get('publishedAt', ''),
                'fetched_at': datetime.now(timezone.utc).isoformat()
            })
        
        return articles
    
    def _get_demo_news(self) -> List[Dict]:
        """Demo news for paper trading when no API key"""
        base_time = datetime.now(timezone.utc)
        
        demo_articles = [
            {
                'title': 'Nifty 50 rallies 2% as global markets surge on positive economic data',
                'description': 'Indian benchmark index Nifty 50 closed at fresh highs today, driven by strong FII inflows and positive global cues. Banking and IT stocks led the rally.',
                'content': 'Market experts suggest bullish trend may continue',
                'source': 'Demo Market News',
                'url': 'https://demo.com/news1',
                'published_at': (base_time - timedelta(minutes=10)).isoformat(),
                'fetched_at': base_time.isoformat()
            },
            {
                'title': 'RBI maintains repo rate, signals cautious stance on inflation',
                'description': 'Reserve Bank of India kept interest rates unchanged in its latest policy meeting, citing concerns over persistent inflation despite growth moderation.',
                'content': 'Markets react mixed to RBI decision',
                'source': 'Demo Financial Times',
                'url': 'https://demo.com/news2',
                'published_at': (base_time - timedelta(minutes=30)).isoformat(),
                'fetched_at': base_time.isoformat()
            },
            {
                'title': 'Tech stocks under pressure as valuations questioned by analysts',
                'description': 'Major IT companies face selling pressure as analysts raise concerns about high valuations amid global tech slowdown.',
                'content': 'Investors advised caution in tech sector',
                'source': 'Demo Business Wire',
                'url': 'https://demo.com/news3',
                'published_at': (base_time - timedelta(hours=1)).isoformat(),
                'fetched_at': base_time.isoformat()
            },
            {
                'title': 'Strong Q4 earnings boost sentiment in banking sector',
                'description': 'Major banks report better-than-expected quarterly results, leading to renewed investor interest in financial stocks.',
                'content': 'Banking index outperforms broader market',
                'source': 'Demo Market Watch',
                'url': 'https://demo.com/news4',
                'published_at': (base_time - timedelta(hours=2)).isoformat(),
                'fetched_at': base_time.isoformat()
            },
            {
                'title': 'Global crude oil prices fall 3%, benefiting import-dependent India',
                'description': 'International oil prices declined sharply on demand concerns, providing relief to Indian markets and reducing import costs.',
                'content': 'Energy stocks react to oil price movement',
                'source': 'Demo Energy News',
                'url': 'https://demo.com/news5',
                'published_at': (base_time - timedelta(hours=3)).isoformat(),
                'fetched_at': base_time.isoformat()
            }
        ]
        
        return demo_articles
