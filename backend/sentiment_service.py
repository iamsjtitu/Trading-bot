import os
from typing import Dict, Literal
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
    
    async def analyze_news_sentiment(self, news_article: Dict) -> Dict:
        """Analyze sentiment of news article using AI, fallback to keywords"""
        if not self.api_key:
            return self._keyword_sentiment(news_article)
        
        try:
            # Create LLM chat instance
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"sentiment-{news_article.get('title', '')[:20]}",
                system_message="""You are a professional financial market analyst specializing in sentiment analysis for options trading.
                
Your task is to analyze news articles and determine their impact on the Indian stock market (Nifty 50, Bank Nifty).
                
Provide your analysis in this EXACT format:
SENTIMENT: [BULLISH/BEARISH/NEUTRAL]
CONFIDENCE: [0-100]
IMPACT: [HIGH/MEDIUM/LOW]
REASON: [One line explanation]
TRADING_SIGNAL: [BUY_CALL/BUY_PUT/HOLD]
                
Rules:
- BULLISH = positive news that will push market up
- BEARISH = negative news that will push market down  
- NEUTRAL = no clear direction
- CONFIDENCE: 80-100 (very confident), 60-79 (confident), 40-59 (moderate), <40 (uncertain)
- Consider Indian market context
"""
            ).with_model("openai", "gpt-4.1-mini")
            
            # Prepare news text
            news_text = f"""Title: {news_article.get('title', '')}
            
Description: {news_article.get('description', '')}
            
Content: {news_article.get('content', '')}
            
Source: {news_article.get('source', '')}"""
            
            # Create user message
            user_message = UserMessage(text=news_text)
            
            # Get AI response
            response = await chat.send_message(user_message)
            
            # Parse the response
            sentiment_data = self._parse_sentiment_response(response)
            
            return sentiment_data
            
        except Exception as e:
            logger.error(f"Sentiment analysis error: {e}, falling back to keywords")
            return self._keyword_sentiment(news_article)
    
    def _keyword_sentiment(self, article: Dict) -> Dict:
        """Keyword-based sentiment fallback when AI is unavailable"""
        text = f"{article.get('title', '')} {article.get('description', '')}".lower()
        
        bullish = ['rally', 'surge', 'gain', 'rise', 'bull', 'high', 'record', 'positive', 'strong', 'boost', 'growth', 'profit', 'earnings beat', 'upgrade', 'outperform', 'breakout', 'recovery', 'optimism', 'buy', 'inflows', 'fii buying', 'all-time high', 'green', 'uptrend', 'bullish']
        bearish = ['crash', 'fall', 'drop', 'decline', 'bear', 'low', 'sell', 'negative', 'weak', 'loss', 'fear', 'panic', 'downgrade', 'underperform', 'correction', 'recession', 'inflation', 'outflows', 'fii selling', 'red', 'downtrend', 'bearish', 'pressure', 'slump', 'warning']
        
        bull_score = sum(1 for kw in bullish if kw in text)
        bear_score = sum(1 for kw in bearish if kw in text)
        total = bull_score + bear_score
        
        if total == 0:
            return {'sentiment': 'NEUTRAL', 'confidence': 55, 'impact': 'LOW', 'reason': 'No strong keywords (keyword analysis)', 'trading_signal': 'HOLD'}
        
        dominant = 'BULLISH' if bull_score > bear_score else 'BEARISH' if bear_score > bull_score else 'NEUTRAL'
        diff = abs(bull_score - bear_score)
        confidence = min(85, 55 + diff * 8)
        impact = 'HIGH' if diff >= 3 else 'MEDIUM' if diff >= 2 else 'LOW'
        
        signal = 'HOLD'
        if dominant == 'BULLISH' and confidence >= 63:
            signal = 'BUY_CALL'
        elif dominant == 'BEARISH' and confidence >= 63:
            signal = 'BUY_PUT'
        
        matched = [kw for kw in (bullish if dominant == 'BULLISH' else bearish) if kw in text][:3]
        reason = f"{dominant.title()} keywords: {', '.join(matched)} (keyword analysis)" if dominant != 'NEUTRAL' else 'Mixed signals (keyword analysis)'
        
        return {'sentiment': dominant, 'confidence': confidence, 'impact': impact, 'reason': reason, 'trading_signal': signal}
    
    def _parse_sentiment_response(self, response: str) -> Dict:
        """Parse AI response into structured data"""
        try:
            lines = response.strip().split('\n')
            result = {
                'sentiment': 'NEUTRAL',
                'confidence': 50,
                'impact': 'LOW',
                'reason': '',
                'trading_signal': 'HOLD'
            }
            
            for line in lines:
                line = line.strip()
                if line.startswith('SENTIMENT:'):
                    result['sentiment'] = line.split(':', 1)[1].strip()
                elif line.startswith('CONFIDENCE:'):
                    try:
                        result['confidence'] = int(line.split(':', 1)[1].strip())
                    except:
                        result['confidence'] = 50
                elif line.startswith('IMPACT:'):
                    result['impact'] = line.split(':', 1)[1].strip()
                elif line.startswith('REASON:'):
                    result['reason'] = line.split(':', 1)[1].strip()
                elif line.startswith('TRADING_SIGNAL:'):
                    result['trading_signal'] = line.split(':', 1)[1].strip()
            
            return result
            
        except Exception as e:
            logger.error(f"Parse error: {e}")
            return {
                'sentiment': 'NEUTRAL',
                'confidence': 50,
                'impact': 'LOW',
                'reason': 'Parse error',
                'trading_signal': 'HOLD'
            }
