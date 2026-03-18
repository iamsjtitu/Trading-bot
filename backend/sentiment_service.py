import os
from typing import Dict
import logging
from emergentintegrations.llm.chat import LlmChat, UserMessage
from dotenv import load_dotenv
from ai_engine import AIDecisionEngine

load_dotenv()

logger = logging.getLogger(__name__)

# Shared AI Decision Engine instance
ai_engine = AIDecisionEngine()


class SentimentService:
    def __init__(self):
        self.api_key = os.getenv('EMERGENT_LLM_KEY')
        if not self.api_key:
            logger.warning("No EMERGENT_LLM_KEY - using keyword-based analysis")
        self.recent_sentiments = []

    def _update_trend(self, sentiment: Dict):
        self.recent_sentiments.append(sentiment)
        if len(self.recent_sentiments) > 20:
            self.recent_sentiments = self.recent_sentiments[-20:]

    def _get_trend_adjustment(self, current_sentiment: str) -> int:
        if len(self.recent_sentiments) < 3:
            return 0
        recent = self.recent_sentiments[-5:]
        same_count = sum(1 for s in recent if s.get('sentiment') == current_sentiment)
        if same_count >= 4: return 8
        elif same_count >= 3: return 4
        elif same_count <= 1: return -5
        return 0

    def _detect_sector(self, text: str) -> str:
        text_lower = text.lower()
        sectors = {
            'BANKING': ['bank', 'nifty bank', 'banknifty', 'rbi', 'interest rate', 'repo rate', 'credit', 'loan', 'npa', 'hdfc', 'icici', 'sbi', 'kotak', 'axis bank'],
            'IT': ['it sector', 'tech', 'infosys', 'tcs', 'wipro', 'hcl tech', 'software', 'digital', 'ai ', 'artificial intelligence'],
            'PHARMA': ['pharma', 'drug', 'medicine', 'health', 'hospital', 'vaccine', 'fda', 'cipla', 'sun pharma', 'dr reddy'],
            'AUTO': ['auto', 'vehicle', 'car', 'tata motors', 'maruti', 'mahindra', 'ev ', 'electric vehicle'],
            'ENERGY': ['oil', 'gas', 'energy', 'reliance', 'ongc', 'crude', 'petrol', 'diesel', 'power', 'solar', 'renewable'],
            'METAL': ['metal', 'steel', 'iron', 'copper', 'aluminium', 'tata steel', 'jsw', 'hindalco', 'vedanta'],
            'FMCG': ['fmcg', 'consumer', 'itc', 'hindustan unilever', 'nestle', 'britannia', 'food', 'retail'],
            'INFRA': ['infra', 'infrastructure', 'cement', 'construction', 'highway', 'railway', 'l&t', 'adani'],
            'REALTY': ['real estate', 'realty', 'housing', 'property', 'dlf', 'godrej properties', 'prestige'],
        }
        for sector, keywords in sectors.items():
            if any(kw in text_lower for kw in keywords):
                return sector
        return 'BROAD_MARKET'

    def _get_enhanced_system_prompt(self) -> str:
        context = ai_engine.build_enhanced_context()
        return f"""You are an elite Indian stock market AI analyst specializing in Nifty 50 & Bank Nifty options trading. You combine fundamental analysis, technical sentiment, and quantitative signals.

ANALYSIS FRAMEWORK:
1. DIRECT IMPACT: How will this news move Nifty/BankNifty in next 1-3 hours?
2. SECTOR CASCADING: Primary sector impact and secondary sector spillover effects
3. INSTITUTIONAL FLOW: FII/DII probable reaction (buying/selling pressure)
4. GLOBAL CORRELATION: Alignment with US futures, Asian markets, crude oil, USD/INR
5. HISTORICAL PATTERN: What happened last time similar news came? Success rate?
6. VOLATILITY ASSESSMENT: Will this increase or decrease option premiums?
7. TIME DECAY RISK: How quickly will this news be priced in?
8. CONTRARIAN CHECK: Is the obvious trade too crowded? Any contrarian signals?

{context}

OUTPUT FORMAT (EXACT):
SENTIMENT: [BULLISH/BEARISH/NEUTRAL]
CONFIDENCE: [0-100]
IMPACT: [HIGH/MEDIUM/LOW]
SECTOR: [BANKING/IT/PHARMA/AUTO/ENERGY/METAL/FMCG/INFRA/REALTY/BROAD_MARKET]
VOLATILITY: [INCREASING/DECREASING/STABLE]
TIME_HORIZON: [IMMEDIATE/SHORT_TERM/MEDIUM_TERM]
REASON: [2-3 lines detailed analysis with specific predictions]
TRADING_SIGNAL: [BUY_CALL/BUY_PUT/HOLD]
RISK_LEVEL: [LOW/MEDIUM/HIGH]
SECONDARY_SECTOR: [sector indirectly affected, or NONE]

CONFIDENCE CALIBRATION:
- 90-100: Exceptional clarity - major policy/earnings
- 80-89: Strong directional signal - clear FII/DII flow
- 70-79: Good signal - single company event with sector impact
- 60-69: Moderate - routine data, mixed global cues
- 50-59: Weak - recommend HOLD
- Below 50: Noise - always HOLD

CRITICAL RULES:
- Be conservative. Better to miss a trade than lose money.
- Only BUY_CALL/BUY_PUT when confidence >= 65 AND impact is MEDIUM or HIGH
- In VOLATILE regime, require confidence >= 75
- In SIDEWAYS market, require confidence >= 70"""

    def _compute_enhanced_signal(self, result: Dict) -> str:
        regime = ai_engine.market_regime
        composite = result.get('composite_score', result.get('confidence', 50))
        impact = result.get('impact', 'LOW')
        sentiment = result.get('sentiment', 'NEUTRAL')

        min_confidence = 65
        if regime == 'VOLATILE': min_confidence = 75
        elif regime == 'SIDEWAYS': min_confidence = 70

        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        total_min = now.hour * 60 + now.minute
        if 870 <= total_min <= 930: min_confidence = 80

        if composite >= min_confidence and impact != 'LOW':
            if sentiment == 'BULLISH': return 'BUY_CALL'
            if sentiment == 'BEARISH': return 'BUY_PUT'
        return 'HOLD'

    async def analyze_news_sentiment(self, news_article: Dict) -> Dict:
        if not self.api_key:
            result = self._keyword_sentiment(news_article)
            self._integrate_with_engine(result, news_article)
            return result

        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"sentiment-{news_article.get('title', '')[:20]}",
                system_message=self._get_enhanced_system_prompt()
            ).with_model("openai", "gpt-4.1-mini")

            freshness = ai_engine.calculate_freshness_score(news_article.get('published_at', ''))
            news_text = f"""Title: {news_article.get('title', '')}
Description: {news_article.get('description', '')}
Content: {news_article.get('content', '')}
Source: {news_article.get('source', '')}
Published: {news_article.get('published_at', '')}
Freshness Score: {freshness}/100"""

            user_message = UserMessage(text=news_text)
            response = await chat.send_message(user_message)
            result = self._parse_enhanced_response(response)

            # Apply trend adjustment
            trend_adj = self._get_trend_adjustment(result['sentiment'])
            result['confidence'] = max(30, min(98, result['confidence'] + trend_adj))
            if trend_adj != 0:
                result['trend_note'] = f"Confidence adjusted by {trend_adj:+d}"

            if not result.get('sector'):
                text = f"{news_article.get('title', '')} {news_article.get('description', '')}"
                result['sector'] = self._detect_sector(text)

            self._integrate_with_engine(result, news_article)
            return result

        except Exception as e:
            logger.error(f"Sentiment analysis error: {e}, falling back to keywords")
            result = self._keyword_sentiment(news_article)
            self._integrate_with_engine(result, news_article)
            return result

    def _integrate_with_engine(self, result: Dict, article: Dict):
        """Integrate sentiment with AI Decision Engine for multi-signal analysis"""
        freshness = ai_engine.calculate_freshness_score(article.get('published_at', ''))
        result['freshness_score'] = freshness

        ai_engine.update_sentiment_windows(result)
        ai_engine.update_sector_momentum(result.get('sector', 'BROAD_MARKET'), result.get('sentiment', 'NEUTRAL'), result.get('confidence', 50))
        ai_engine.add_to_signal_buffer(result)

        correlation = ai_engine.get_correlation_score(result)
        result['correlation_score'] = correlation['score']
        result['correlation_detail'] = correlation['reason']

        confluence = ai_engine.get_timeframe_confluence(result.get('sentiment', 'NEUTRAL'))
        result['confluence_score'] = confluence['score']
        result['confluence_aligned'] = confluence['aligned']

        result['composite_score'] = ai_engine.compute_final_score(result, correlation, confluence, freshness, 0)
        result['market_regime'] = ai_engine.market_regime

        result['trading_signal'] = self._compute_enhanced_signal(result)
        self._update_trend(result)

    def _keyword_sentiment(self, article: Dict) -> Dict:
        text = f"{article.get('title', '')} {article.get('description', '')}".lower()

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
            return {'sentiment': 'NEUTRAL', 'confidence': 50, 'impact': 'LOW', 'sector': sector, 'reason': 'No strong keywords detected', 'trading_signal': 'HOLD'}

        dominant = 'BULLISH' if bull_score > bear_score else 'BEARISH' if bear_score > bull_score else 'NEUTRAL'
        diff = abs(bull_score - bear_score)
        confidence = min(90, 50 + diff * 5)
        impact = 'HIGH' if diff >= 6 else 'MEDIUM' if diff >= 3 else 'LOW'

        trend_adj = self._get_trend_adjustment(dominant)
        confidence = max(30, min(95, confidence + trend_adj))

        signal = 'HOLD'
        if dominant == 'BULLISH' and confidence >= 63 and impact != 'LOW': signal = 'BUY_CALL'
        elif dominant == 'BEARISH' and confidence >= 63 and impact != 'LOW': signal = 'BUY_PUT'

        all_kw = bullish_high + bullish_mid if dominant == 'BULLISH' else bearish_high + bearish_mid
        matched = [kw for kw in all_kw if kw in text][:4]
        reason = f"{dominant.title()} [{sector}]: {', '.join(matched)}" if dominant != 'NEUTRAL' else f'Mixed [{sector}]'

        return {'sentiment': dominant, 'confidence': confidence, 'impact': impact, 'sector': sector, 'reason': reason, 'trading_signal': signal}

    def _parse_enhanced_response(self, response: str) -> Dict:
        result = {'sentiment': 'NEUTRAL', 'confidence': 50, 'impact': 'LOW', 'sector': 'BROAD_MARKET', 'reason': '', 'trading_signal': 'HOLD', 'volatility': 'STABLE', 'time_horizon': 'SHORT_TERM', 'risk_level': 'MEDIUM', 'secondary_sector': 'NONE'}
        try:
            for line in response.strip().split('\n'):
                line = line.strip()
                if ':' not in line: continue
                key, val = line.split(':', 1)
                key = key.strip().upper()
                val = val.strip()
                if key == 'SENTIMENT': result['sentiment'] = val
                elif key == 'CONFIDENCE':
                    try: result['confidence'] = int(val)
                    except ValueError: pass
                elif key == 'IMPACT': result['impact'] = val
                elif key == 'SECTOR': result['sector'] = val
                elif key == 'REASON': result['reason'] = val
                elif key == 'TRADING_SIGNAL': result['trading_signal'] = val
                elif key == 'VOLATILITY': result['volatility'] = val
                elif key == 'TIME_HORIZON': result['time_horizon'] = val
                elif key == 'RISK_LEVEL': result['risk_level'] = val
                elif key == 'SECONDARY_SECTOR': result['secondary_sector'] = val
        except Exception as e:
            logger.error(f"Parse error: {e}")
        return result
