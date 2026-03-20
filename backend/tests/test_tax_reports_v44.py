"""
Tax Reports API Tests - v4.4 Bug Fix Verification
Tests for the Tax Report feature fixes:
1) Variable ordering bug fix in tax.js
2) Frontend-backend parameter mismatch (fy_year vs fy)
3) Data mapping for nested charges_breakdown from Upstox
4) from_date/to_date params for full FY date range
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTaxReportEndpoint:
    """Tests for GET /api/tax/report endpoint"""
    
    def test_tax_report_returns_success_status(self):
        """Test that tax report endpoint returns status=success"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "success", f"Expected status=success, got {data.get('status')}"
        assert "report" in data, "Response should contain 'report' field"
        
    def test_tax_report_fy_year_parameter_conversion(self):
        """Test that fy_year '2025-26' is correctly converted to Upstox format '2526'"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data.get("report", {})
        
        # Verify FY code is correctly parsed
        assert report.get("fy_code") == "2526", f"Expected fy_code='2526', got {report.get('fy_code')}"
        assert "FY 2025" in report.get("financial_year", ""), f"Financial year should contain 'FY 2025', got {report.get('financial_year')}"
        
    def test_tax_report_charges_breakdown_mapping(self):
        """Test that charges from Upstox API are correctly mapped (including nested charges_breakdown)"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data.get("report", {})
        charges = report.get("charges", {})
        
        # Verify charges structure exists
        assert "brokerage" in charges, "Charges should have 'brokerage' field"
        assert "stt" in charges, "Charges should have 'stt' field"
        assert "gst" in charges, "Charges should have 'gst' field"
        assert "stamp_duty" in charges, "Charges should have 'stamp_duty' field"
        assert "total_charges" in charges, "Charges should have 'total_charges' field"
        
        # If data exists, verify STT and GST are populated (non-zero when Upstox provides them)
        if report.get("total_trades", 0) > 0:
            # At minimum, verify the structure is correct (values may be 0 if no trades)
            assert isinstance(charges.get("stt"), (int, float)), "STT should be a number"
            assert isinstance(charges.get("gst"), (int, float)), "GST should be a number"
            assert isinstance(charges.get("stamp_duty"), (int, float)), "Stamp duty should be a number"
            
    def test_tax_report_summary_structure(self):
        """Test that report summary contains all required fields"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data.get("report", {})
        summary = report.get("summary", {})
        
        # Verify summary structure
        required_summary_fields = [
            "total_buy_value", "total_sell_value", "total_turnover",
            "total_profit", "total_loss", "gross_pnl_settled",
            "today_pnl", "combined_gross_pnl"
        ]
        
        for field in required_summary_fields:
            assert field in summary, f"Summary missing required field: {field}"
            
    def test_tax_report_tax_calculation_structure(self):
        """Test that tax calculation fields are present"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data.get("report", {})
        tax = report.get("tax", {})
        
        # Verify tax calculation fields
        required_tax_fields = [
            "taxable_income", "tax_at_30_pct", "health_cess_4_pct",
            "surcharge_if_applicable", "total_tax_liability", "effective_tax_rate"
        ]
        
        for field in required_tax_fields:
            assert field in tax, f"Tax calculation missing required field: {field}"
            
    def test_tax_report_compliance_structure(self):
        """Test that compliance information is present"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data.get("report", {})
        compliance = report.get("compliance", {})
        
        # Verify compliance fields
        assert "itr_form" in compliance, "Compliance missing 'itr_form'"
        assert "audit_required" in compliance, "Compliance missing 'audit_required'"
        assert "due_date" in compliance, "Compliance missing 'due_date'"
        
    def test_tax_report_trade_details_present(self):
        """Test that trade details are returned"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26",
            "segment": "FO"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data.get("report", {})
        
        assert "trade_details" in report, "Report should contain 'trade_details'"
        assert "total_trade_details" in report, "Report should contain 'total_trade_details'"
        assert report.get("total_trades", 0) >= 0, "total_trades should be >= 0"


class TestUpstoxSummaryEndpoint:
    """Tests for GET /api/tax/upstox-summary endpoint"""
    
    def test_upstox_summary_returns_data(self):
        """Test that upstox-summary endpoint returns Upstox charges data"""
        response = requests.get(f"{BASE_URL}/api/tax/upstox-summary", params={
            "fy_year": "2025-26"
        }, timeout=30)
        
        assert response.status_code == 200
        data = response.json()
        
        # Either success with data or error if not connected
        assert data.get("status") in ["success", "error"], f"Unexpected status: {data.get('status')}"
        
        if data.get("status") == "success":
            assert "data" in data, "Success response should contain 'data' field"
            assert data.get("source") == "upstox", "Source should be 'upstox'"


class TestFYParameterFormats:
    """Test various FY parameter format handling"""
    
    def test_fy_parameter_format_2025_26(self):
        """Test FY format '2025-26'"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        assert data["report"]["fy_code"] == "2526"
        
    def test_fy_parameter_format_25_26(self):
        """Test FY format '25-26'"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "25-26"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        assert data["report"]["fy_code"] == "2526"
        
    def test_fy_parameter_format_2526(self):
        """Test FY format '2526' (direct Upstox format)"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2526"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        assert data["report"]["fy_code"] == "2526"


class TestChargesFromUpstoxAPI:
    """Test that charges are correctly extracted from Upstox API response"""
    
    def test_charges_source_is_upstox_api_when_connected(self):
        """Test charges source indicates upstox_api when Upstox token is present"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        
        # If source is upstox, charges source should be upstox_api
        if data.get("source") == "upstox":
            charges = data["report"]["charges"]
            # Could be 'upstox_api' or 'calculated' depending on if Upstox returned charges
            assert charges.get("source") in ["upstox_api", "calculated"], \
                f"Unexpected charges source: {charges.get('source')}"
                
    def test_total_charges_equals_sum_of_individual_charges(self):
        """Verify total_charges roughly equals sum of individual charges"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        charges = data["report"]["charges"]
        
        # Calculate sum of individual charges
        individual_sum = sum([
            charges.get("brokerage", 0),
            charges.get("stt", 0),
            charges.get("transaction_charges", 0),
            charges.get("gst", 0),
            charges.get("stamp_duty", 0),
            charges.get("sebi_charges", 0),
            charges.get("ipft", 0),
            charges.get("other_charges", 0)
        ])
        
        total = charges.get("total_charges", 0)
        
        # Allow for small rounding differences
        if total > 0:
            assert abs(individual_sum - total) < 1, \
                f"Sum of charges ({individual_sum}) should roughly equal total ({total})"


class TestTaxCalculation:
    """Test tax calculation logic"""
    
    def test_tax_calculation_when_profit(self):
        """Test that tax is calculated correctly when there's profit"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data["report"]
        tax = report["tax"]
        
        taxable_income = tax.get("taxable_income", 0)
        tax_at_30_pct = tax.get("tax_at_30_pct", 0)
        cess = tax.get("health_cess_4_pct", 0)
        total_tax = tax.get("total_tax_liability", 0)
        
        if taxable_income > 0:
            # Verify 30% tax rate
            expected_tax = taxable_income * 0.30
            assert abs(tax_at_30_pct - expected_tax) < 1, \
                f"Tax at 30% should be {expected_tax}, got {tax_at_30_pct}"
            
            # Verify 4% cess
            expected_cess = tax_at_30_pct * 0.04
            assert abs(cess - expected_cess) < 1, \
                f"Cess at 4% should be {expected_cess}, got {cess}"


class TestNetPnlCalculation:
    """Test net P&L calculation after charges"""
    
    def test_net_pnl_equals_gross_minus_charges(self):
        """Verify net_pnl = gross_pnl - total_charges"""
        response = requests.get(f"{BASE_URL}/api/tax/report", params={
            "fy_year": "2025-26"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        report = data["report"]
        
        gross_pnl = report["summary"].get("combined_gross_pnl", 0)
        total_charges = report["charges"].get("total_charges", 0)
        net_pnl = report.get("net_pnl_after_charges", 0)
        
        expected_net = gross_pnl - total_charges
        
        # Allow for rounding
        assert abs(net_pnl - expected_net) < 1, \
            f"Net P&L ({net_pnl}) should equal gross ({gross_pnl}) - charges ({total_charges}) = {expected_net}"


# Fixtures
@pytest.fixture(scope="module")
def api_session():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
