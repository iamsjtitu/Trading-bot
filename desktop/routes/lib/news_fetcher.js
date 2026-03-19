/**
 * News Fetcher Module
 * Pure functions for fetching news from 11+ sources. No database dependency.
 */
const axios = require('axios');

// ============ RSS Parser ============
function stripHtml(str) {
  return (str || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return stripHtml(m ? (m[1] || m[2] || '') : '');
    };
    items.push({ title: get('title'), description: get('description'), link: get('link'), pubDate: get('pubDate') });
  }
  return items;
}

function rssToArticles(items, source, max) {
  return items.slice(0, max).map(item => ({
    title: item.title, description: item.description, content: item.description,
    source, url: item.link,
    published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    fetched_at: new Date().toISOString(),
  }));
}

// ============ News Sources ============
async function fetchRSSSource(urls, source, max) {
  const articles = [];
  const feeds = Array.isArray(urls) ? urls : [urls];
  for (const url of feeds) {
    try {
      const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const items = parseRSS(resp.data);
      articles.push(...rssToArticles(items, source, Math.ceil(max / feeds.length)));
    } catch (e) { console.error(`[News] ${source} RSS error (${url}):`, e.message); }
  }
  return articles.slice(0, max);
}

async function fetchFromMoneycontrol(max) {
  return fetchRSSSource(['https://www.moneycontrol.com/rss/marketreports.xml', 'https://www.moneycontrol.com/rss/stocksnews.xml'], 'Moneycontrol', max);
}

async function fetchFromEconomicTimes(max) {
  return fetchRSSSource(['https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms'], 'Economic Times', max);
}

async function fetchFromHinduBusinessLine(max) {
  return fetchRSSSource(['https://www.thehindubusinessline.com/markets/feeder/default.rss', 'https://www.thehindubusinessline.com/markets/stock-markets/feeder/default.rss', 'https://www.thehindubusinessline.com/economy/feeder/default.rss'], 'Hindu Business Line', max);
}

async function fetchFromCNBCTV18(max) {
  return fetchRSSSource(['https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml', 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/economy.xml'], 'CNBC TV18', max);
}

async function fetchFromLivemint(max) {
  return fetchRSSSource('https://www.livemint.com/rss/markets', 'Livemint', max);
}

const MARKET_KEYWORDS = ['market', 'nifty', 'sensex', 'stock', 'share', 'trade', 'rbi', 'bank', 'invest', 'rupee', 'gdp', 'inflation', 'earnings', 'ipo', 'fund', 'economy', 'fiscal', 'budget', 'profit', 'revenue', 'sector', 'fii', 'dii', 'fpi', 'mutual fund', 'bond', 'yield', 'interest rate', 'crude', 'gold', 'silver'];

async function fetchFromGenericRSS(url, source, max, filterKeywords = false) {
  const articles = [];
  try {
    const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = resp.data;
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items.slice(0, filterKeywords ? max * 2 : max)) {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || '').trim();
      const desc = (item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || item.match(/<description>(.*?)<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
      const link = (item.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
      const pub = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      if (!title) continue;
      if (filterKeywords) {
        const textLower = (title + ' ' + desc).toLowerCase();
        if (!MARKET_KEYWORDS.some(kw => textLower.includes(kw))) continue;
      }
      articles.push({ title, description: desc, content: desc, source, url: link, published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(), fetched_at: new Date().toISOString() });
    }
  } catch (e) { console.error(`[News] ${source} error:`, e.message); }
  return articles.slice(0, max);
}

async function fetchFromBusinessToday(max) { return fetchFromGenericRSS('https://www.businesstoday.in/rss', 'Business Today', max, true); }
async function fetchFromNDTVProfit(max) { return fetchFromGenericRSS('https://feeds.feedburner.com/ndtvprofit-latest', 'NDTV Profit', max, true); }

async function fetchFromNSEIndia(max) {
  const articles = [];
  try {
    const session = axios.create({ baseURL: 'https://www.nseindia.com', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9' } });
    const homeResp = await session.get('/', { maxRedirects: 5 });
    const cookies = (homeResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const resp = await session.get('/api/corporate-announcements?index=equities&from_date=&to_date=', { headers: { Cookie: cookies, Referer: 'https://www.nseindia.com' } });
    const announcements = Array.isArray(resp.data) ? resp.data : [];
    for (const ann of announcements.slice(0, max)) {
      articles.push({ title: `${ann.symbol || 'NSE'}: ${ann.desc || ann.subject || 'Corporate Announcement'}`, description: ann.desc || ann.subject || '', content: ann.desc || ann.subject || '', source: 'NSE India', url: ann.attchmntFile ? `https://www.nseindia.com${ann.attchmntFile}` : 'https://www.nseindia.com', published_at: ann.an_dt ? new Date(ann.an_dt).toISOString() : new Date().toISOString(), fetched_at: new Date().toISOString() });
    }
  } catch (e) {
    console.error('[News] NSE India error:', e.message);
    try {
      const resp = await axios.get('https://www.nseindia.com/api/marketStatus', { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      for (const m of (resp.data?.marketState || [])) {
        articles.push({ title: `${m.market || 'Market'} Status: ${m.marketStatus || 'Unknown'}`, description: `${m.market} - ${m.marketStatusMessage || m.marketStatus || ''}. Trade date: ${m.tradeDate || ''}`, content: '', source: 'NSE India', url: 'https://www.nseindia.com', published_at: new Date().toISOString(), fetched_at: new Date().toISOString() });
      }
    } catch (_) {}
  }
  return articles.slice(0, max);
}

function fetchFromNewsAPI(apiKey, max) {
  return axios.get('https://newsapi.org/v2/everything', { params: { q: 'stock market OR nifty OR sensex OR options trading OR india market', language: 'en', sortBy: 'publishedAt', pageSize: max, apiKey }, timeout: 10000 })
    .then(resp => {
      if (resp.data?.status !== 'ok') throw new Error(resp.data?.message || 'NewsAPI error');
      return (resp.data.articles || []).map(a => ({ title: a.title || '', description: a.description || '', content: a.content || '', source: a.source?.name || 'NewsAPI', url: a.url || '', published_at: a.publishedAt || '', fetched_at: new Date().toISOString() }));
    });
}

function fetchFromAlphaVantage(apiKey, max) {
  return axios.get('https://www.alphavantage.co/query', { params: { function: 'NEWS_SENTIMENT', tickers: 'NSE:NIFTY,NSE:BANKNIFTY', topics: 'financial_markets,economy_macro', limit: max, apikey: apiKey }, timeout: 15000 })
    .then(resp => {
      const data = resp.data;
      if (data['Error Message'] || data['Note']) throw new Error(data['Error Message'] || data['Note']);
      return (data.feed || []).map(item => ({ title: item.title || '', description: item.summary || '', content: item.summary || '', source: item.source || 'Alpha Vantage', url: item.url || '', published_at: item.time_published || '', fetched_at: new Date().toISOString() }));
    });
}

function getDemoNews() {
  const now = new Date();
  return [
    { title: 'Nifty 50 rallies 2% as global markets surge on positive economic data', description: 'Indian benchmark index Nifty 50 closed at fresh highs today, driven by strong FII inflows and positive global cues. Banking and IT stocks led the rally.', content: 'Market experts suggest bullish trend may continue', source: 'Demo Market News', url: '#', published_at: new Date(now - 10 * 60000).toISOString(), fetched_at: now.toISOString() },
    { title: 'RBI maintains repo rate, signals cautious stance on inflation', description: 'Reserve Bank of India kept interest rates unchanged in its latest policy meeting, citing concerns over persistent inflation despite growth moderation.', content: 'Markets react mixed to RBI decision', source: 'Demo Financial Times', url: '#', published_at: new Date(now - 30 * 60000).toISOString(), fetched_at: now.toISOString() },
    { title: 'Tech stocks under pressure as valuations questioned by analysts', description: 'Major IT companies face selling pressure as analysts raise concerns about high valuations amid global tech slowdown.', content: 'Investors advised caution', source: 'Demo Business Wire', url: '#', published_at: new Date(now - 60 * 60000).toISOString(), fetched_at: now.toISOString() },
    { title: 'Strong Q4 earnings boost sentiment in banking sector', description: 'Major banks report better-than-expected quarterly results, leading to renewed investor interest in financial stocks.', content: 'Banking index outperforms', source: 'Demo Market Watch', url: '#', published_at: new Date(now - 120 * 60000).toISOString(), fetched_at: now.toISOString() },
    { title: 'Global crude oil prices fall 3%, benefiting import-dependent India', description: 'International oil prices declined sharply on demand concerns, providing relief to Indian markets.', content: 'Energy stocks react', source: 'Demo Energy News', url: '#', published_at: new Date(now - 180 * 60000).toISOString(), fetched_at: now.toISOString() },
  ];
}

// Source dispatcher
const SOURCE_MAP = {
  moneycontrol: (cfg, max) => fetchFromMoneycontrol(max),
  economictimes: (cfg, max) => fetchFromEconomicTimes(max),
  nse_india: (cfg, max) => fetchFromNSEIndia(max),
  businesstoday: (cfg, max) => fetchFromBusinessToday(max),
  hindubusinessline: (cfg, max) => fetchFromHinduBusinessLine(max),
  ndtv_profit: (cfg, max) => fetchFromNDTVProfit(max),
  cnbc_tv18: (cfg, max) => fetchFromCNBCTV18(max),
  livemint: (cfg, max) => fetchFromLivemint(max),
  newsapi: (cfg, max) => { const k = cfg.newsapi_key || ''; return (k && k !== 'get_from_newsapi_org') ? fetchFromNewsAPI(k, max) : Promise.resolve([]); },
  alphavantage: (cfg, max) => { const k = cfg.alphavantage_key || ''; return (k && k !== 'get_from_alphavantage_co') ? fetchFromAlphaVantage(k, max) : Promise.resolve([]); },
};

async function fetchAllNews(newsCfg) {
  const sources = newsCfg.sources || ['demo'];
  let allNews = [];
  const errors = [];
  for (const src of sources) {
    const fetcher = SOURCE_MAP[src];
    if (fetcher) {
      try { allNews = allNews.concat(await fetcher(newsCfg, 10)); }
      catch (e) { console.error(`[News] ${src} error:`, e.message); errors.push({ source: src, error: e.message }); }
    }
  }
  if (allNews.length === 0) allNews = getDemoNews();
  return { articles: allNews, errors };
}

module.exports = { fetchAllNews, getDemoNews, SOURCE_MAP };
