"""
Test Tax Reports Feature - Iteration 8
Tests the new Capital Gains Tax Report feature for Indian tax system
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://market-sentinel-68.preview.emergentagent.com').rstrip('/')

class TestTaxReportAPI:
    """Test /api/tax/report endpoint"""
    
    def test_tax_report_returns_success(self):
        """Test that tax report endpoint returns success status"""
        response = requests.get(f"{BASE_URL}/api/tax/report?fy_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        print("PASS: Tax report endpoint returns success status")
    
    def test_tax_report_has_required_fields(self):
        """Test that tax report contains all required fields for UI"""
        response = requests.get(f"{BASE_URL}/api/tax/report?fy_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        report = data['report']
        
        # Required fields for summary cards
        required_fields = [
            'fy_year', 'total_trades', 'net_pnl', 'total_tax_liability', 'turnover',
            'profitable_trades', 'loss_trades', 'win_rate',
            'total_buy_value', 'total_sell_value', 'total_profit', 'total_loss',
            'stcg_tax', 'cess', 'effective_tax_rate',
            'audit_required', 'audit_limit', 'stt_paid',
            'monthly_breakdown'
        ]
        
        for field in required_fields:
            assert field in report, f"Missing required field: {field}"
        
        print(f"PASS: Tax report contains all {len(required_fields)} required fields")
    
    def test_tax_calculation_correctness(self):
        """Test that tax calculation follows Indian tax rules: STCG @15%, Cess @4%"""
        response = requests.get(f"{BASE_URL}/api/tax/report?fy_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        report = data['report']
        
        # Verify STCG is 15% of net profit
        net_pnl = report['net_pnl']
        expected_stcg = round(max(0, net_pnl * 0.15), 2)
        assert abs(report['stcg_tax'] - expected_stcg) < 1, f"STCG tax mismatch: {report['stcg_tax']} vs expected {expected_stcg}"
        
        # Verify Cess is 4% of STCG
        expected_cess = round(report['stcg_tax'] * 0.04, 2)
        assert abs(report['cess'] - expected_cess) < 1, f"Cess mismatch: {report['cess']} vs expected {expected_cess}"
        
        # Verify total tax = STCG + Cess
        expected_total = round(report['stcg_tax'] + report['cess'], 2)
        assert abs(report['total_tax_liability'] - expected_total) < 1, f"Total tax mismatch: {report['total_tax_liability']} vs expected {expected_total}"
        
        print(f"PASS: Tax calculation correct - Net P&L: {net_pnl}, STCG @15%: {report['stcg_tax']}, Cess @4%: {report['cess']}, Total: {report['total_tax_liability']}")
    
    def test_monthly_breakdown_present(self):
        """Test that monthly breakdown is present and has correct structure"""
        response = requests.get(f"{BASE_URL}/api/tax/report?fy_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        report = data['report']
        
        monthly = report.get('monthly_breakdown', {})
        assert isinstance(monthly, dict), "monthly_breakdown should be a dict"
        
        if monthly:
            # Check first month has required fields
            first_month = list(monthly.values())[0]
            required = ['trades', 'profit', 'loss', 'net_pnl', 'turnover', 'stcg_tax', 'cess', 'total_tax']
            for field in required:
                assert field in first_month, f"Monthly data missing field: {field}"
        
        print(f"PASS: Monthly breakdown has {len(monthly)} month(s) with correct structure")
    
    def test_audit_threshold_check(self):
        """Test that audit threshold check works (10 Cr for digital F&O)"""
        response = requests.get(f"{BASE_URL}/api/tax/report?fy_year=2025-26")
        assert response.status_code == 200
        data = response.json()
        report = data['report']
        
        assert report['audit_limit'] == 100000000, "Audit limit should be 10 Cr (100000000)"
        assert 'audit_required' in report, "audit_required field missing"
        
        # Verify audit_required is correct based on turnover
        expected_audit = report['turnover'] > 100000000
        assert report['audit_required'] == expected_audit, f"Audit required mismatch"
        
        print(f"PASS: Audit check correct - Turnover: {report['turnover']}, Limit: {report['audit_limit']}, Audit Required: {report['audit_required']}")
    
    def test_different_fy_years(self):
        """Test report for different financial years"""
        fy_years = ['2025-26', '2024-25', '2023-24']
        
        for fy in fy_years:
            response = requests.get(f"{BASE_URL}/api/tax/report?fy_year={fy}")
            assert response.status_code == 200
            data = response.json()
            assert data['status'] == 'success'
            assert data['report']['fy_year'] == fy
        
        print(f"PASS: Report works for {len(fy_years)} different FY years")


class TestTaxExportExcel:
    """Test /api/tax/export-excel endpoint"""
    
    def test_excel_export_returns_file(self):
        """Test that Excel export returns a valid xlsx file"""
        response = requests.get(f"{BASE_URL}/api/tax/export-excel?fy_year=2025-26")
        assert response.status_code == 200
        
        # Check content type
        assert 'spreadsheetml' in response.headers.get('Content-Type', '') or response.content[:2] == b'PK'
        
        # Check content disposition (filename)
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'Tax_Report_FY_2025-26.xlsx' in content_disp or response.content[:2] == b'PK'
        
        # Verify it's a valid zip/xlsx file (PK signature)
        assert response.content[:2] == b'PK', "Excel file should start with PK signature"
        
        # Verify file has reasonable size
        assert len(response.content) > 1000, "Excel file seems too small"
        
        print(f"PASS: Excel export returns valid xlsx file ({len(response.content)} bytes)")
    
    def test_excel_export_different_fy(self):
        """Test Excel export with different FY year"""
        response = requests.get(f"{BASE_URL}/api/tax/export-excel?fy_year=2024-25")
        assert response.status_code == 200
        assert response.content[:2] == b'PK', "Should return valid xlsx"
        print("PASS: Excel export works for different FY year")


class TestTaxExportPDF:
    """Test /api/tax/export-pdf endpoint"""
    
    def test_pdf_export_returns_file(self):
        """Test that PDF export returns a valid PDF file"""
        response = requests.get(f"{BASE_URL}/api/tax/export-pdf?fy_year=2025-26")
        assert response.status_code == 200
        
        # Check content type
        assert 'pdf' in response.headers.get('Content-Type', '').lower() or response.content[:5] == b'%PDF-'
        
        # Verify it's a valid PDF file
        assert response.content[:5] == b'%PDF-', "PDF file should start with %PDF- signature"
        
        # Verify file has reasonable size
        assert len(response.content) > 500, "PDF file seems too small"
        
        print(f"PASS: PDF export returns valid PDF file ({len(response.content)} bytes)")
    
    def test_pdf_export_different_fy(self):
        """Test PDF export with different FY year"""
        response = requests.get(f"{BASE_URL}/api/tax/export-pdf?fy_year=2024-25")
        assert response.status_code == 200
        assert response.content[:5] == b'%PDF-', "Should return valid PDF"
        print("PASS: PDF export works for different FY year")


class TestNoTradesScenario:
    """Test tax report when no trades exist for the FY"""
    
    def test_empty_fy_returns_zeros(self):
        """Test that FY with no trades returns zero values"""
        # Use a far future FY that likely has no trades
        response = requests.get(f"{BASE_URL}/api/tax/report?fy_year=2027-28")
        assert response.status_code == 200
        data = response.json()
        
        report = data['report']
        assert report['total_trades'] == 0
        assert report['net_pnl'] == 0
        assert report['total_tax_liability'] == 0
        assert report['audit_required'] == False
        
        print("PASS: Empty FY returns zero values correctly")


class TestOtherTabsRegression:
    """Verify other tabs/features still work (no regression)"""
    
    def test_dashboard_portfolio(self):
        """Test dashboard portfolio endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/portfolio")
        assert response.status_code == 200
        data = response.json()
        assert 'current_value' in data
        assert 'total_pnl' in data
        print("PASS: Portfolio endpoint works (no regression)")
    
    def test_health_check(self):
        """Test health check endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        print("PASS: Health check works (no regression)")
    
    def test_trades_history(self):
        """Test trade history endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/trades/history?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        assert 'trades' in data
        print("PASS: Trade history endpoint works (no regression)")
    
    def test_signals_endpoint(self):
        """Test signals endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/signals/latest?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'success'
        print("PASS: Signals endpoint works (no regression)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
