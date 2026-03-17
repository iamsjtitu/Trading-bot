import { useState, useEffect } from 'react';
import '@/App.css';
import axios from 'axios';
import { FaChartLine, FaNewspaper, FaBullseye, FaWallet, FaSync, FaRobot } from 'react-icons/fa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [portfolio, setPortfolio] = useState(null);
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingNews, setFetchingNews] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [nextAnalysis, setNextAnalysis] = useState(null);

  useEffect(() => {
    initializeApp();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeApp = async () => {
    try {
      await axios.post(`${API}/initialize`);
      await loadData();
    } catch (error) {
      console.error('Initialize error:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [portfolioRes, newsRes, signalsRes, tradesRes, statsRes] = await Promise.all([
        axios.get(`${API}/portfolio`),
        axios.get(`${API}/news/latest?limit=10`),
        axios.get(`${API}/signals/latest?limit=10`),
        axios.get(`${API}/trades/active`),
        axios.get(`${API}/stats`)
      ]);

      setPortfolio(portfolioRes.data);
      setNews(newsRes.data.news || []);
      setSignals(signalsRes.data.signals || []);
      setTrades(tradesRes.data.trades || []);
      setStats(statsRes.data.stats || {});
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNewNews = async () => {
    setFetchingNews(true);
    try {
      const response = await axios.get(`${API}/news/fetch`);
      console.log('News fetched:', response.data);
      await loadData(); // Reload all data
    } catch (error) {
      console.error('Fetch news error:', error);
    } finally {
      setFetchingNews(false);
    }
  };

  const getSentimentColor = (sentiment) => {
    if (!sentiment) return 'bg-gray-500';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return 'bg-green-500';
    if (s === 'BEARISH') return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const getSentimentEmoji = (sentiment) => {
    if (!sentiment) return '📊';
    const s = sentiment.toUpperCase();
    if (s === 'BULLISH') return '🚀';
    if (s === 'BEARISH') return '📉';
    return '➡️';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-2 rounded-lg shadow-lg">
                <FaRobot className="text-2xl text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AI Trading Bot</h1>
                <p className="text-xs text-gray-600">News-Based Options Trading • Paper Mode</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={loadData}
                disabled={loading}
                variant="outline"
                className="border-gray-300 hover:bg-gray-100 text-gray-700"
                data-testid="refresh-button"
              >
                <FaSync className={loading ? 'animate-spin' : ''} />
              </Button>
              <Button
                onClick={fetchNewNews}
                disabled={fetchingNews}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                data-testid="fetch-news-button"
              >
                {fetchingNews ? 'Fetching...' : 'Analyze News'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="portfolio-value-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Portfolio Value</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(portfolio?.current_value || 0)}</p>
              </div>
              <FaWallet className="text-3xl text-blue-500" />
            </div>
          </Card>

          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="total-pnl-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total P&L</p>
                <p className={`text-2xl font-bold ${(portfolio?.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(portfolio?.total_pnl || 0)}
                </p>
              </div>
              <FaChartLine className="text-3xl text-green-500" />
            </div>
          </Card>

          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="active-positions-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Active Positions</p>
                <p className="text-2xl font-bold text-gray-900">{portfolio?.active_positions || 0}</p>
              </div>
              <FaBullseye className="text-3xl text-purple-500" />
            </div>
          </Card>

          <Card className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid="win-rate-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Win Rate</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.win_rate?.toFixed(1) || 0}%</p>
              </div>
              <FaBullseye className="text-3xl text-yellow-500" />
            </div>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="news" className="space-y-4">
          <TabsList className="bg-white border-gray-200 shadow-sm">
            <TabsTrigger value="news" data-testid="news-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">📰 News Feed</TabsTrigger>
            <TabsTrigger value="signals" data-testid="signals-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">🎯 Signals</TabsTrigger>
            <TabsTrigger value="trades" data-testid="trades-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">💹 Active Trades</TabsTrigger>
          </TabsList>

          {/* News Feed Tab */}
          <TabsContent value="news" className="space-y-4">
            {news.length === 0 ? (
              <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-news-message">
                <FaNewspaper className="text-5xl text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No news analyzed yet</p>
                <p className="text-sm text-gray-500 mt-2">Click "Analyze News" to fetch latest market news</p>
              </Card>
            ) : (
              news.map((article, idx) => (
                <Card key={idx} className="bg-white border-gray-200 p-4 hover:shadow-lg transition-all" data-testid={`news-article-${idx}`}>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className={`w-16 h-16 rounded-lg ${getSentimentColor(article.sentiment_analysis?.sentiment)} flex items-center justify-center text-3xl shadow-md`}>
                        {getSentimentEmoji(article.sentiment_analysis?.sentiment)}
                      </div>
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-lg text-gray-800">{article.title}</h3>
                        <Badge className={getSentimentColor(article.sentiment_analysis?.sentiment)}>
                          {article.sentiment_analysis?.sentiment || 'N/A'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{article.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>📰 {article.source}</span>
                        <span>🕒 {formatTime(article.published_at)}</span>
                        {article.sentiment_analysis && (
                          <>
                            <span>💯 Confidence: {article.sentiment_analysis.confidence}%</span>
                            <span>📊 {article.sentiment_analysis.impact} Impact</span>
                          </>
                        )}
                      </div>
                      {article.sentiment_analysis?.reason && (
                        <p className="text-sm text-blue-600 mt-2 italic bg-blue-50 p-2 rounded">💡 {article.sentiment_analysis.reason}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals" className="space-y-4">
            {signals.length === 0 ? (
              <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-signals-message">
                <FaBullseye className="text-5xl text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No trading signals generated yet</p>
              </Card>
            ) : (
              signals.map((signal, idx) => (
                <Card key={idx} className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid={`signal-${idx}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={signal.signal_type === 'CALL' ? 'bg-green-600' : 'bg-red-600'}>
                        {signal.signal_type === 'CALL' ? '🚀 CALL' : '📉 PUT'}
                      </Badge>
                      <span className="font-semibold text-lg text-gray-800">{signal.symbol}</span>
                      <Badge variant="outline" className="border-gray-400 text-gray-700">Strike: {signal.strike_price}</Badge>
                    </div>
                    <Badge className={getSentimentColor(signal.sentiment)}>
                      {signal.confidence}% Confident
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium">Entry Price</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(signal.entry_price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Target</p>
                      <p className="font-semibold text-green-600">{formatCurrency(signal.target)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Stop Loss</p>
                      <p className="font-semibold text-red-600">{formatCurrency(signal.stop_loss)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Investment</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(signal.investment_amount)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-3 italic bg-gray-50 p-2 rounded">💡 {signal.reason}</p>
                  <p className="text-xs text-gray-500 mt-2">🕒 Generated: {formatTime(signal.created_at)}</p>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Active Trades Tab */}
          <TabsContent value="trades" className="space-y-4">
            {trades.length === 0 ? (
              <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-trades-message">
                <FaChartLine className="text-5xl text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No active trades</p>
              </Card>
            ) : (
              trades.map((trade, idx) => (
                <Card key={idx} className="bg-white border-gray-200 p-4 shadow-md hover:shadow-lg transition-shadow" data-testid={`trade-${idx}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={trade.trade_type === 'CALL' ? 'bg-green-600' : 'bg-red-600'}>
                        {trade.trade_type}
                      </Badge>
                      <span className="font-semibold text-lg text-gray-800">{trade.symbol}</span>
                      <Badge variant="outline" className="border-gray-400 text-gray-700">Qty: {trade.quantity}</Badge>
                    </div>
                    <Badge className="bg-blue-600">{trade.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium">Entry</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(trade.entry_price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Target</p>
                      <p className="font-semibold text-green-600">{formatCurrency(trade.target)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Stop Loss</p>
                      <p className="font-semibold text-red-600">{formatCurrency(trade.stop_loss)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 font-medium">Investment</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(trade.investment)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">🕒 Entry: {formatTime(trade.entry_time)}</p>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 py-4 shadow-sm">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600">
          <p>⚠️ Paper Trading Mode • AI-Powered Options Trading Bot • For Educational Purposes Only</p>
          <p className="text-xs mt-1 text-gray-500">Trading involves risk. Past performance does not guarantee future results.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
