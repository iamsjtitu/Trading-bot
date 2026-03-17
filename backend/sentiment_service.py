import os
from typing import Dict
import logging
from emergentintegrations.llm.chat import LlmChat, UserMessage
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class SentimentService:
    def __init__(self):
        self.api_key = os.getenv('EMERGENT_LLM_KEY')
        if not self.api_key:
            logger.warning("No EMERGENT_LLM_KEY - using keyword-based analysis")
        self.recent_sentiments = []

    def _update_trend(self, sentiment: Dict):
        """Track recent sentiments for trend-aware scoring"""
        self.recent_sentiments.append(sentiment)
        if len(self.recent_sentiments) > 20:
            self.recent_sentiments = self.recent_sentiments[-20:]

    def _get_trend_adjustment(self, current_sentiment: str) -> int:
        """Adjust confidence based on recent sentiment trend"""
        if len(self.recent_sentiments) < 3:
            return 0
        recent = self.recent_sentiments[-5:]
        same_count = sum(1 for s in recent if s.get('sentiment') == current_sentiment)
        if same_count >= 4:
            return 8
        elif same_count >= 3:
            return 4
        elif same_count <= 1:
            return -5
        return 0

    def _detect_sector(self, text: str) -> str:
        """Detect which market sector the news relates to"""
        text_lower = text.lower()
        sectors = {
            'BANKING': ['bank', 'nifty bank', 'banknifty', 'rbi', 'interest rate', 'repo rate', 'credit', 'loan', 'npa', 'hdfc', 'icici', 'sbi', 'kotak', 'axis bank'],
            'IT': ['it sector', 'tech', 'infosys', 'tcs', 'wipro', 'hcl tech', 'software', 'digital', 'ai ', 'artificial intelligence'],
            'PHARMA': ['pharma', 'drug', 'medicine', 'health', 'hospital', 'vaccine', 'fda', 'cipla', 'sun pharma', 'dr reddy'],
            'AUTO': ['auto', 'vehicle', 'car', 'tata motors', 'maruti', 'mahindra', 'ev ', 'electric vehicle'],
            'ENERGY': ['oil', 'gas', 'energy', 'reliance', 'ongc', 'crude', 'petrol', 'diesel', 'power', 'solar', 'renewable'],
            'METAL': ['metal', 'steel', 'iron', 'copper', 'aluminium', 'tata steel', 'jsw', 'hindalco', 'vedanta'],
            'FMCG': ['fmcg', 'consumer', 'itc', 'hindustan unilever', 'nestle', 'britannia', 'food', 'retail'],
        }
        for sector, keywords in sectors.items():
            if any(kw in text_lower for kw in keywords):
                return sector
        return 'BROAD_MARKET'

    async def analyze_news_sentiment(self, news_article: Dict) -> Dict:
        """Analyze sentiment using AI with enhanced prompts, fallback to keywords"""
        if not self.api_key:
            result = self._keyword_sentiment(news_article)
            self._update_trend(result)
            return result

        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"sentiment-{news_article.get('title', '')[:20]}",
                system_message="""You are an expert Indian stock market analyst with deep knowledge of Nifty 50, Bank Nifty, and sectoral indices. You specialize in options trading sentiment analysis.

Analyze the given news article considering:
1. DIRECT MARKET IMPACT - How will this news move Nifty/BankNifty in the next 1-3 hours?
2. SECTOR IMPACT - Which sector is most affected? (Banking, IT, Pharma, Auto, Energy, Metal, FMCG, Broad Market)
3. FII/DII FLOW IMPACT - Will this attract or repel institutional money?
4. GLOBAL CORRELATION - Is this aligned with global market trends?
5. HISTORICAL PATTERN - Similar news in the past led to what market movement?

Provide analysis in this EXACT format:
SENTIMENT: [BULLISH/BEARISH/NEUTRAL]
CONFIDENCE: [0-100]
IMPACT: [HIGH/MEDIUM/LOW]
SECTOR: [BANKING/IT/PHARMA/AUTO/ENERGY/METAL/FMCG/BROAD_MARKET]
REASON: [Detailed one-line explanation with specific market impact prediction]
TRADING_SIGNAL: [BUY_CALL/BUY_PUT/HOLD]

Confidence Guide:
- 85-100: Clear directional news with strong historical precedent (rate cuts, major earnings, policy changes)
- 70-84: Strong sentiment with moderate certainty (sector rotation, FII data, global cues)
- 55-69: Mild sentiment, mixed signals (routine announcements, mixed data)
- Below 55: Unclear impact, recommend HOLD

Be conservative - only recommend BUY_CALL/BUY_PUT when confidence >= 65 and impact is MEDIUM or HIGH."""
            ).with_model("openai", "gpt-4.1-mini")

            news_text = f"""Title: {news_article.get('title', '')}
Description: {news_article.get('description', '')}
Content: {news_article.get('content', '')}
Source: {news_article.get('source', '')}
Published: {news_article.get('published_at', '')}"""

            user_message = UserMessage(text=news_text)
            response = await chat.send_message(user_message)
            result = self._parse_sentiment_response(response)

            # Apply trend adjustment
            trend_adj = self._get_trend_adjustment(result['sentiment'])
            result['confidence'] = max(30, min(98, result['confidence'] + trend_adj))
            if trend_adj != 0:
                result['trend_note'] = f"Confidence adjusted by {trend_adj:+d} based on recent trend"

            # Detect sector if AI didn't provide it
            if not result.get('sector'):
                text = f"{news_article.get('title', '')} {news_article.get('description', '')}"
                result['sector'] = self._detect_sector(text)

            self._update_trend(result)
            return result

        except Exception as e:
            logger.error(f"Sentiment analysis error: {e}, falling back to keywords")
            result = self._keyword_sentiment(news_article)
            self._update_trend(result)
            return result

    def _keyword_sentiment(self, article: Dict) -> Dict:
        """Enhanced keyword-based sentiment with sector detection and weighted scoring"""
        text = f"{article.get('title', '')} {article.get('description', '')}".lower()

        # Weighted keywords - high impact words get more score
        bullish_high = ['all-time high', 'record high', 'massive rally', 'strong earnings', 'rate cut', 'fii buying', 'breakout']
        bullish_mid = ['rally', 'surge', 'gain', 'bull', 'positive', 'boost', 'growth', 'profit', 'upgrade', 'outperform', 'recovery', 'inflows', 'green', 'uptrend', 'bullish', 'optimism']
        bullish_low = ['rise', 'high', 'strong', 'buy', 'good', 'better', 'stable']

        bearish_high = ['crash', 'panic selling', 'circuit break', 'recession', 'rate hike', 'fii selling', 'meltdown']
        bearish_mid = ['fall', 'drop', 'decline', 'bear', 'negative', 'weak', 'loss', 'fear', 'downgrade', 'underperform', 'correction', 'outflows', 'red', 'downtrend', 'bearish', 'pressure', 'slump']
        bearish_low = ['sell', 'low', 'warning', 'concern', 'risk', 'inflation', 'uncertainty']

        bull_score = sum(3 for kw in bullish_high if kw in text)
        bull_score += sum(2 for kw in bullish_mid if kw in text)
        bull_score += sum(1 for kw in bullish_low if kw in text)

        bear_score = sum(3 for kw in bearish_high if kw in text)
        bear_score += sum(2 for kw in bearish_mid if kw in text)
        bear_score += sum(1 for kw in bearish_low if kw in text)

        total = bull_score + bear_score
        sector = self._detect_sector(text)

        if total == 0:
            return {'sentiment': 'NEUTRAL', 'confidence': 50, 'impact': 'LOW', 'sector': sector, 'reason': 'No strong keywords detected (keyword analysis)', 'trading_signal': 'HOLD'}

        dominant = 'BULLISH' if bull_score > bear_score else 'BEARISH' if bear_score > bull_score else 'NEUTRAL'
        diff = abs(bull_score - bear_score)
        confidence = min(90, 50 + diff * 5)
        impact = 'HIGH' if diff >= 6 else 'MEDIUM' if diff >= 3 else 'LOW'

        # Apply trend adjustment
        trend_adj = self._get_trend_adjustment(dominant)
        confidence = max(30, min(95, confidence + trend_adj))

        signal = 'HOLD'
        if dominant == 'BULLISH' and confidence >= 63 and impact != 'LOW':
            signal = 'BUY_CALL'
        elif dominant == 'BEARISH' and confidence >= 63 and impact != 'LOW':
            signal = 'BUY_PUT'

        all_kw = bullish_high + bullish_mid if dominant == 'BULLISH' else bearish_high + bearish_mid
        matched = [kw for kw in all_kw if kw in text][:4]
        reason = f"{dominant.title()} signals [{sector}]: {', '.join(matched)} (keyword analysis)" if dominant != 'NEUTRAL' else f'Mixed signals [{sector}] (keyword analysis)'

        return {'sentiment': dominant, 'confidence': confidence, 'impact': impact, 'sector': sector, 'reason': reason, 'trading_signal': signal}

    def _parse_sentiment_response(self, response: str) -> Dict:
        """Parse AI response into structured data"""
        result = {'sentiment': 'NEUTRAL', 'confidence': 50, 'impact': 'LOW', 'sector': 'BROAD_MARKET', 'reason': '', 'trading_signal': 'HOLD'}
        try:
            for line in response.strip().split('\n'):
                line = line.strip()
                if line.startswith('SENTIMENT:'):
                    result['sentiment'] = line.split(':', 1)[1].strip()
                elif line.startswith('CONFIDENCE:'):
                    try:
                        result['confidence'] = int(line.split(':', 1)[1].strip())
                    except ValueError:
                        pass
                elif line.startswith('IMPACT:'):
                    result['impact'] = line.split(':', 1)[1].strip()
                elif line.startswith('SECTOR:'):
                    result['sector'] = line.split(':', 1)[1].strip()
                elif line.startswith('REASON:'):
                    result['reason'] = line.split(':', 1)[1].strip()
                elif line.startswith('TRADING_SIGNAL:'):
                    result['trading_signal'] = line.split(':', 1)[1].strip()
        except Exception as e:
            logger.error(f"Parse error: {e}")
        return result
