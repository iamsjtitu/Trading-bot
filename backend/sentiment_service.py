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
            raise ValueError("EMERGENT_LLM_KEY not found in environment")
    
    async def analyze_news_sentiment(self, news_article: Dict) -> Dict:
        """Analyze sentiment of news article using AI"""
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
            logger.error(f"Sentiment analysis error: {e}")
            # Return neutral sentiment on error
            return {
                'sentiment': 'NEUTRAL',
                'confidence': 50,
                'impact': 'LOW',
                'reason': 'Error in analysis',
                'trading_signal': 'HOLD'
            }
    
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
