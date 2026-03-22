/**
 * News Fetcher Module v2
 * Fetches news from 16 sources in PARALLEL with fair distribution.
 * Fixed: redirect handling, timeout issues, parallel fetch, per-source article limits.
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

// Common axios config for Indian news sites
const FETCH_CONFIG = {
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/xml, text/xml, application/rss+xml, */*',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
  },
};

// ============ News Sources ============
async function fetchRSSSource(urls, source, max) {
  const articles = [];
  const feeds = Array.isArray(urls) ? urls : [urls];
  // Fetch all feeds for this source in parallel
  const results = await Promise.allSettled(
    feeds.map(url =>
      axios.get(url, FETCH_CONFIG)
        .then(resp => rssToArticles(parseRSS(resp.data), source, Math.ceil(max / feeds.length)))
        .catch(e => { console.error(`[News] ${source} RSS error (${url}):`, e.message); return []; })
    )
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) articles.push(...r.value);
  }
  return articles.slice(0, max);
}

async function fetchFromMoneycontrol(max) {
  return fetchRSSSource([
    'https://www.moneycontrol.com/rss/marketreports.xml',
    'https://www.moneycontrol.com/rss/stocksnews.xml',
    'https://www.moneycontrol.com/rss/latestnews.xml',
  ], 'Moneycontrol', max);
}

async function fetchFromEconomicTimes(max) {
  return fetchRSSSource([
    'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
    'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms',
  ], 'Economic Times', max);
}

async function fetchFromHinduBusinessLine(max) {
  return fetchRSSSource([
    'https://www.thehindubusinessline.com/markets/feeder/default.rss',
    'https://www.thehindubusinessline.com/markets/stock-markets/feeder/default.rss',
    'https://www.thehindubusinessline.com/economy/feeder/default.rss',
  ], 'Hindu Business Line', max);
}

async function fetchFromCNBCTV18(max) {
  return fetchRSSSource([
    'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml',
    'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/economy.xml',
  ], 'CNBC TV18', max);
}

async function fetchFromLivemint(max) {
  return fetchRSSSource([
    'https://www.livemint.com/rss/markets',
    'https://www.livemint.com/rss/money',
  ], 'Livemint', max);
}

const MARKET_KEYWORDS = ['market', 'nifty', 'sensex', 'stock', 'share', 'trade', 'rbi', 'bank', 'invest', 'rupee', 'gdp', 'inflation', 'earnings', 'ipo', 'fund', 'economy', 'fiscal', 'budget', 'profit', 'revenue', 'sector', 'fii', 'dii', 'fpi', 'mutual fund', 'bond', 'yield', 'interest rate', 'crude', 'gold', 'silver', 'nse', 'bse', 'option', 'future', 'derivative'];

async function fetchFromGenericRSS(url, source, max, filterKeywords = false) {
  const articles = [];
  try {
    const resp = await axios.get(url, FETCH_CONFIG);
    const xml = typeof resp.data === 'string' ? resp.data : '';
    if (!xml) return [];
    const items = parseRSS(xml);
    for (const item of items.slice(0, filterKeywords ? max * 3 : max)) {
      if (!item.title) continue;
      if (filterKeywords) {
        const textLower = (item.title + ' ' + item.description).toLowerCase();
        if (!MARKET_KEYWORDS.some(kw => textLower.includes(kw))) continue;
      }
      articles.push({
        title: item.title, description: item.description, content: item.description,
        source, url: item.link,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.error(`[News] ${source} error:`, e.message); }
  return articles.slice(0, max);
}

async function fetchFromBusinessToday(max) {
  // Try multiple URLs (businesstoday.in/rss redirects, so try direct market feed)
  const urls = [
    'https://www.businesstoday.in/rss/market',
    'https://www.businesstoday.in/rss/economy',
    'https://www.businesstoday.in/rss',
  ];
  const articles = [];
  for (const url of urls) {
    try {
      const resp = await axios.get(url, { ...FETCH_CONFIG, maxRedirects: 10 });
      const xml = typeof resp.data === 'string' ? resp.data : '';
      if (!xml) continue;
      const items = parseRSS(xml);
      for (const item of items.slice(0, max)) {
        if (!item.title) continue;
        const textLower = (item.title + ' ' + item.description).toLowerCase();
        if (!MARKET_KEYWORDS.some(kw => textLower.includes(kw))) continue;
        articles.push({
          title: item.title, description: item.description, content: item.description,
          source: 'Business Today', url: item.link,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
        });
      }
      if (articles.length > 0) break;
    } catch (e) { /* try next URL */ }
  }
  return articles.slice(0, max);
}

async function fetchFromNDTVProfit(max) {
  // NDTV Profit feedburner sometimes fails, try direct URL too
  const urls = [
    'https://feeds.feedburner.com/ndtvprofit-latest',
    'https://www.ndtvprofit.com/rss',
  ];
  for (const url of urls) {
    try {
      const articles = await fetchFromGenericRSS(url, 'NDTV Profit', max, true);
      if (articles.length > 0) return articles;
    } catch (_) { /* try next */ }
  }
  return [];
}

async function fetchFromNSEIndia(max) {
  const articles = [];
  try {
    const session = axios.create({
      baseURL: 'https://www.nseindia.com', timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const homeResp = await session.get('/', { maxRedirects: 5 });
    const cookies = (homeResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const resp = await session.get('/api/corporate-announcements?index=equities&from_date=&to_date=', { headers: { Cookie: cookies, Referer: 'https://www.nseindia.com' } });
    const announcements = Array.isArray(resp.data) ? resp.data : [];
    for (const ann of announcements.slice(0, max)) {
      articles.push({
        title: `${ann.symbol || 'NSE'}: ${ann.desc || ann.subject || 'Corporate Announcement'}`,
        description: ann.desc || ann.subject || '', content: ann.desc || ann.subject || '',
        source: 'NSE India',
        url: ann.attchmntFile ? `https://www.nseindia.com${ann.attchmntFile}` : 'https://www.nseindia.com',
        published_at: ann.an_dt ? new Date(ann.an_dt).toISOString() : new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('[News] NSE India error:', e.message);
    // Fallback: market status
    try {
      const resp = await axios.get('https://www.nseindia.com/api/marketStatus', { ...FETCH_CONFIG });
      for (const m of (resp.data?.marketState || [])) {
        articles.push({
          title: `${m.market || 'Market'} Status: ${m.marketStatus || 'Unknown'}`,
          description: `${m.market} - ${m.marketStatusMessage || m.marketStatus || ''}. Trade date: ${m.tradeDate || ''}`,
          content: '', source: 'NSE India', url: 'https://www.nseindia.com',
          published_at: new Date().toISOString(), fetched_at: new Date().toISOString(),
        });
      }
    } catch (_) {}
  }
  return articles.slice(0, max);
}

function fetchFromNewsAPI(apiKey, max) {
  return axios.get('https://newsapi.org/v2/everything', {
    params: { q: 'stock market OR nifty OR sensex OR options trading OR india market', language: 'en', sortBy: 'publishedAt', pageSize: max, apiKey },
    timeout: 10000,
  }).then(resp => {
    if (resp.data?.status !== 'ok') throw new Error(resp.data?.message || 'NewsAPI error');
    return (resp.data.articles || []).map(a => ({
      title: a.title || '', description: a.description || '', content: a.content || '',
      source: a.source?.name || 'NewsAPI', url: a.url || '',
      published_at: a.publishedAt || '', fetched_at: new Date().toISOString(),
    }));
  });
}

function fetchFromAlphaVantage(apiKey, max) {
  return axios.get('https://www.alphavantage.co/query', {
    params: { function: 'NEWS_SENTIMENT', tickers: 'NSE:NIFTY,NSE:BANKNIFTY', topics: 'financial_markets,economy_macro', limit: max, apikey: apiKey },
    timeout: 15000,
  }).then(resp => {
    const data = resp.data;
    if (data['Error Message'] || data['Note']) throw new Error(data['Error Message'] || data['Note']);
    return (data.feed || []).map(item => ({
      title: item.title || '', description: item.summary || '', content: item.summary || '',
      source: item.source || 'Alpha Vantage', url: item.url || '',
      published_at: item.time_published || '', fetched_at: new Date().toISOString(),
    }));
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

async function fetchFromBloombergAsia(max) {
  return fetchRSSSource([
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://feeds.bloomberg.com/technology/news.rss',
  ], 'Bloomberg', max);
}

async function fetchFromIndiaToday(max) {
  const articles = [];
  try {
    const resp = await axios.get('https://www.indiatoday.in/business/market', {
      ...FETCH_CONFIG,
      headers: {
        ...FETCH_CONFIG.headers,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = typeof resp.data === 'string' ? resp.data : '';
    if (!html) return [];

    // Extract article links and titles: /business/market/story/...
    const articleRegex = /href="(\/business\/(?:market|story)[^"]*story[^"]*-(\d{4}-\d{2}-\d{2}))"[^>]*>\s*([^<]+)/g;
    const seen = new Set();
    let match;
    while ((match = articleRegex.exec(html)) !== null && articles.length < max) {
      const url = `https://www.indiatoday.in${match[1]}`;
      const title = stripHtml(match[3]).trim();
      if (!title || title.length < 20 || seen.has(url)) continue;
      seen.add(url);
      articles.push({
        title, description: title, content: title,
        source: 'India Today', url,
        published_at: match[2] ? new Date(match[2]).toISOString() : new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      });
    }

    // Fallback: broader pattern for story links
    if (articles.length < max) {
      const fallbackRegex = /href="(\/business\/(?:market\/story|story)\/[^"]+)"[^>]*title="([^"]+)"/g;
      while ((match = fallbackRegex.exec(html)) !== null && articles.length < max) {
        const url = `https://www.indiatoday.in${match[1]}`;
        const title = stripHtml(match[2]).trim();
        if (!title || title.length < 20 || seen.has(url)) continue;
        seen.add(url);
        articles.push({
          title, description: title, content: title,
          source: 'India Today', url,
          published_at: new Date().toISOString(),
          fetched_at: new Date().toISOString(),
        });
      }
    }

    console.log(`[News] India Today: scraped ${articles.length} articles`);
  } catch (e) {
    console.error('[News] India Today error:', e.message);
  }
  return articles.slice(0, max);
}

async function fetchFromReuters(max) {
  // Reuters blocks direct requests, use Google News RSS as proxy
  return fetchGoogleNewsRSS('site:reuters.com india market stock economy', 'Reuters', max);
}

async function fetchFromZeeBusiness(max) {
  // Zee Business blocks direct requests, use Google News RSS as proxy
  return fetchGoogleNewsRSS('site:zeebiz.com market stock', 'Zee Business', max);
}

async function fetchFromFinancialExpress(max) {
  // Financial Express blocks direct requests, use Google News RSS as proxy
  return fetchGoogleNewsRSS('site:financialexpress.com market stock', 'Financial Express', max);
}

// Google News RSS fetcher helper
async function fetchGoogleNewsRSS(query, sourceName, max) {
  const articles = [];
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const resp = await axios.get(url, { ...FETCH_CONFIG });
    const xml = typeof resp.data === 'string' ? resp.data : '';
    if (!xml) return [];

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of items) {
      if (articles.length >= max) break;
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
      const pubMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      if (!titleMatch) continue;

      let title = stripHtml(titleMatch[1]).trim();
      // Remove " - Source Name" suffix added by Google News
      title = title.replace(/\s*-\s*(The\s+)?Financial Express$/, '').replace(/\s*-\s*Zee Business$/, '').trim();
      if (!title || title.length < 15) continue;

      const articleUrl = linkMatch ? linkMatch[1].trim() : '';
      articles.push({
        title, description: title, content: title,
        source: sourceName, url: articleUrl,
        published_at: pubMatch ? new Date(pubMatch[1].trim()).toISOString() : new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      });
    }
    console.log(`[News] ${sourceName}: fetched ${articles.length} articles via Google News RSS`);
  } catch (e) {
    console.error(`[News] ${sourceName} error:`, e.message);
  }
  return articles.slice(0, max);
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
  bloomberg: (cfg, max) => fetchFromBloombergAsia(max),
  indiatoday: (cfg, max) => fetchFromIndiaToday(max),
  reuters: (cfg, max) => fetchFromReuters(max),
  zeebusiness: (cfg, max) => fetchFromZeeBusiness(max),
  financialexpress: (cfg, max) => fetchFromFinancialExpress(max),
  newsapi: (cfg, max) => { const k = cfg.newsapi_key || ''; return (k && k !== 'get_from_newsapi_org') ? fetchFromNewsAPI(k, max) : Promise.resolve([]); },
  alphavantage: (cfg, max) => { const k = cfg.alphavantage_key || ''; return (k && k !== 'get_from_alphavantage_co') ? fetchFromAlphaVantage(k, max) : Promise.resolve([]); },
};

async function fetchAllNews(newsCfg) {
  const sources = newsCfg.sources || ['demo'];
  const errors = [];

  // PARALLEL fetch - all sources at once instead of sequential
  const perSource = 8; // articles per source for fair distribution
  const fetchPromises = sources.map(src => {
    const fetcher = SOURCE_MAP[src];
    if (!fetcher) return Promise.resolve({ src, articles: [] });
    return fetcher(newsCfg, perSource)
      .then(articles => ({ src, articles: articles || [] }))
      .catch(e => {
        console.error(`[News] ${src} error:`, e.message);
        errors.push({ source: src, error: e.message });
        return { src, articles: [] };
      });
  });

  const results = await Promise.allSettled(fetchPromises);

  // Fair distribution: take articles round-robin from each source
  const sourceArticles = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      const { src, articles } = r.value;
      if (articles.length > 0) {
        sourceArticles[src] = articles;
        console.log(`[News] ${src}: ${articles.length} articles fetched`);
      } else {
        console.log(`[News] ${src}: 0 articles (empty or failed)`);
      }
    }
  }

  // Round-robin mix: take 2 from each source at a time until we have enough
  let allNews = [];
  const sourceKeys = Object.keys(sourceArticles);
  const indices = {};
  sourceKeys.forEach(k => { indices[k] = 0; });
  let hasMore = true;
  while (hasMore && allNews.length < 80) {
    hasMore = false;
    for (const key of sourceKeys) {
      const arr = sourceArticles[key];
      if (indices[key] < arr.length) {
        // Take 2 articles per round from each source
        const take = Math.min(2, arr.length - indices[key]);
        allNews.push(...arr.slice(indices[key], indices[key] + take));
        indices[key] += take;
        hasMore = true;
      }
    }
  }

  console.log(`[News] Total: ${allNews.length} articles from ${sourceKeys.length} sources`);
  if (allNews.length === 0) allNews = getDemoNews();
  return { articles: allNews, errors };
}

module.exports = { fetchAllNews, getDemoNews, SOURCE_MAP };
