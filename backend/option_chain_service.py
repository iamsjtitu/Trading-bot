"""
Option Chain Service with Black-Scholes Greeks Calculator.
Provides option chain data with Delta, Theta, Gamma, Vega, and Implied Volatility.
"""
import math
import logging
import requests
from typing import Dict, List, Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# Instrument configs for option chain
OPTION_INSTRUMENTS = {
    # Index Options (NSE)
    'NIFTY': {'name': 'NIFTY 50', 'exchange': 'NSE', 'lot_size': 25, 'strike_step': 50, 'base_price': 24000, 'type': 'index'},
    'BANKNIFTY': {'name': 'BANK NIFTY', 'exchange': 'NSE', 'lot_size': 15, 'strike_step': 100, 'base_price': 52000, 'type': 'index'},
    'FINNIFTY': {'name': 'FIN NIFTY', 'exchange': 'NSE', 'lot_size': 25, 'strike_step': 50, 'base_price': 23800, 'type': 'index'},
    'MIDCPNIFTY': {'name': 'MIDCAP NIFTY', 'exchange': 'NSE', 'lot_size': 50, 'strike_step': 25, 'base_price': 12000, 'type': 'index'},
    'SENSEX': {'name': 'SENSEX', 'exchange': 'BSE', 'lot_size': 10, 'strike_step': 100, 'base_price': 79800, 'type': 'index'},
    'BANKEX': {'name': 'BANKEX', 'exchange': 'BSE', 'lot_size': 15, 'strike_step': 100, 'base_price': 55000, 'type': 'index'},
    # MCX Commodities
    'CRUDEOIL': {'name': 'Crude Oil', 'exchange': 'MCX', 'lot_size': 100, 'strike_step': 50, 'base_price': 5800, 'type': 'commodity'},
    'GOLD': {'name': 'Gold', 'exchange': 'MCX', 'lot_size': 100, 'strike_step': 100, 'base_price': 72000, 'type': 'commodity'},
    'SILVER': {'name': 'Silver', 'exchange': 'MCX', 'lot_size': 30, 'strike_step': 500, 'base_price': 88000, 'type': 'commodity'},
}

# Risk-free rate (approximate India 10Y gov bond yield)
RISK_FREE_RATE = 0.07


def norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution function"""
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def norm_pdf(x: float) -> float:
    """Standard normal probability density function"""
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def black_scholes_price(S: float, K: float, T: float, r: float, sigma: float, option_type: str = 'CE') -> float:
    """Calculate Black-Scholes option price"""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return max(0, (S - K) if option_type == 'CE' else (K - S))
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    if option_type == 'CE':
        return S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
    else:
        return K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)


def calculate_greeks(S: float, K: float, T: float, r: float, sigma: float, option_type: str = 'CE') -> Dict:
    """Calculate option greeks: Delta, Gamma, Theta, Vega, Rho"""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        intrinsic = max(0, (S - K) if option_type == 'CE' else (K - S))
        delta = 1.0 if (option_type == 'CE' and S > K) else (-1.0 if option_type == 'PE' and K > S else 0.0)
        return {'delta': delta, 'gamma': 0, 'theta': 0, 'vega': 0, 'rho': 0, 'price': intrinsic}

    sqrt_T = math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    # Price
    if option_type == 'CE':
        price = S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)
        delta = norm_cdf(d1)
        rho = K * T * math.exp(-r * T) * norm_cdf(d2) / 100
    else:
        price = K * math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1)
        delta = norm_cdf(d1) - 1
        rho = -K * T * math.exp(-r * T) * norm_cdf(-d2) / 100

    # Gamma (same for CE and PE)
    gamma = norm_pdf(d1) / (S * sigma * sqrt_T)

    # Theta (per day)
    theta_common = -(S * norm_pdf(d1) * sigma) / (2 * sqrt_T)
    if option_type == 'CE':
        theta = (theta_common - r * K * math.exp(-r * T) * norm_cdf(d2)) / 365
    else:
        theta = (theta_common + r * K * math.exp(-r * T) * norm_cdf(-d2)) / 365

    # Vega (per 1% move in volatility)
    vega = S * norm_pdf(d1) * sqrt_T / 100

    return {
        'delta': round(delta, 4),
        'gamma': round(gamma, 6),
        'theta': round(theta, 2),
        'vega': round(vega, 2),
        'rho': round(rho, 4),
        'price': round(price, 2),
    }


def implied_volatility(market_price: float, S: float, K: float, T: float, r: float, option_type: str = 'CE', max_iter: int = 100) -> float:
    """Calculate implied volatility using Newton-Raphson method"""
    if market_price <= 0 or T <= 0:
        return 0
    sigma = 0.3  # Initial guess
    for _ in range(max_iter):
        bs_price = black_scholes_price(S, K, T, r, sigma, option_type)
        diff = bs_price - market_price
        if abs(diff) < 0.01:
            return round(sigma * 100, 2)
        sqrt_T = math.sqrt(T)
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
        vega = S * norm_pdf(d1) * sqrt_T
        if vega < 1e-8:
            break
        sigma -= diff / vega
        sigma = max(0.01, min(sigma, 5.0))
    return round(sigma * 100, 2)


class OptionChainService:
    def __init__(self):
        self.cache = {}
        self.cache_time = {}

    def get_instruments(self) -> Dict:
        """Return all supported option chain instruments"""
        return {k: {**v} for k, v in OPTION_INSTRUMENTS.items()}

    def generate_option_chain(self, instrument: str, spot_price: float = 0, num_strikes: int = 15, expiry_days: int = 7) -> Dict:
        """Generate option chain with greeks for an instrument"""
        config = OPTION_INSTRUMENTS.get(instrument)
        if not config:
            return {'status': 'error', 'message': f'Unknown instrument: {instrument}'}

        S = spot_price if spot_price > 0 else config['base_price']
        step = config['strike_step']
        T = max(expiry_days / 365, 1 / 365)  # Time to expiry in years
        r = RISK_FREE_RATE

        # Generate strikes around ATM
        atm_strike = round(S / step) * step
        strikes = [atm_strike + (i - num_strikes) * step for i in range(num_strikes * 2 + 1)]

        chain = []
        total_ce_oi = 0
        total_pe_oi = 0
        max_pain_data = {}

        for strike in strikes:
            # Simulate realistic option data
            moneyness = (S - strike) / S
            base_iv_ce = 15 + abs(moneyness) * 60 + (5 if moneyness < 0 else 0)  # IV smile
            base_iv_pe = 15 + abs(moneyness) * 60 + (5 if moneyness > 0 else 0)
            sigma_ce = base_iv_ce / 100
            sigma_pe = base_iv_pe / 100

            ce_greeks = calculate_greeks(S, strike, T, r, sigma_ce, 'CE')
            pe_greeks = calculate_greeks(S, strike, T, r, sigma_pe, 'PE')

            # Simulate OI (higher near ATM)
            atm_distance = abs(strike - atm_strike) / step
            oi_factor = max(0.1, 1 - atm_distance * 0.08)
            ce_oi = int(50000 * oi_factor * (1.2 if strike > atm_strike else 0.8))
            pe_oi = int(50000 * oi_factor * (1.2 if strike < atm_strike else 0.8))
            total_ce_oi += ce_oi
            total_pe_oi += pe_oi

            # Volume simulation
            ce_volume = int(ce_oi * 0.3 * (1 + abs(moneyness) * 2))
            pe_volume = int(pe_oi * 0.3 * (1 + abs(moneyness) * 2))

            # Change simulation
            ce_change = round((ce_greeks['price'] * 0.05 * (1 if S > strike else -1)), 2)
            pe_change = round((pe_greeks['price'] * 0.05 * (-1 if S > strike else 1)), 2)

            row = {
                'strike': strike,
                'is_atm': strike == atm_strike,
                'is_itm_ce': strike < S,
                'is_itm_pe': strike > S,
                'ce': {
                    'ltp': ce_greeks['price'],
                    'change': ce_change,
                    'change_pct': round((ce_change / max(ce_greeks['price'], 0.01)) * 100, 2),
                    'oi': ce_oi,
                    'volume': ce_volume,
                    'iv': round(base_iv_ce, 2),
                    'bid': round(ce_greeks['price'] * 0.98, 2),
                    'ask': round(ce_greeks['price'] * 1.02, 2),
                    **ce_greeks,
                },
                'pe': {
                    'ltp': pe_greeks['price'],
                    'change': pe_change,
                    'change_pct': round((pe_change / max(pe_greeks['price'], 0.01)) * 100, 2),
                    'oi': pe_oi,
                    'volume': pe_volume,
                    'iv': round(base_iv_pe, 2),
                    'bid': round(pe_greeks['price'] * 0.98, 2),
                    'ask': round(pe_greeks['price'] * 1.02, 2),
                    **pe_greeks,
                },
            }
            chain.append(row)

            # Max pain calculation
            max_pain_data[strike] = {'ce_oi': ce_oi, 'pe_oi': pe_oi}

        # Calculate max pain
        max_pain = self._calculate_max_pain(max_pain_data, strikes)

        # PCR ratio
        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 0

        return {
            'status': 'success',
            'instrument': instrument,
            'config': config,
            'spot_price': round(S, 2),
            'atm_strike': atm_strike,
            'expiry_days': expiry_days,
            'chain': chain,
            'summary': {
                'total_ce_oi': total_ce_oi,
                'total_pe_oi': total_pe_oi,
                'pcr': pcr,
                'max_pain': max_pain,
                'iv_atm': chain[num_strikes]['ce']['iv'] if len(chain) > num_strikes else 0,
            },
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }

    def _calculate_max_pain(self, oi_data: Dict, strikes: List[float]) -> float:
        """Calculate max pain strike price"""
        min_pain = float('inf')
        max_pain_strike = strikes[len(strikes) // 2]

        for test_strike in strikes:
            total_pain = 0
            for strike, data in oi_data.items():
                # CE writers profit if expiry below strike
                if test_strike < strike:
                    total_pain += data['ce_oi'] * (strike - test_strike)
                # PE writers profit if expiry above strike
                if test_strike > strike:
                    total_pain += data['pe_oi'] * (test_strike - strike)
            if total_pain < min_pain:
                min_pain = total_pain
                max_pain_strike = test_strike

        return max_pain_strike

    def calculate_single_greeks(self, spot: float, strike: float, days_to_expiry: int, iv: float, option_type: str = 'CE') -> Dict:
        """Calculate greeks for a single option"""
        T = max(days_to_expiry / 365, 1 / 365)
        sigma = iv / 100
        return calculate_greeks(spot, strike, T, RISK_FREE_RATE, sigma, option_type)

    def calculate_iv_from_price(self, market_price: float, spot: float, strike: float, days_to_expiry: int, option_type: str = 'CE') -> Dict:
        """Calculate implied volatility from market price"""
        T = max(days_to_expiry / 365, 1 / 365)
        iv = implied_volatility(market_price, spot, strike, T, RISK_FREE_RATE, option_type)
        return {'iv': iv, 'option_type': option_type}


# Singleton
option_chain_service = OptionChainService()
