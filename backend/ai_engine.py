"""
AI Decision Engine - Advanced Trading Intelligence (Python)
Handles: Signal correlation, market regime detection, multi-timeframe analysis,
dynamic position sizing, sector rotation, and AI-powered trade review.
"""

import math
import time
import logging
from typing import Dict, List, Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


class AIDecisionEngine:
    def __init__(self):
        # Multi-timeframe sentiment tracking
        self.sentiment_windows = {'1h': [], '4h': [], 'daily': []}

        # Sector momentum tracker
        self.sector_momentum = {}

        # Market regime
        self.market_regime = 'UNKNOWN'
        self.regime_confidence = 0

        # Signal correlation buffer
        self.signal_buffer = []

        # Trade performance
        self.recent_trade_results = []

    # ========== MARKET REGIME DETECTION ==========

    def detect_market_regime(self) -> str:
        sentiments = self.sentiment_windows['4h']
        if len(sentiments) < 5:
            self.market_regime = 'UNKNOWN'
            self.regime_confidence = 0
            return self.market_regime

        total = len(sentiments)
        bullish = sum(1 for s in sentiments if s.get('sentiment') == 'BULLISH')
        bearish = sum(1 for s in sentiments if s.get('sentiment') == 'BEARISH')
        neutral = sum(1 for s in sentiments if s.get('sentiment') == 'NEUTRAL')
        bull_pct, bear_pct, neutral_pct = bullish / total, bearish / total, neutral / total

        confidences = [s.get('confidence', 50) for s in sentiments]
        avg_conf = sum(confidences) / len(confidences)
        variance = sum((c - avg_conf) ** 2 for c in confidences) / len(confidences)
        std_dev = math.sqrt(variance)

        if std_dev > 20:
            self.market_regime = 'VOLATILE'
            self.regime_confidence = min(95, int(60 + std_dev))
        elif bull_pct >= 0.65:
            self.market_regime = 'TRENDING_UP'
            self.regime_confidence = round(bull_pct * 100)
        elif bear_pct >= 0.65:
            self.market_regime = 'TRENDING_DOWN'
            self.regime_confidence = round(bear_pct * 100)
        elif neutral_pct >= 0.5 or abs(bull_pct - bear_pct) < 0.15:
            self.market_regime = 'SIDEWAYS'
            self.regime_confidence = round(neutral_pct * 100)
        else:
            self.market_regime = 'MIXED'
            self.regime_confidence = 50

        return self.market_regime

    def get_regime_multiplier(self) -> float:
        return {'TRENDING_UP': 1.2, 'TRENDING_DOWN': 1.2, 'SIDEWAYS': 0.6, 'VOLATILE': 0.5, 'MIXED': 0.8, 'UNKNOWN': 0.7}.get(self.market_regime, 0.8)

    # ========== MULTI-TIMEFRAME SENTIMENT ==========

    def update_sentiment_windows(self, sentiment: Dict):
        now = time.time() * 1000  # ms
        entry = {**sentiment, 'timestamp': now}
        self.sentiment_windows['1h'].append(entry)
        self.sentiment_windows['4h'].append(entry)
        self.sentiment_windows['daily'].append(entry)

        self.sentiment_windows['1h'] = [s for s in self.sentiment_windows['1h'] if now - s['timestamp'] < 3600000]
        self.sentiment_windows['4h'] = [s for s in self.sentiment_windows['4h'] if now - s['timestamp'] < 14400000]
        self.sentiment_windows['daily'] = [s for s in self.sentiment_windows['daily'] if now - s['timestamp'] < 86400000]
        self.detect_market_regime()

    def get_timeframe_confluence(self, sentiment: str) -> Dict:
        windows = ['1h', '4h', 'daily']
        aligned = 0
        for w in windows:
            entries = self.sentiment_windows[w]
            if len(entries) >= 2:
                matching = sum(1 for s in entries if s.get('sentiment') == sentiment)
                if matching / len(entries) >= 0.6:
                    aligned += 1
        return {'score': round(aligned / len(windows) * 100), 'aligned': aligned, 'total': len(windows)}

    # ========== SIGNAL CORRELATION ==========

    def add_to_signal_buffer(self, signal: Dict):
        self.signal_buffer.append({**signal, 'timestamp': time.time() * 1000})
        cutoff = time.time() * 1000 - 1800000
        self.signal_buffer = [s for s in self.signal_buffer if s['timestamp'] > cutoff]

    def get_correlation_score(self, new_signal: Dict) -> Dict:
        if len(self.signal_buffer) < 2:
            return {'score': 50, 'reason': 'Insufficient signals'}
        same_dir = sum(1 for s in self.signal_buffer if s.get('sentiment') == new_signal.get('sentiment'))
        same_sector = sum(1 for s in self.signal_buffer if s.get('sector') == new_signal.get('sector'))
        dir_ratio = same_dir / len(self.signal_buffer)
        sector_ratio = same_sector / len(self.signal_buffer)
        score = min(98, round(50 + dir_ratio * 30 + sector_ratio * 15))
        return {'score': score, 'reason': f'Direction: {round(dir_ratio * 100)}%, Sector: {round(sector_ratio * 100)}%'}

    # ========== SECTOR ROTATION ==========

    def update_sector_momentum(self, sector: str, sentiment: str, confidence: int):
        if sector not in self.sector_momentum:
            self.sector_momentum[sector] = {'bullish': 0, 'bearish': 0, 'neutral': 0, 'signals': 0, 'avg_confidence': 0, 'momentum': 0}
        sm = self.sector_momentum[sector]
        sm['signals'] += 1
        sm['avg_confidence'] = (sm['avg_confidence'] * (sm['signals'] - 1) + confidence) / sm['signals']
        if sentiment == 'BULLISH': sm['bullish'] += 1
        elif sentiment == 'BEARISH': sm['bearish'] += 1
        else: sm['neutral'] += 1
        sm['momentum'] = round((sm['bullish'] - sm['bearish']) / sm['signals'] * 100)

    def get_sector_rotation_insight(self) -> Dict:
        sectors = [(k, v) for k, v in self.sector_momentum.items() if v['signals'] >= 3]
        sectors.sort(key=lambda x: x[1]['momentum'], reverse=True)
        leaders = [{'sector': k, 'momentum': v['momentum']} for k, v in sectors if v['momentum'] > 30]
        laggards = [{'sector': k, 'momentum': v['momentum']} for k, v in sectors if v['momentum'] < -30]
        rotation = 'ACTIVE' if leaders and laggards else 'BROAD_BULLISH' if leaders else 'BROAD_BEARISH' if laggards else 'NONE'
        return {'leaders': leaders, 'laggards': laggards, 'rotation': rotation}

    # ========== DYNAMIC POSITION SIZING ==========

    def update_trade_result(self, result: Dict):
        self.recent_trade_results.append({**result, 'timestamp': time.time()})
        if len(self.recent_trade_results) > 50:
            self.recent_trade_results.pop(0)

    def calculate_dynamic_position_size(self, base_size: float, confidence: int, sector: str) -> Dict:
        confidence_factor = max(0.3, min(2.0, (confidence - 40) / 40))

        win_rate_factor = 1.0
        closed = [t for t in self.recent_trade_results if 'pnl' in t]
        if len(closed) >= 5:
            wins = [t for t in closed if t['pnl'] > 0]
            win_rate = len(wins) / len(closed)
            avg_win = sum(t['pnl'] for t in wins) / max(len(wins), 1)
            avg_loss = abs(sum(t['pnl'] for t in closed if t['pnl'] <= 0)) / max(len(closed) - len(wins), 1)
            R = avg_win / max(avg_loss, 1)
            kelly = max(0.1, min(0.5, win_rate - (1 - win_rate) / max(R, 0.01)))
            win_rate_factor = 0.5 + kelly

        regime_mult = self.get_regime_multiplier()

        sector_mult = 1.0
        sd = self.sector_momentum.get(sector)
        if sd and sd['signals'] >= 5:
            if sd['bullish'] / sd['signals'] > 0.7: sector_mult = 1.15
            elif sd['bullish'] / sd['signals'] < 0.3: sector_mult = 0.7

        drawdown_mult = 1.0
        recent5 = self.recent_trade_results[-5:]
        if len(recent5) >= 3:
            losses = sum(1 for t in recent5 if t.get('pnl', 0) < 0)
            if losses >= 3: drawdown_mult = 0.5
            elif losses >= 2: drawdown_mult = 0.75

        final = max(1000, round(base_size * confidence_factor * win_rate_factor * regime_mult * sector_mult * drawdown_mult))
        return {'size': final, 'factors': {'confidence': round(confidence_factor, 2), 'win_rate': round(win_rate_factor, 2), 'regime': round(regime_mult, 2), 'sector': round(sector_mult, 2), 'drawdown': round(drawdown_mult, 2)}}

    # ========== NEWS FRESHNESS ==========

    @staticmethod
    def calculate_freshness_score(published_at: str) -> int:
        try:
            pub_time = datetime.fromisoformat(published_at.replace('Z', '+00:00')).timestamp()
        except Exception:
            return 50
        age_minutes = (time.time() - pub_time) / 60
        score = 100 * math.exp(-0.693 * age_minutes / 60)
        return max(5, round(score))

    # ========== ENHANCED CONTEXT ==========

    def build_enhanced_context(self, historical_patterns: List = None) -> str:
        rotation = self.get_sector_rotation_insight()
        recent = self.recent_trade_results[-10:]
        wins = sum(1 for t in recent if t.get('pnl', 0) > 0)
        losses = len(recent) - wins
        recent_pnl = sum(t.get('pnl', 0) for t in recent)

        now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        ist_hour, ist_min = now.hour, now.minute
        total_min = ist_hour * 60 + ist_min
        if total_min < 555: time_ctx = 'PRE_MARKET'
        elif total_min < 615: time_ctx = 'OPENING_HOUR'
        elif total_min < 780: time_ctx = 'MID_SESSION'
        elif total_min < 870: time_ctx = 'AFTERNOON'
        elif total_min <= 930: time_ctx = 'CLOSING_HOUR'
        else: time_ctx = 'POST_MARKET'

        hour_sentiments = self.sentiment_windows['1h']
        bull_1h = sum(1 for s in hour_sentiments if s.get('sentiment') == 'BULLISH')
        bear_1h = sum(1 for s in hour_sentiments if s.get('sentiment') == 'BEARISH')

        ctx = f"\n--- MARKET CONTEXT ---\nMarket Regime: {self.market_regime} ({self.regime_confidence}%)\nSession: {time_ctx} (IST {ist_hour}:{str(ist_min).zfill(2)})\nLast 1h: {bull_1h} bullish, {bear_1h} bearish / {len(hour_sentiments)}"

        if recent:
            ctx += f"\nRecent: {wins}W/{losses}L, P&L: {round(recent_pnl)}"
        if rotation['leaders']:
            leader_strs = [f"{l['sector']}(+{l['momentum']})" for l in rotation['leaders']]
            ctx += f"\nSector Leaders: {', '.join(leader_strs)}"
        if rotation['laggards']:
            laggard_strs = [f"{l['sector']}({l['momentum']})" for l in rotation['laggards']]
            ctx += f"\nSector Laggards: {', '.join(laggard_strs)}"
        if historical_patterns and len(historical_patterns) >= 5:
            total_p = len(historical_patterns)
            profit_p = sum(1 for p in historical_patterns if p.get('was_profitable'))
            ctx += f"\nHistorical Win Rate: {round(profit_p / total_p * 100)}% ({total_p} trades)"

        ctx += "\n--- END CONTEXT ---"
        return ctx

    # ========== COMPOSITE SCORE ==========

    def compute_final_score(self, sentiment: Dict, correlation: Dict, confluence: Dict, freshness: int, historical_adj: int) -> int:
        score = round(
            sentiment.get('confidence', 50) * 0.35 +
            correlation.get('score', 50) * 0.20 +
            confluence.get('score', 50) * 0.20 +
            freshness * 0.15 +
            (50 + historical_adj * 5) * 0.10
        )
        return max(20, min(98, score))

    def get_ai_insights(self) -> Dict:
        self.detect_market_regime()
        return {
            'market_regime': {'regime': self.market_regime, 'confidence': self.regime_confidence},
            'sector_rotation': self.get_sector_rotation_insight(),
            'sentiment_depth': {w: len(v) for w, v in self.sentiment_windows.items()},
            'signal_buffer_size': len(self.signal_buffer),
            'recent_trade_count': len(self.recent_trade_results),
            'regime_multiplier': self.get_regime_multiplier(),
        }
