/**
 * Tax Reporting Routes - Fetches ACTUAL data from Upstox API
 * F&O Tax Reporting for Indian Tax Laws (FY 2025-26)
 */
const { Router } = require('express');
const axios = require('axios');

module.exports = function (db) {
  const router = Router();

  function getActiveBrokerToken() {
    const s = db.data?.settings || {};
    const broker = s.active_broker || s.broker?.name || 'upstox';
    return s.broker?.[`${broker}_token`] || s.broker?.access_token || '';
  }

  function getHeaders(token) {
    return { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' };
  }

  /** Parse FY from various frontend formats: "2025-26", "2526", "25-26" -> "2526" */
  function parseFY(raw) {
    if (!raw) return '2526';
    const s = String(raw).replace(/\s/g, '');
    // "2025-26" -> "2526"
    const m4 = s.match(/^(\d{4})-(\d{2})$/);
    if (m4) return m4[1].slice(2) + m4[2];
    // "25-26" -> "2526"
    const m2 = s.match(/^(\d{2})-(\d{2})$/);
    if (m2) return m2[1] + m2[2];
    // Already "2526"
    if (/^\d{4}$/.test(s)) return s;
    return '2526';
  }

  /** Get FY date range in dd-mm-yyyy format for Upstox API */
  function getFYDateRange(fyCode) {
    const startYear = 2000 + parseInt(fyCode.substring(0, 2));
    const endYear = 2000 + parseInt(fyCode.substring(2, 4));
    return {
      from_date: `01-04-${startYear}`,
      to_date: `31-03-${endYear}`,
      startYear,
      endYear,
    };
  }

  // GET /api/tax/report - Full tax report from Upstox
  router.get('/api/tax/report', async (req, res) => {
    const token = getActiveBrokerToken();
    const fy = parseFY(req.query.fy || req.query.fy_year || req.query.financial_year);
    const segment = req.query.segment || 'FO';
    const { from_date, to_date, startYear, endYear } = getFYDateRange(fy);

    console.log(`[Tax] Token present: ${!!token}, len: ${(token || '').length}, FY: ${fy}, dates: ${from_date} to ${to_date}`);

    if (!token) {
      console.log('[Tax] No broker token found - using local fallback');
      return getLocalTaxReport(req, res, fy, segment);
    }

    try {
      const headers = getHeaders(token);

      // Step 1: Get metadata to know total trades and page size limit
      let totalTradesExpected = 0;
      let pageSizeLimit = 500;
      try {
        const metaResp = await axios.get('https://api.upstox.com/v2/trade/profit-loss/metadata', {
          headers, params: { segment, financial_year: fy }, timeout: 15000
        });
        if (metaResp.data?.status === 'success' && metaResp.data?.data) {
          pageSizeLimit = metaResp.data.data.page_size_limit || 500;
          totalTradesExpected = metaResp.data.data.trades_count || 0;
          console.log(`[Tax] Metadata: pageSizeLimit=${pageSizeLimit}, trades_count=${totalTradesExpected}`);
        }
      } catch (e) { console.log(`[Tax] Metadata fetch failed: ${e.message}`); }

      // Use max allowed page size to minimize API calls
      const pageSize = Math.min(pageSizeLimit, 5000);

      // Step 2: Fetch ALL P&L data pages with from_date/to_date
      let allTrades = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const dataResp = await axios.get('https://api.upstox.com/v2/trade/profit-loss/data', {
            headers,
            params: {
              segment,
              financial_year: fy,
              page_number: String(page),
              page_size: String(pageSize),
              from_date,
              to_date,
            },
            timeout: 30000
          });
          if (dataResp.data?.status === 'success' && dataResp.data?.data) {
            const trades = Array.isArray(dataResp.data.data) ? dataResp.data.data : [];
            allTrades = allTrades.concat(trades);
            console.log(`[Tax] Page ${page}: ${trades.length} trades (total so far: ${allTrades.length})`);
            hasMore = trades.length >= pageSize;
            page++;
          } else {
            console.log(`[Tax] Page ${page}: no success response`, dataResp.data?.status);
            hasMore = false;
          }
        } catch (e) {
          console.error(`[Tax] P&L data page ${page} failed: ${e.message}`);
          hasMore = false;
        }
        if (page > 100) break;
      }

      console.log(`[Tax] Total trades fetched: ${allTrades.length} (expected: ${totalTradesExpected})`);

      // Step 3: Fetch today's live positions (may not be in settled P&L yet)
      let todayRealizedPnl = 0;
      let todayPositions = [];
      try {
        const posResp = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', { headers, timeout: 15000 });
        if (posResp.data?.status === 'success') {
          for (const pos of (posResp.data.data || [])) {
            todayRealizedPnl += pos.pnl || pos.realised || 0;
            todayPositions.push({
              symbol: pos.tradingsymbol || pos.trading_symbol || '?',
              quantity: pos.quantity || 0,
              pnl: pos.pnl || 0,
              realized: pos.realised || 0,
              unrealized: pos.unrealised || 0,
            });
          }
        }
      } catch (e) { console.log(`[Tax] Today positions fetch: ${e.message}`); }

      // Step 4: Calculate P&L from settled trades
      let totalProfit = 0;
      let totalLoss = 0;
      let totalTurnover = 0;
      let totalPnl = 0;
      let totalBuyValue = 0;
      let totalSellValue = 0;
      const tradeDetails = [];

      for (const trade of allTrades) {
        const buyVal = trade.buy_amount || trade.buy_value || 0;
        const sellVal = trade.sell_amount || trade.sell_value || 0;
        const pnl = (trade.profit_and_loss != null && trade.profit_and_loss !== 0) ? trade.profit_and_loss : (sellVal - buyVal);
        const absProfit = Math.abs(pnl);

        totalTurnover += absProfit;
        totalBuyValue += buyVal;
        totalSellValue += sellVal;
        totalPnl += pnl;
        if (pnl > 0) totalProfit += pnl;
        else totalLoss += Math.abs(pnl);

        tradeDetails.push({
          symbol: trade.scrip_name || trade.tradingsymbol || trade.symbol || '?',
          trade_type: trade.trade_type || (trade.quantity > 0 ? 'BUY' : 'SELL'),
          buy_date: trade.buy_date || trade.trade_date || '',
          sell_date: trade.sell_date || trade.expiry_date || '',
          buy_price: trade.buy_average || trade.buy_price || 0,
          sell_price: trade.sell_average || trade.sell_price || 0,
          quantity: trade.quantity || 0,
          buy_amount: Math.round(buyVal * 100) / 100,
          sell_amount: Math.round(sellVal * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
        });
      }

      // Step 5: Fetch charges from Upstox API
      let charges = { brokerage: 0, stt: 0, transaction_charges: 0, gst: 0, stamp_duty: 0, sebi_charges: 0, ipft: 0, total: 0 };
      let chargesSource = 'calculated';
      try {
        const chargesResp = await axios.get('https://api.upstox.com/v2/trade/profit-loss/charges', {
          headers, params: { segment, financial_year: fy }, timeout: 15000
        });
        if (chargesResp.data?.status === 'success' && chargesResp.data?.data) {
          const cd = chargesResp.data.data;
          const cb = cd.charges_breakdown || cd;
          const taxes = cb.taxes || {};
          const chg = cb.charges || {};
          const apiTotal = cb.total || cd.total || 0;
          if (apiTotal > 0) {
            charges = {
              brokerage: cb.brokerage || 0,
              stt: taxes.stt || cd.stt_total || 0,
              transaction_charges: chg.transaction || cd.exchange_turnover_charge || 0,
              gst: taxes.gst || cd.gst || 0,
              stamp_duty: taxes.stamp_duty || cd.stamp_duty || 0,
              sebi_charges: chg.sebi_turnover || cd.sebi_turnover_fee || 0,
              ipft: chg.ipft || 0,
              other_charges: chg.others || 0,
              total: apiTotal,
            };
            chargesSource = 'upstox_api';
            console.log(`[Tax] Charges from API: Total=${charges.total}, Brokerage=${charges.brokerage}, STT=${charges.stt}, GST=${charges.gst}`);
          }
        }
      } catch (e) { console.error(`[Tax] Charges fetch failed: ${e.message}`); }

      // If Upstox API returned 0 charges, calculate manually
      if (charges.total === 0 && allTrades.length > 0) {
        const brokeragePerOrder = db.data?.settings?.risk?.brokerage_per_order || 20;
        const totalOrders = allTrades.length * 2;
        const todayOrders = todayPositions.length * 2;
        const brokerage = (totalOrders + todayOrders) * brokeragePerOrder;
        const totalTurnoverForCharges = totalBuyValue + totalSellValue;
        const stt = Math.round(totalSellValue * 0.000625 * 100) / 100;
        const txnCharges = Math.round(totalTurnoverForCharges * 0.0005 * 100) / 100;
        const gst = Math.round((brokerage + txnCharges) * 0.18 * 100) / 100;
        const stampDuty = Math.round(totalBuyValue * 0.00003 * 100) / 100;
        const sebi = Math.round(totalTurnoverForCharges * 0.000001 * 100) / 100;

        charges = {
          brokerage: Math.round(brokerage * 100) / 100,
          stt,
          transaction_charges: txnCharges,
          gst,
          stamp_duty: stampDuty,
          sebi_charges: sebi,
          ipft: 0,
          total: Math.round((brokerage + stt + txnCharges + gst + stampDuty + sebi) * 100) / 100,
        };
        chargesSource = `calculated (${brokeragePerOrder}/order x ${totalOrders + todayOrders} orders)`;
        console.log(`[Tax] Charges calculated: ${charges.total}`);
      }

      // Step 6: Tax calculation
      const todayDateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).split('/').join('-');
      const lastTradeDate = allTrades.length > 0 ? (allTrades[allTrades.length - 1].sell_date || '') : '';
      const isTodayInSettled = lastTradeDate === todayDateStr;
      const unsettledTodayPnl = isTodayInSettled ? 0 : Math.round(todayRealizedPnl * 100) / 100;
      const combinedGrossPnl = Math.round((totalPnl + unsettledTodayPnl) * 100) / 100;

      const totalCharges = charges.total || 0;
      const netPnl = Math.round((combinedGrossPnl - totalCharges) * 100) / 100;
      const taxableIncome = Math.max(0, netPnl);

      // F&O = non-speculative business income, taxed at slab rates
      // Using 30% as default highest slab (user can override)
      const taxRate = 0.30;
      const taxAmount = Math.round(taxableIncome * taxRate * 100) / 100;
      const cess = Math.round(taxAmount * 0.04 * 100) / 100;
      const surcharge = taxableIncome > 5000000 ? Math.round(taxAmount * 0.10 * 100) / 100 : 0;
      const totalTax = Math.round((taxAmount + cess + surcharge) * 100) / 100;

      // Advance tax schedule
      const advanceTax = [
        { due_date: `15 Jun ${startYear}`, pct: 15, amount: Math.round(totalTax * 0.15) },
        { due_date: `15 Sep ${startYear}`, pct: 45, amount: Math.round(totalTax * 0.45) },
        { due_date: `15 Dec ${startYear}`, pct: 75, amount: Math.round(totalTax * 0.75) },
        { due_date: `15 Mar ${endYear}`, pct: 100, amount: totalTax },
      ];

      const auditRequired = totalTurnover > 100000000;
      const itrForm = totalTurnover > 0 ? 'ITR-3' : 'ITR-2';

      res.json({
        status: 'success',
        source: 'upstox',
        report: {
          financial_year: `FY ${startYear}-${endYear}`,
          fy_code: fy,
          segment,
          total_trades: allTrades.length,
          expected_trades: totalTradesExpected,
          summary: {
            total_buy_value: Math.round(totalBuyValue * 100) / 100,
            total_sell_value: Math.round(totalSellValue * 100) / 100,
            total_turnover: Math.round(totalTurnover * 100) / 100,
            total_profit: Math.round(totalProfit * 100) / 100,
            total_loss: Math.round(totalLoss * 100) / 100,
            gross_pnl_settled: Math.round(totalPnl * 100) / 100,
            today_pnl: unsettledTodayPnl,
            combined_gross_pnl: combinedGrossPnl,
          },
          today_positions: todayPositions,
          charges: {
            source: chargesSource,
            brokerage: Math.round(charges.brokerage * 100) / 100,
            stt: Math.round((charges.stt || 0) * 100) / 100,
            transaction_charges: Math.round((charges.transaction_charges || 0) * 100) / 100,
            gst: Math.round((charges.gst || 0) * 100) / 100,
            stamp_duty: Math.round((charges.stamp_duty || 0) * 100) / 100,
            sebi_charges: Math.round((charges.sebi_charges || 0) * 100) / 100,
            ipft: Math.round((charges.ipft || 0) * 100) / 100,
            other_charges: Math.round((charges.other_charges || 0) * 100) / 100,
            total_charges: Math.round(totalCharges * 100) / 100,
          },
          net_pnl_after_charges: netPnl,
          tax: {
            taxable_income: Math.round(taxableIncome * 100) / 100,
            tax_at_30_pct: taxAmount,
            health_cess_4_pct: cess,
            surcharge_if_applicable: surcharge,
            total_tax_liability: totalTax,
            effective_tax_rate: taxableIncome > 0 ? Math.round((totalTax / taxableIncome) * 10000) / 100 : 0,
          },
          advance_tax_schedule: advanceTax,
          compliance: {
            itr_form: itrForm,
            audit_required: auditRequired,
            section_44AD_presumptive: totalTurnover <= 30000000 && totalPnl >= totalTurnover * 0.06,
            due_date: auditRequired ? `31 Oct ${endYear}` : `31 Jul ${endYear}`,
          },
          trade_details: tradeDetails.slice(0, 200),
          total_trade_details: tradeDetails.length,
        },
      });
    } catch (err) {
      console.error('[Tax] Report generation error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Fallback: Local data tax report (when Upstox not connected)
  function getLocalTaxReport(req, res, fy, segment) {
    const startYear = 2000 + parseInt(fy.substring(0, 2));
    const endYear = 2000 + parseInt(fy.substring(2, 4));
    const startDate = new Date(startYear, 3, 1).toISOString();
    const endDate = new Date(endYear, 2, 31, 23, 59, 59).toISOString();
    const closedTrades = (db.data.trades || []).filter(t => t.status === 'CLOSED' && t.status !== 'FAILED');
    const fyTrades = closedTrades.filter(t => {
      const exitTime = t.exit_time || t.updated_at || '';
      return exitTime >= startDate && exitTime <= endDate;
    });

    let totalTurnover = 0, totalProfit = 0, totalLoss = 0, totalPnl = 0;
    const tradeDetails = [];
    for (const trade of fyTrades) {
      const pnl = trade.pnl || 0;
      totalTurnover += Math.abs(pnl);
      if (pnl > 0) totalProfit += pnl;
      else totalLoss += Math.abs(pnl);
      totalPnl += pnl;
      tradeDetails.push({
        symbol: trade.symbol, trade_type: trade.trade_type,
        buy_date: trade.entry_time, sell_date: trade.exit_time,
        buy_price: trade.entry_price, sell_price: trade.exit_price,
        quantity: trade.quantity,
        buy_amount: Math.round((trade.investment || 0) * 100) / 100,
        sell_amount: Math.round(((trade.exit_price || 0) * (trade.quantity || 0)) * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
      });
    }

    const stt = Math.round(totalTurnover * 0.000125 * 100) / 100;
    const txnCharges = Math.round(totalTurnover * 0.00053 * 100) / 100;
    const gst = Math.round((txnCharges + stt) * 0.18 * 100) / 100;
    const stampDuty = Math.round(totalTurnover * 0.00003 * 100) / 100;
    const sebi = Math.round(totalTurnover * 0.000001 * 100) / 100;
    const totalCharges = Math.round((stt + txnCharges + gst + stampDuty + sebi) * 100) / 100;
    const netPnl = Math.round((totalPnl - totalCharges) * 100) / 100;
    const taxableIncome = Math.max(0, netPnl);
    const taxAt30 = Math.round(taxableIncome * 0.30 * 100) / 100;
    const cess = Math.round(taxAt30 * 0.04 * 100) / 100;
    const totalTax = Math.round((taxAt30 + cess) * 100) / 100;

    res.json({
      status: 'success',
      source: 'local',
      message: 'Upstox not connected - using local trade data (may not match broker)',
      report: {
        financial_year: `FY ${startYear}-${endYear}`,
        fy_code: fy, segment,
        total_trades: fyTrades.length,
        expected_trades: fyTrades.length,
        summary: {
          total_buy_value: 0,
          total_sell_value: 0,
          total_turnover: Math.round(totalTurnover * 100) / 100,
          total_profit: Math.round(totalProfit * 100) / 100,
          total_loss: Math.round(totalLoss * 100) / 100,
          gross_pnl_settled: Math.round(totalPnl * 100) / 100,
          today_pnl: 0,
          combined_gross_pnl: Math.round(totalPnl * 100) / 100,
        },
        charges: {
          source: 'calculated',
          brokerage: 0,
          stt,
          transaction_charges: txnCharges,
          gst,
          stamp_duty: stampDuty,
          sebi_charges: sebi,
          ipft: 0,
          total_charges: totalCharges,
        },
        net_pnl_after_charges: netPnl,
        tax: {
          taxable_income: Math.round(taxableIncome * 100) / 100,
          tax_at_30_pct: taxAt30,
          health_cess_4_pct: cess,
          surcharge_if_applicable: 0,
          total_tax_liability: totalTax,
          effective_tax_rate: taxableIncome > 0 ? Math.round((totalTax / taxableIncome) * 10000) / 100 : 0,
        },
        compliance: {
          itr_form: totalTurnover > 0 ? 'ITR-3' : 'ITR-2',
          audit_required: totalTurnover > 100000000,
          due_date: totalTurnover > 100000000 ? `31 Oct ${endYear}` : `31 Jul ${endYear}`,
        },
        trade_details: tradeDetails,
        total_trade_details: tradeDetails.length,
      },
    });
  }

  // GET /api/tax/upstox-summary - Quick P&L summary from Upstox
  router.get('/api/tax/upstox-summary', async (req, res) => {
    const token = getActiveBrokerToken();
    if (!token) return res.json({ status: 'error', message: 'Upstox not connected. Please connect your broker first.' });

    try {
      const headers = getHeaders(token);
      const fy = parseFY(req.query.fy || req.query.fy_year);

      const chargesResp = await axios.get('https://api.upstox.com/v2/trade/profit-loss/charges', {
        headers, params: { segment: 'FO', financial_year: fy }, timeout: 15000
      });

      if (chargesResp.data?.status === 'success') {
        res.json({ status: 'success', source: 'upstox', data: chargesResp.data.data });
      } else {
        res.json({ status: 'error', message: 'Failed to fetch Upstox summary', raw: chargesResp.data });
      }
    } catch (e) {
      res.json({ status: 'error', message: e.response?.data?.message || e.message });
    }
  });

  return router;
};
