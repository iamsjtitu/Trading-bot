import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FaNewspaper } from 'react-icons/fa';

export default function NewsFeed({ news, formatTime }) {
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
    if (s === 'BULLISH') return '▲';
    if (s === 'BEARISH') return '▼';
    return '~';
  };

  if (news.length === 0) {
    return (
      <Card className="bg-white border-gray-200 p-8 text-center shadow-md" data-testid="no-news-message">
        <FaNewspaper className="text-5xl text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 font-medium">No news analyzed yet</p>
        <p className="text-sm text-gray-500 mt-2">Click "Analyze News" to fetch latest market news</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {news.map((article, idx) => (
        <Card key={idx} className="bg-white border-gray-200 p-4 hover:shadow-lg transition-all" data-testid={`news-article-${idx}`}>
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className={`w-16 h-16 rounded-lg ${getSentimentColor(article.sentiment_analysis?.sentiment)} flex items-center justify-center text-xl font-bold text-white shadow-md`}>
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
                <span>{article.source}</span>
                <span>{formatTime(article.published_at)}</span>
                {article.sentiment_analysis && (
                  <>
                    <span>Confidence: {article.sentiment_analysis.confidence}%</span>
                    <span>{article.sentiment_analysis.impact} Impact</span>
                  </>
                )}
              </div>
              {article.sentiment_analysis?.reason && (
                <p className="text-sm text-blue-600 mt-2 italic bg-blue-50 p-2 rounded">{article.sentiment_analysis.reason}</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
