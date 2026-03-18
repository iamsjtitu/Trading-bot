/**
 * Unified Broker Router for Desktop App
 * Routes all broker operations through the active broker service.
 * Supports: Upstox, Zerodha, Angel One, 5paisa, Paytm Money, IIFL
 */
const { Router } = require('express');
const axios = require('axios');

// Broker API configurations
const BROKER_CONFIGS = {
  upstox: {
    name: 'Upstox',
    baseUrl: 'https://api.upstox.com/v2',
    authUrl: 'https://api.upstox.com/v2/login/authorization/dialog',
    tokenUrl: 'https://api.upstox.com/v2/login/authorization/token',
    apiVersion: '2.0',
  },
  zerodha: {
    name: 'Zerodha',
    baseUrl: 'https://api.kite.trade',
    authUrl: 'https://kite.zerodha.com/connect/login',
    tokenUrl: 'https://api.kite.trade/session/token',
    apiVersion: '3',
  },
  angelone: {
    name: 'Angel One',
    baseUrl: 'https://apiconnect.angelone.in',
    authUrl: 'https://smartapi.angelone.in/publisher-login',
    tokenUrl: 'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword',
    apiVersion: 'v1',
  },
  '5paisa': {
    name: '5paisa',
    baseUrl: 'https://openapi.5paisa.com',
    authUrl: 'https://dev-openapi.5paisa.com/WebVendorLogin/VLogin/Index',
    tokenUrl: 'https://openapi.5paisa.com/VendorsAPI/Service1.svc/V4/LoginRequestMobileNewbyEmail',
    apiVersion: 'v1',
  },
  paytmmoney: {
    name: 'Paytm Money',
    baseUrl: 'https://developer.paytmmoney.com',
    authUrl: 'https://login.paytmmoney.com/merchant-login',
    tokenUrl: 'https://developer.paytmmoney.com/accounts/v2/gettoken',
    apiVersion: 'v1',
  },
  iifl: {
    name: 'IIFL Securities',
    baseUrl: 'https://ttblaze.iifl.com/apimarketdata',
    authUrl: 'https://ttblaze.iifl.com/apimarketdata/auth/login',
    tokenUrl: 'https://ttblaze.iifl.com/apimarketdata/auth/login',
    apiVersion: 'v2',
  },
};

function getActiveBroker(db) {
  return db.data.settings?.broker?.name || 'upstox';
}

function getToken(db, brokerId) {
  const broker = db.data.settings?.broker || {};
  if (brokerId === 'upstox') return broker.access_token || null;
  return broker[`${brokerId}_token`] || broker.access_token || null;
}

function getBrokerCreds(db, brokerId) {
  const broker = db.data.settings?.broker || {};
  return {
    api_key: broker[`${brokerId}_api_key`] || broker.api_key || '',
    api_secret: broker[`${brokerId}_api_secret`] || broker.api_secret || '',
    client_id: broker[`${brokerId}_client_id`] || '',
    redirect_uri: broker.redirect_uri || 'http://localhost:3000/callback',
  };
}

module.exports = function (db) {
  const router = Router();

  // ==================== Auth ====================
  router.get('/api/brokers/auth-url', (req, res) => {
    const brokerId = getActiveBroker(db);
    const config = BROKER_CONFIGS[brokerId];
    const creds = getBrokerCreds(db, brokerId);

    if (!config) return res.json({ status: 'error', message: `Unknown broker: ${brokerId}` });

    let url;
    switch (brokerId) {
      case 'upstox':
        url = `${config.authUrl}?response_type=code&client_id=${creds.api_key}&redirect_uri=${encodeURIComponent(creds.redirect_uri)}`;
        break;
      case 'zerodha':
        url = `${config.authUrl}?v=3&api_key=${creds.api_key}`;
        break;
      case 'angelone':
        url = `${config.authUrl}?api_key=${creds.api_key}`;
        break;
      default:
        url = config.authUrl;
    }
    res.json({ status: 'success', auth_url: url, broker: brokerId });
  });

  router.post('/api/brokers/callback', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const config = BROKER_CONFIGS[brokerId];
    const creds = getBrokerCreds(db, brokerId);
    const code = req.body?.code || '';

    if (!code) return res.json({ status: 'error', message: 'Authorization code required' });

    try {
      let token, profile;

      switch (brokerId) {
        case 'upstox': {
          const resp = await axios.post(config.tokenUrl, new URLSearchParams({
            code, client_id: creds.api_key, client_secret: creds.api_secret,
            redirect_uri: creds.redirect_uri, grant_type: 'authorization_code',
          }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } });
          token = resp.data.access_token;
          break;
        }
        case 'zerodha': {
          const crypto = require('crypto');
          const checksum = crypto.createHash('sha256').update(creds.api_key + code + creds.api_secret).digest('hex');
          const resp = await axios.post(config.tokenUrl, { api_key: creds.api_key, request_token: code, checksum },
            { headers: { 'X-Kite-Version': '3' } });
          token = resp.data.data?.access_token;
          break;
        }
        case 'angelone': {
          const resp = await axios.post(config.tokenUrl, {
            clientcode: creds.client_id, password: code, totp: req.body?.totp || '',
          }, { headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-UserType': 'USER', 'X-SourceID': 'WEB', 'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '0.0.0.0', 'X-MACAddress': '00:00:00:00:00:00', 'X-PrivateKey': creds.api_key } });
          token = resp.data.data?.jwtToken;
          break;
        }
        case '5paisa': {
          const resp = await axios.post(config.tokenUrl, {
            head: { appName: creds.api_key, appVer: '1.0', key: creds.api_key, osName: 'WEB', requestCode: 'IIFLMarRQLoginFor498V4' },
            body: { Email_id: creds.client_id, Password: code, LocalIP: '127.0.0.1', PublicIP: '0.0.0.0', HDSerialNumber: '', MACAddress: '', MachineID: '', VersionNo: '1.7', My2PIN: req.body?.pin || '', ConnectionType: '1' },
          });
          token = resp.data.body?.JWTToken;
          break;
        }
        case 'paytmmoney': {
          const resp = await axios.post(config.tokenUrl, new URLSearchParams({
            api_key: creds.api_key, api_secret_key: creds.api_secret, request_token: code,
          }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          token = resp.data.access_token;
          break;
        }
        case 'iifl': {
          const resp = await axios.post(config.tokenUrl, {
            secretKey: creds.api_secret, appKey: creds.api_key, source: 'WebAPI',
          });
          token = resp.data.result?.token;
          break;
        }
      }

      if (token) {
        if (!db.data.settings) db.data.settings = {};
        if (!db.data.settings.broker) db.data.settings.broker = {};
        db.data.settings.broker.access_token = token;
        db.data.settings.broker[`${brokerId}_token`] = token;
        db.save();
        res.json({ status: 'success', message: `${config.name} connected successfully`, broker: brokerId });
      } else {
        res.json({ status: 'error', message: `Failed to get token from ${config.name}` });
      }
    } catch (e) {
      console.error(`[BrokerAuth] ${brokerId} error:`, e.response?.data || e.message);
      res.json({ status: 'error', message: e.response?.data?.message || e.message });
    }
  });

  // ==================== Connection Check ====================
  router.get('/api/brokers/connection', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const token = getToken(db, brokerId);
    if (!token) return res.json({ connected: false, message: `No ${BROKER_CONFIGS[brokerId]?.name || brokerId} token. Please login.` });

    try {
      let profileName = 'User';
      switch (brokerId) {
        case 'upstox': {
          const resp = await axios.get('https://api.upstox.com/v2/user/profile', {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' }, timeout: 10000,
          });
          profileName = resp.data?.data?.user_name || 'User';
          break;
        }
        case 'zerodha': {
          const creds = getBrokerCreds(db, brokerId);
          const resp = await axios.get('https://api.kite.trade/user/profile', {
            headers: { 'X-Kite-Version': '3', Authorization: `token ${creds.api_key}:${token}` }, timeout: 10000,
          });
          profileName = resp.data?.data?.user_name || 'User';
          break;
        }
        case 'angelone': {
          const creds = getBrokerCreds(db, brokerId);
          const resp = await axios.get('https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile', {
            headers: { Authorization: `Bearer ${token}`, 'X-PrivateKey': creds.api_key, Accept: 'application/json' }, timeout: 10000,
          });
          profileName = resp.data?.data?.name || 'User';
          break;
        }
        case '5paisa': {
          // 5paisa doesn't have a simple profile endpoint - use margin check
          const resp = await axios.post('https://openapi.5paisa.com/VendorsAPI/Service1.svc/V3/Margin', {
            head: { key: getBrokerCreds(db, brokerId).api_key },
            body: { ClientCode: getBrokerCreds(db, brokerId).client_id },
          }, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
          profileName = getBrokerCreds(db, brokerId).client_id || 'User';
          break;
        }
        case 'paytmmoney': {
          const resp = await axios.get('https://developer.paytmmoney.com/accounts/v2/user/details', {
            headers: { 'x-jwt-token': token }, timeout: 10000,
          });
          profileName = resp.data?.name || 'User';
          break;
        }
        case 'iifl': {
          profileName = getBrokerCreds(db, brokerId).client_id || 'User';
          break;
        }
      }
      res.json({ connected: true, message: `Connected as ${profileName}`, broker: brokerId, broker_name: BROKER_CONFIGS[brokerId]?.name });
    } catch (e) {
      res.json({ connected: false, message: `${BROKER_CONFIGS[brokerId]?.name} token expired or invalid`, broker: brokerId });
    }
  });

  // ==================== Profile ====================
  router.get('/api/broker/profile', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const token = getToken(db, brokerId);
    if (!token) return res.json({ status: 'error', message: 'Not connected' });

    try {
      let profile = {};
      switch (brokerId) {
        case 'upstox': {
          const resp = await axios.get('https://api.upstox.com/v2/user/profile', {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
          });
          profile = resp.data?.data || {};
          break;
        }
        case 'zerodha': {
          const creds = getBrokerCreds(db, brokerId);
          const resp = await axios.get('https://api.kite.trade/user/profile', {
            headers: { 'X-Kite-Version': '3', Authorization: `token ${creds.api_key}:${token}` },
          });
          profile = resp.data?.data || {};
          break;
        }
        default:
          profile = { user_name: 'User', broker: BROKER_CONFIGS[brokerId]?.name };
      }
      res.json({ status: 'success', profile: { ...profile, broker: BROKER_CONFIGS[brokerId]?.name } });
    } catch (e) {
      res.json({ status: 'error', message: e.message });
    }
  });

  // ==================== Order Placement ====================
  router.post('/api/broker/order', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const token = getToken(db, brokerId);
    if (!token) return res.json({ status: 'error', message: 'Not connected' });
    const order = req.body || {};

    try {
      let result;
      switch (brokerId) {
        case 'upstox': {
          result = await axios.post('https://api.upstox.com/v2/order/place', {
            quantity: order.quantity, product: order.product || 'I', validity: order.validity || 'DAY',
            price: order.price || 0, tag: 'AI_BOT', instrument_token: order.instrument_token,
            order_type: order.order_type || 'MARKET', transaction_type: order.transaction_type,
            disclosed_quantity: 0, trigger_price: order.trigger_price || 0, is_amo: false,
          }, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0', 'Content-Type': 'application/json' } });
          res.json({ status: 'success', order_id: result.data?.data?.order_id, message: 'Order placed on Upstox' });
          return;
        }
        case 'zerodha': {
          const creds = getBrokerCreds(db, brokerId);
          result = await axios.post('https://api.kite.trade/orders/regular', new URLSearchParams({
            tradingsymbol: order.instrument_token, exchange: order.exchange || 'NFO',
            transaction_type: order.transaction_type, order_type: order.order_type || 'MARKET',
            quantity: String(order.quantity), product: order.product || 'MIS',
            validity: order.validity || 'DAY', price: String(order.price || 0),
            trigger_price: String(order.trigger_price || 0), tag: 'AI_BOT',
          }).toString(), { headers: { 'X-Kite-Version': '3', Authorization: `token ${creds.api_key}:${token}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
          res.json({ status: 'success', order_id: result.data?.data?.order_id, message: 'Order placed on Zerodha' });
          return;
        }
        case 'angelone': {
          const creds = getBrokerCreds(db, brokerId);
          result = await axios.post('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder', {
            variety: 'NORMAL', tradingsymbol: order.instrument_token, symboltoken: order.symbol_token || '',
            transactiontype: order.transaction_type, exchange: order.exchange || 'NFO',
            ordertype: order.order_type || 'MARKET', producttype: order.product || 'INTRADAY',
            duration: order.validity || 'DAY', price: String(order.price || 0),
            triggerprice: String(order.trigger_price || 0), quantity: String(order.quantity),
          }, { headers: { Authorization: `Bearer ${token}`, 'X-PrivateKey': creds.api_key, Accept: 'application/json', 'Content-Type': 'application/json' } });
          res.json({ status: 'success', order_id: result.data?.data?.orderid, message: 'Order placed on Angel One' });
          return;
        }
        case '5paisa': {
          const creds = getBrokerCreds(db, brokerId);
          result = await axios.post('https://openapi.5paisa.com/VendorsAPI/Service1.svc/V1/OrderRequest', {
            head: { key: creds.api_key },
            body: {
              ClientCode: creds.client_id, OrderFor: 'P', Exchange: order.exchange === 'MCX' ? 'M' : 'N',
              ExchangeType: order.exchange === 'MCX' ? 'D' : 'D', ScripCode: order.instrument_token,
              Qty: String(order.quantity), Price: String(order.price || 0),
              StopLossPrice: String(order.trigger_price || 0), IsIntraday: true,
              BuySell: order.transaction_type === 'BUY' ? 'B' : 'S', OrderType: order.order_type === 'LIMIT' ? 'L' : 'M',
            },
          }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
          res.json({ status: 'success', order_id: result.data?.body?.BrokerOrderID, message: 'Order placed on 5paisa' });
          return;
        }
        case 'paytmmoney': {
          result = await axios.post('https://developer.paytmmoney.com/orders/v1/place/regular', {
            txn_type: order.transaction_type, exchange: order.exchange || 'NSE',
            segment: order.exchange === 'MCX' ? 'D' : 'D', product: order.product || 'I',
            security_id: order.instrument_token, quantity: String(order.quantity),
            validity: order.validity || 'DAY', order_type: order.order_type || 'MKT',
            price: String(order.price || 0), trigger_price: String(order.trigger_price || 0),
          }, { headers: { 'x-jwt-token': token, 'Content-Type': 'application/json' } });
          res.json({ status: 'success', order_id: result.data?.data?.[0]?.order_no, message: 'Order placed on Paytm Money' });
          return;
        }
        case 'iifl': {
          const creds = getBrokerCreds(db, brokerId);
          result = await axios.post('https://ttblaze.iifl.com/interactive/orders', {
            exchangeSegment: order.exchange === 'MCX' ? 'MCXFO' : 'NSEFO',
            exchangeInstrumentID: order.instrument_token, productType: order.product || 'MIS',
            orderType: order.order_type || 'MARKET', orderSide: order.transaction_type,
            timeValidity: order.validity || 'DAY', disclosedQuantity: 0,
            orderQuantity: order.quantity, limitPrice: order.price || 0,
            stopPrice: order.trigger_price || 0, orderUniqueIdentifier: `AI_BOT_${Date.now()}`,
          }, { headers: { Authorization: token, secretKey: creds.api_secret, appKey: creds.api_key, source: 'WebAPI', 'Content-Type': 'application/json' } });
          res.json({ status: 'success', order_id: result.data?.result?.AppOrderID, message: 'Order placed on IIFL' });
          return;
        }
      }
      res.json({ status: 'error', message: `Unsupported broker: ${brokerId}` });
    } catch (e) {
      console.error(`[BrokerOrder] ${brokerId}:`, e.response?.data || e.message);
      res.json({ status: 'error', message: e.response?.data?.message || e.message });
    }
  });

  // ==================== Portfolio ====================
  router.get('/api/broker/portfolio', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const token = getToken(db, brokerId);
    if (!token) return res.json({ status: 'error', message: 'Not connected' });

    try {
      let positions = [], funds = {};
      switch (brokerId) {
        case 'upstox': {
          const [posResp, fundResp] = await Promise.all([
            axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', {
              headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
            }).catch(() => ({ data: {} })),
            axios.get('https://api.upstox.com/v2/user/get-funds-and-margin', {
              headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
            }).catch(() => ({ data: {} })),
          ]);
          positions = posResp.data?.data || [];
          const eq = fundResp.data?.data?.equity || {};
          funds = { available: eq.available_margin || 0, used: eq.used_margin || 0, total: (eq.available_margin || 0) + (eq.used_margin || 0) };
          break;
        }
        case 'zerodha': {
          const creds = getBrokerCreds(db, brokerId);
          const authHeader = `token ${creds.api_key}:${token}`;
          const [posResp, fundResp] = await Promise.all([
            axios.get('https://api.kite.trade/portfolio/positions', { headers: { 'X-Kite-Version': '3', Authorization: authHeader } }).catch(() => ({ data: {} })),
            axios.get('https://api.kite.trade/user/margins', { headers: { 'X-Kite-Version': '3', Authorization: authHeader } }).catch(() => ({ data: {} })),
          ]);
          positions = posResp.data?.data?.net || [];
          const eqM = fundResp.data?.data?.equity || {};
          funds = { available: eqM.available?.live_balance || 0, used: eqM.utilised?.debits || 0, total: eqM.net || 0 };
          break;
        }
        default:
          positions = [];
          funds = { available: 0, used: 0, total: 0 };
      }
      const totalPnl = Array.isArray(positions) ? positions.reduce((s, p) => s + (p.pnl || p.unrealised || 0), 0) : 0;
      res.json({ status: 'success', positions, funds, total_pnl: Math.round(totalPnl * 100) / 100, broker: brokerId });
    } catch (e) {
      res.json({ status: 'error', message: e.message });
    }
  });

  // ==================== Order Book ====================
  router.get('/api/broker/orders', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const token = getToken(db, brokerId);
    if (!token) return res.json({ status: 'success', orders: [] });

    try {
      let orders = [];
      switch (brokerId) {
        case 'upstox': {
          const resp = await axios.get('https://api.upstox.com/v2/order/retrieve-all', {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
          });
          orders = resp.data?.data || [];
          break;
        }
        case 'zerodha': {
          const creds = getBrokerCreds(db, brokerId);
          const resp = await axios.get('https://api.kite.trade/orders', {
            headers: { 'X-Kite-Version': '3', Authorization: `token ${creds.api_key}:${token}` },
          });
          orders = resp.data?.data || [];
          break;
        }
        case 'angelone': {
          const creds = getBrokerCreds(db, brokerId);
          const resp = await axios.get('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getOrderBook', {
            headers: { Authorization: `Bearer ${token}`, 'X-PrivateKey': creds.api_key, Accept: 'application/json' },
          });
          orders = resp.data?.data || [];
          break;
        }
        default:
          orders = [];
      }
      res.json({ status: 'success', orders });
    } catch (e) {
      res.json({ status: 'success', orders: [] });
    }
  });

  // ==================== Cancel Order ====================
  router.delete('/api/broker/order/:orderId', async (req, res) => {
    const brokerId = getActiveBroker(db);
    const token = getToken(db, brokerId);
    const orderId = req.params.orderId;
    if (!token) return res.json({ status: 'error', message: 'Not connected' });

    try {
      switch (brokerId) {
        case 'upstox': {
          await axios.delete(`https://api.upstox.com/v2/order/cancel?order_id=${orderId}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Api-Version': '2.0' },
          });
          break;
        }
        case 'zerodha': {
          const creds = getBrokerCreds(db, brokerId);
          await axios.delete(`https://api.kite.trade/orders/regular/${orderId}`, {
            headers: { 'X-Kite-Version': '3', Authorization: `token ${creds.api_key}:${token}` },
          });
          break;
        }
        case 'angelone': {
          const creds = getBrokerCreds(db, brokerId);
          await axios.post('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/cancelOrder', {
            variety: 'NORMAL', orderid: orderId,
          }, { headers: { Authorization: `Bearer ${token}`, 'X-PrivateKey': creds.api_key, 'Content-Type': 'application/json' } });
          break;
        }
      }
      res.json({ status: 'success', message: `Order ${orderId} cancelled` });
    } catch (e) {
      res.json({ status: 'error', message: e.message });
    }
  });

  return router;
};
