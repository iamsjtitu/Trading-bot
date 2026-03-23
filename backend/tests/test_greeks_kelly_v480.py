"""
Test Suite for Options Greeks & Kelly Criterion Features (v4.8.0)
Tests the new AI Guard features: kelly_sizing and greeks_filter
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://news-driven-options-1.preview.emergentagent.com')

class TestHealthAndRoutes:
    """Health check and route verification"""
    
    def test_health_endpoint(self):
        """GET /api/health - should return status healthy with routes_loaded=12"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert data['routes_loaded'] == 12
        print(f"✓ Health check passed: {data['routes_loaded']} routes loaded, version {data.get('version')}")


class TestAIGuardsStatus:
    """AI Guards status endpoint tests"""
    
    def test_ai_guards_status_returns_all_8_guards(self):
        """GET /api/ai-guards/status - should return all 8 guards"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        guards = data['guards']
        expected_guards = [
            'multi_timeframe', 'market_regime_filter', 'trailing_stop',
            'multi_source_verification', 'time_of_day_filter', 'max_daily_loss',
            'kelly_sizing', 'greeks_filter'
        ]
        
        for guard in expected_guards:
            assert guard in guards, f"Missing guard: {guard}"
            assert 'enabled' in guards[guard], f"Guard {guard} missing 'enabled' field"
        
        print(f"✓ All 8 guards present: {list(guards.keys())}")
    
    def test_kelly_sizing_guard_has_required_fields(self):
        """kelly_sizing guard should have mode, win_rate, total_trades, consecutive_losses"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        data = response.json()
        kelly = data['guards']['kelly_sizing']
        
        assert 'enabled' in kelly
        assert 'mode' in kelly
        assert 'win_rate' in kelly
        assert 'total_trades' in kelly
        assert 'consecutive_losses' in kelly
        assert 'description' in kelly
        
        print(f"✓ Kelly sizing guard: mode={kelly['mode']}, win_rate={kelly['win_rate']}%, trades={kelly['total_trades']}")
    
    def test_greeks_filter_guard_has_required_fields(self):
        """greeks_filter guard should have enabled and description"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        data = response.json()
        greeks = data['guards']['greeks_filter']
        
        assert 'enabled' in greeks
        assert 'description' in greeks
        
        print(f"✓ Greeks filter guard: enabled={greeks['enabled']}")


class TestAIGuardsToggle:
    """AI Guards toggle functionality tests"""
    
    def test_toggle_kelly_sizing_off_then_on(self):
        """POST /api/ai-guards/update - toggle kelly_sizing OFF then ON"""
        # Toggle OFF
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={"kelly_sizing": False},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['kelly_sizing'] == False
        
        # Verify OFF
        status_resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert status_resp.json()['guards']['kelly_sizing']['enabled'] == False
        print("✓ Kelly sizing toggled OFF")
        
        # Toggle ON
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={"kelly_sizing": True},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['kelly_sizing'] == True
        
        # Verify ON
        status_resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert status_resp.json()['guards']['kelly_sizing']['enabled'] == True
        print("✓ Kelly sizing toggled ON")
    
    def test_toggle_greeks_filter_off_then_on(self):
        """POST /api/ai-guards/update - toggle greeks_filter OFF then ON"""
        # Toggle OFF
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={"greeks_filter": False},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['greeks_filter'] == False
        
        # Verify OFF
        status_resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert status_resp.json()['guards']['greeks_filter']['enabled'] == False
        print("✓ Greeks filter toggled OFF")
        
        # Toggle ON
        response = requests.post(
            f"{BASE_URL}/api/ai-guards/update",
            json={"greeks_filter": True},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['ai_guards']['greeks_filter'] == True
        
        # Verify ON
        status_resp = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        assert status_resp.json()['guards']['greeks_filter']['enabled'] == True
        print("✓ Greeks filter toggled ON")


class TestPositionSizing:
    """Kelly Criterion position sizing endpoint tests"""
    
    def test_position_sizing_returns_kelly_data(self):
        """GET /api/position-sizing - returns kelly, suggestion, stats, streak, drawdown, capital_curve"""
        response = requests.get(f"{BASE_URL}/api/position-sizing", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        # Check all required fields
        assert 'kelly' in data
        assert 'suggestion' in data
        assert 'stats' in data
        assert 'streak' in data
        assert 'drawdown' in data
        assert 'capital_curve' in data
        
        # Kelly fields
        kelly = data['kelly']
        assert 'full_kelly_pct' in kelly
        assert 'adjusted_kelly_pct' in kelly
        assert 'final_kelly_pct' in kelly
        assert 'mode' in kelly
        
        # Suggestion fields
        suggestion = data['suggestion']
        assert 'amount' in suggestion
        assert 'min_amount' in suggestion
        assert 'max_amount' in suggestion
        assert 'capital' in suggestion
        assert 'pct_of_capital' in suggestion
        
        # Stats fields
        stats = data['stats']
        assert 'total_trades' in stats
        assert 'wins' in stats
        assert 'losses' in stats
        assert 'win_rate' in stats
        
        # Streak fields
        streak = data['streak']
        assert 'consecutive_losses' in streak
        assert 'consecutive_wins' in streak
        assert 'status' in streak
        
        # Drawdown fields
        drawdown = data['drawdown']
        assert 'max_drawdown_pct' in drawdown
        assert 'current_drawdown_pct' in drawdown
        
        print(f"✓ Position sizing: kelly={kelly['final_kelly_pct']}%, mode={kelly['mode']}, suggested=₹{suggestion['amount']}")
    
    def test_position_sizing_mode_change_conservative(self):
        """POST /api/position-sizing/mode - change to conservative"""
        response = requests.post(
            f"{BASE_URL}/api/position-sizing/mode",
            json={"mode": "conservative"},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['kelly']['mode'] == 'conservative'
        print("✓ Mode changed to conservative")
    
    def test_position_sizing_mode_change_balanced(self):
        """POST /api/position-sizing/mode - change to balanced"""
        response = requests.post(
            f"{BASE_URL}/api/position-sizing/mode",
            json={"mode": "balanced"},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['kelly']['mode'] == 'balanced'
        print("✓ Mode changed to balanced")
    
    def test_position_sizing_mode_change_aggressive(self):
        """POST /api/position-sizing/mode - change to aggressive"""
        response = requests.post(
            f"{BASE_URL}/api/position-sizing/mode",
            json={"mode": "aggressive"},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert data['kelly']['mode'] == 'aggressive'
        print("✓ Mode changed to aggressive")
        
        # Reset to conservative
        requests.post(f"{BASE_URL}/api/position-sizing/mode", json={"mode": "conservative"}, timeout=10)


class TestOptionsGreeks:
    """Options Greeks calculation endpoint tests"""
    
    def test_greeks_endpoint_returns_delta_gamma_theta_vega(self):
        """GET /api/options/greeks - returns greeks (delta, gamma, theta, vega) and IV analysis"""
        response = requests.get(
            f"{BASE_URL}/api/options/greeks",
            params={"spot": 24000, "strike": 24100, "type": "CE", "premium": 150},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        # Check option info
        assert 'option' in data
        assert data['option']['strike'] == 24100
        assert data['option']['type'] == 'CE'
        assert data['option']['spot'] == 24000
        
        # Check greeks
        assert 'greeks' in data
        greeks = data['greeks']
        assert 'delta' in greeks
        assert 'gamma' in greeks
        assert 'theta' in greeks
        assert 'vega' in greeks
        
        # Delta should be between 0 and 1 for CE
        assert 0 <= greeks['delta'] <= 1
        # Theta should be negative (time decay)
        assert greeks['theta'] < 0
        
        # Check IV
        assert 'iv' in data
        assert 'implied_volatility' in data['iv']
        assert 'bs_price' in data['iv']
        
        # Check analysis
        assert 'analysis' in data
        assert 'iv_signal' in data['analysis']
        assert 'theta_signal' in data['analysis']
        assert 'delta_signal' in data['analysis']
        assert 'score' in data['analysis']
        
        print(f"✓ Greeks: delta={greeks['delta']:.4f}, gamma={greeks['gamma']:.6f}, theta={greeks['theta']:.2f}, vega={greeks['vega']:.2f}")
        print(f"✓ IV: {data['iv']['implied_volatility']}%, BS Price: {data['iv']['bs_price']}")
    
    def test_greeks_endpoint_for_put_option(self):
        """GET /api/options/greeks - test PE option"""
        response = requests.get(
            f"{BASE_URL}/api/options/greeks",
            params={"spot": 24000, "strike": 23900, "type": "PE", "premium": 100},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        greeks = data['greeks']
        # Delta should be negative for PE
        assert greeks['delta'] < 0
        print(f"✓ PE Greeks: delta={greeks['delta']:.4f}")


class TestOptionsChainGreeks:
    """Options chain Greeks endpoint tests"""
    
    def test_chain_greeks_returns_11_strikes(self):
        """GET /api/options/chain-greeks - returns option chain with greeks for 11 strikes around ATM"""
        response = requests.get(
            f"{BASE_URL}/api/options/chain-greeks",
            params={"instrument": "NIFTY50", "spot": 24000},
            timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        assert 'instrument' in data
        assert data['instrument'] == 'NIFTY50'
        assert 'spot_price' in data
        assert 'atm_strike' in data
        assert 'chain' in data
        
        chain = data['chain']
        assert len(chain) == 11, f"Expected 11 strikes, got {len(chain)}"
        
        # Check each strike has CE and PE greeks
        for item in chain:
            assert 'strike' in item
            assert 'moneyness' in item
            assert 'ce' in item
            assert 'pe' in item
            
            # CE greeks
            assert 'delta' in item['ce']
            assert 'gamma' in item['ce']
            assert 'theta' in item['ce']
            assert 'vega' in item['ce']
            
            # PE greeks
            assert 'delta' in item['pe']
            assert 'gamma' in item['pe']
            assert 'theta' in item['pe']
            assert 'vega' in item['pe']
        
        # Find ATM strike
        atm = [s for s in chain if s['is_atm']]
        assert len(atm) == 1, "Should have exactly one ATM strike"
        
        print(f"✓ Chain: {len(chain)} strikes, ATM={data['atm_strike']}, spot={data['spot_price']}")


class TestIVAnalysis:
    """IV Analysis endpoint tests"""
    
    def test_iv_analysis_returns_summary_and_portfolio_greeks(self):
        """GET /api/options/iv-analysis - returns IV summary, portfolio greeks, and position analysis"""
        response = requests.get(f"{BASE_URL}/api/options/iv-analysis", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        
        # IV Summary
        assert 'iv_summary' in data
        iv_summary = data['iv_summary']
        assert 'current_iv' in iv_summary
        assert 'iv_rank' in iv_summary
        assert 'iv_percentile' in iv_summary
        assert 'signal' in iv_summary
        assert 'recommendation' in iv_summary
        
        # Portfolio Greeks
        assert 'portfolio_greeks' in data
        portfolio = data['portfolio_greeks']
        assert 'total_delta' in portfolio
        assert 'total_daily_theta' in portfolio
        assert 'net_direction' in portfolio
        
        # Positions
        assert 'positions' in data
        
        print(f"✓ IV Analysis: IV={iv_summary['current_iv']}%, Rank={iv_summary['iv_rank']}%, Signal={iv_summary['signal']}")


class TestMaxDailyLossGuard:
    """Max Daily Loss guard tests"""
    
    def test_max_daily_loss_always_on(self):
        """max_daily_loss guard should always be enabled"""
        response = requests.get(f"{BASE_URL}/api/ai-guards/status", timeout=10)
        data = response.json()
        
        max_loss = data['guards']['max_daily_loss']
        assert max_loss['enabled'] == True
        assert 'today_loss' in max_loss
        assert 'limit' in max_loss
        assert 'blocked' in max_loss
        
        print(f"✓ Max Daily Loss: today_loss=₹{max_loss['today_loss']}, limit=₹{max_loss['limit']}, blocked={max_loss['blocked']}")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
