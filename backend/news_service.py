import os
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class NewsService:
    def __init__(self, db=None):
        self.db = db

    async def _get_news_settings(self) -> Dict:
        """Get news settings from DB, fallback to env vars"""
        if self.db is not None:
            settings = await self.db.bot_settings.find_one({'type': 'main'}, {'_id': 0})
            if settings and 'news' in settings:
                return settings['news']
        return {
            'sources': ['demo'],
            'newsapi_key': os.getenv('NEWS_API_KEY', ''),
            'alphavantage_key': os.getenv('ALPHA_VANTAGE_KEY', ''),
        }

    async def fetch_market_news(self, max_articles: int = 20) -> List[Dict]:
        """Fetch latest market news from configured source"""
        news_settings = await self._get_news_settings()
        sources = news_settings.get('sources', ['demo'])
        all_news = []

        # Try NewsAPI
        if 'newsapi' in sources:
            key = news_settings.get('newsapi_key', '')
            if key and key not in ('', 'get_from_newsapi_org'):
                try:
                    articles = self._fetch_from_newsapi(key, max_articles)
                    all_news.extend(articles)
                    logger.info(f"Fetched {len(articles)} articles from NewsAPI")
                except Exception as e:
                    logger.error(f"NewsAPI fetch error: {e}")

        # Try Alpha Vantage
        if 'alphavantage' in sources:
            key = news_settings.get('alphavantage_key', '')
            if key and key not in ('', 'get_from_alphavantage_co'):
                try:
                    articles = self._fetch_from_alphavantage(key, max_articles)
                    all_news.extend(articles)
                    logger.info(f"Fetched {len(articles)} articles from Alpha Vantage")
                except Exception as e:
                    logger.error(f"Alpha Vantage fetch error: {e}")

        # Fallback to demo news
        if len(all_news) == 0:
            all_news = self._get_demo_news()
            logger.info("Using demo news (no API key configured or source set to demo)")

        return all_news[:max_articles]

    def _fetch_from_newsapi(self, api_key: str, max_articles: int) -> List[Dict]:
        """Fetch from NewsAPI.org"""
        url = 'https://newsapi.org/v2/everything'
        params = {
            'q': 'stock market OR nifty OR sensex OR options trading OR india market',
            'language': 'en',
            'sortBy': 'publishedAt',
            'pageSize': max_articles,
            'apiKey': api_key
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get('status') != 'ok':
            raise Exception(f"NewsAPI error: {data.get('message', 'Unknown error')}")

        articles = []
        for article in data.get('articles', []):
            articles.append({
                'title': article.get('title', ''),
                'description': article.get('description', '') or '',
                'content': article.get('content', '') or '',
                'source': article.get('source', {}).get('name', 'NewsAPI'),
                'url': article.get('url', ''),
                'published_at': article.get('publishedAt', ''),
                'fetched_at': datetime.now(timezone.utc).isoformat()
            })

        return articles

    def _fetch_from_alphavantage(self, api_key: str, max_articles: int) -> List[Dict]:
        """Fetch from Alpha Vantage News Sentiment API"""
        url = 'https://www.alphavantage.co/query'
        params = {
            'function': 'NEWS_SENTIMENT',
            'tickers': 'NSE:NIFTY,NSE:BANKNIFTY',
            'topics': 'financial_markets,economy_macro',
            'limit': max_articles,
            'apikey': api_key
        }

        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()

        if 'Error Message' in data or 'Note' in data:
            raise Exception(f"Alpha Vantage error: {data.get('Error Message', data.get('Note', 'Unknown'))}")

        articles = []
        for item in data.get('feed', []):
            pub_time = item.get('time_published', '')
            if pub_time:
                try:
                    dt = datetime.strptime(pub_time, '%Y%m%dT%H%M%S')
                    pub_time = dt.replace(tzinfo=timezone.utc).isoformat()
                except ValueError:
                    pass

            articles.append({
                'title': item.get('title', ''),
                'description': item.get('summary', '') or '',
                'content': item.get('summary', '') or '',
                'source': item.get('source', 'Alpha Vantage'),
                'url': item.get('url', ''),
                'published_at': pub_time,
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
