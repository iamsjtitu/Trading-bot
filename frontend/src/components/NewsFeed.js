import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FaNewspaper, FaRobot, FaDownload } from 'react-icons/fa';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = (() => {
  const envUrl = process.env.REACT_APP_BACKEND_URL || '';
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) return '';
  return envUrl;
})();
const API = `${BACKEND_URL}/api`;

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export default function NewsFeed({ news, formatTime, onRefresh }) {
  const [fetchingNews, setFetchingNews] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);

  const getSentimentColor = (sentiment) => {
    if (!sentiment) return 'bg-gray-500';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return 'bg-green-500';
    if (s === 'BEARISH') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const getSentimentEmoji = (sentiment) => {
    if (!sentiment) return '';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return '\u25B2';
    if (s === 'BEARISH') return '\u25BC';
    return '~';
  };

  const handleFetchOnly = async () => {
    setFetchingNews(true);
    try {
      const res = await axios.post(`${API}/news/fetch-only`, {}, { timeout: 120000 });
      if (res.data.status === 'success') {
        toast.success(`${res.data.articles_fetched} new articles fetched`, {
          description: 'Click "Analyze" on any article to get AI signal',
        });
        if (onRefresh) onRefresh();
      } else {
        toast.error('Fetch failed', { description: res.data.message });
      }
    } catch (e) {
      toast.error('Fetch Error', { description: e.message });
    } finally {
      setFetchingNews(false);
    }
  };

  const handleAnalyzeArticle = async (article) => {
    setAnalyzingId(article.id);
    try {
      const res = await axios.post(`${API}/news/analyze-article`, { article_id: article.id }, { timeout: 60000 });
      if (res.data.status === 'success') {
        if (res.data.signal) {
          toast.success(`Signal: ${res.data.signal.signal_type} ${res.data.signal.symbol}`, {
            description: `${res.data.signal.confidence}% confident | Strike: ${res.data.signal.strike_price}`,
          });
        } else {
          toast.info('Analysis Complete', {
            description: res.data.message || 'No tradeable signal from this article',
          });
        }
        if (onRefresh) onRefresh();
      } else {
        toast.error('Analysis Failed', { description: res.data.message });
      }
    } catch (e) {
      toast.error('Analysis Error', { description: e.message });
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Fetch News Button */}
      <div className="flex items-center gap-3" data-testid="news-actions-bar">
        <Button
          onClick={handleFetchOnly}
          disabled={fetchingNews}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          data-testid="fetch-news-only-btn"
        >
          <FaDownload className="mr-2" />
          {fetchingNews ? 'Fetching...' : 'Fetch Latest News'}
        </Button>
        <span className="text-sm text-gray-500">
          Fetches news without using AI credits. Analyze individual articles below.
        </span>
      </div>

      {news.length === 0 ? (
        <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-news-message">
          <FaNewspaper className="text-5xl text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No news fetched yet</p>
          <p className="text-sm text-gray-500 mt-2">Click "Fetch Latest News" to get market news</p>
        </Card>
      ) : (
        news.map((article, idx) => (
          <Card key={idx} className="bg-white border-gray-200 p-4 hover:shadow-lg transition-all" data-testid={`news-article-${idx}`}>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className={`w-16 h-16 rounded-lg ${getSentimentColor(article.sentiment_analysis?.sentiment)} flex items-center justify-center text-xl font-bold text-white shadow-md`}>
                  {getSentimentEmoji(article.sentiment_analysis?.sentiment)}
                </div>
              </div>
              <div className="flex-grow">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg text-gray-800">{cleanText(article.title)}</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={getSentimentColor(article.sentiment_analysis?.sentiment)}>
                      {article.sentiment_analysis?.sentiment || 'N/A'}
                    </Badge>
                    {article.ai_analyzed && (
                      <Badge className="bg-purple-600 text-xs">AI</Badge>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{cleanText(article.description)}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{article.source}</span>
                  <span>{formatTime(article.published_at)}</span>
                  {article.sentiment_analysis && (
                    <>
                      <span>Confidence: {article.sentiment_analysis.confidence}%</span>
                      <span>{article.sentiment_analysis.impact} Impact</span>
                      {article.sentiment_analysis.sector && article.sentiment_analysis.sector !== 'BROAD_MARKET' && (
                        <Badge className="bg-purple-100 text-purple-700 text-xs">{article.sentiment_analysis.sector}</Badge>
                      )}
                    </>
                  )}
                </div>
                {article.sentiment_analysis?.reason && (
                  <p className="text-sm text-blue-600 mt-2 italic bg-blue-50 p-2 rounded">{cleanText(article.sentiment_analysis.reason)}</p>
                )}
                {/* Analyze Button */}
                <div className="mt-3 flex items-center gap-2">
                  {!article.ai_analyzed ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleAnalyzeArticle(article)}
                        disabled={analyzingId === article.id}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        data-testid={`analyze-article-btn-${idx}`}
                      >
                        <FaRobot className="mr-1" />
                        {analyzingId === article.id ? 'Analyzing...' : 'Analyze with AI'}
                      </Button>
                      {article.sentiment_analysis?.sentiment && article.sentiment_analysis.sentiment !== 'NEUTRAL' && (
                        <span className="text-xs text-gray-500 italic">
                          Click to generate {article.sentiment_analysis.sentiment === 'BULLISH' ? 'CALL' : 'PUT'} signal
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 text-xs" data-testid={`ai-analyzed-badge-${idx}`}>
                      AI Analyzed
                    </Badge>
                  )}
                  {article.sentiment_analysis?.signal_type && article.sentiment_analysis.signal_type !== 'HOLD' && (
                    <Badge className={article.sentiment_analysis.signal_type === 'CALL' ? 'bg-green-600' : 'bg-red-600'}>
                      Signal: {article.sentiment_analysis.signal_type}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
