# 🤖 AI-Powered Options Trading Bot

## 📋 Overview
यह एक **AI-powered News-Based Options Trading Bot** है जो real-time market news को analyze करके automatic trading signals generate करता है।

### ✨ Key Features

**1. 📰 News Analysis**
- Real-time market news fetching
- AI-powered sentiment analysis (Bullish/Bearish/Neutral)
- Confidence scoring (0-100%)
- Impact assessment (High/Medium/Low)

**2. 🎯 Trading Signals**
- Automatic CALL/PUT signal generation
- Strike price recommendations
- Entry/Exit levels
- Stop-loss and target calculations
- Risk-based position sizing

**3. 💹 Paper Trading Engine**
- Virtual portfolio (₹5,00,000 starting capital)
- Real-time P&L tracking
- Position management
- Risk controls (₹20,000 per trade, ₹1,00,000 daily limit)

**4. 📊 Live Dashboard**
- Portfolio summary
- News feed with sentiment
- Trading signals
- Active positions
- Performance metrics

## 🛠️ Technology Stack

### Backend
- **FastAPI**: REST API server
- **MongoDB**: Database for news, signals, and trades
- **Emergent LLM Key**: AI sentiment analysis (GPT-4.1-mini)
- **Python**: Core logic

### Frontend
- **React 19**: UI framework
- **Tailwind CSS**: Styling
- **Axios**: API calls
- **React Icons**: Icons

## 🚀 Getting Started

### Prerequisites
All dependencies are already installed and running!

### Configuration

**Backend Configuration** (`.env` file):
```env
# Database
MONGO_URL="mongodb://localhost:27017"
DB_NAME="trading_bot_db"

# AI Analysis
EMERGENT_LLM_KEY=sk-emergent-754BdB27f511c159cC

# Trading Parameters
INITIAL_CAPITAL=500000
MAX_TRADE_AMOUNT=20000
DAILY_LIMIT=100000
RISK_TOLERANCE=medium
```

**Frontend Configuration** (`.env` file):
```env
REACT_APP_BACKEND_URL=https://trading-decision.preview.emergentagent.com
```

### Running the Application

Services are managed by supervisor:

```bash
# Restart all services
sudo supervisorctl restart all

# Check status
sudo supervisorctl status

# View logs
tail -f /var/log/supervisor/backend.err.log
tail -f /var/log/supervisor/frontend.out.log
```

## 📡 API Endpoints

### News & Analysis
- `GET /api/news/fetch` - Fetch and analyze latest news
- `GET /api/news/latest?limit=20` - Get latest analyzed news

### Trading Signals
- `GET /api/signals/latest?limit=10` - Get latest signals
- `GET /api/signals/active` - Get active signals

### Portfolio & Trades
- `GET /api/portfolio` - Get portfolio summary
- `GET /api/trades/active` - Get active trades
- `GET /api/trades/history?limit=50` - Get trade history

### System
- `GET /api/health` - Health check
- `POST /api/initialize` - Initialize trading system
- `GET /api/stats` - Overall statistics

## 🎮 How to Use

### 1. Access Dashboard
Open: https://trading-decision.preview.emergentagent.com

### 2. Analyze News
- Click **"Analyze News"** button
- AI will fetch and analyze latest market news
- Sentiment analysis appears with each article

### 3. View Signals
- Click **"Signals"** tab
- See generated CALL/PUT signals
- View entry, target, and stop-loss prices

### 4. Track Trades
- Click **"Active Trades"** tab
- Monitor open positions
- Track P&L in real-time

### 5. Monitor Portfolio
- Top cards show:
  - Portfolio Value
  - Total P&L
  - Active Positions
  - Win Rate

## ⚙️ Trading Logic

### Signal Generation
```
High Confidence (80-100%) + BULLISH → BUY CALL
High Confidence (80-100%) + BEARISH → BUY PUT
Confidence < 60% → NO SIGNAL
```

### Risk Management
- **Per Trade**: Maximum ₹20,000
- **Daily Limit**: Maximum ₹1,00,000
- **Stop Loss**: 25% (Medium risk)
- **Target**: 50% profit
- **Position Size**: 5% of capital max

### Paper Trading
- Starting Capital: ₹5,00,000
- Virtual execution (no real money)
- Real-time P&L simulation
- Safe for testing strategies

## 📊 Current Status

✅ **Running Mode**: Paper Trading
✅ **Capital**: ₹5,00,000 (virtual)
✅ **AI Model**: GPT-4.1-mini via Emergent LLM Key
✅ **News Source**: Demo data (for testing)
✅ **Risk Level**: Medium

## 🔮 Future Enhancements

### Phase 2 (After Paper Trading Success)
- [ ] Real news API integration (NewsAPI, Alpha Vantage)
- [ ] Upstox broker integration for live trading
- [ ] Real-time option chain data
- [ ] Advanced technical indicators
- [ ] Backtesting engine

### Phase 3 (Advanced Features)
- [ ] Multiple strategy support
- [ ] Machine learning model training
- [ ] Options Greeks calculation
- [ ] Multi-timeframe analysis
- [ ] Telegram/WhatsApp alerts
- [ ] Mobile app

## ⚠️ Important Disclaimers

**🔴 CRITICAL NOTES:**
1. **Paper Trading Only**: Currently running in simulation mode with fake money
2. **Educational Purpose**: For learning and testing only
3. **No Financial Advice**: This is not investment advice
4. **Trading Risks**: Real trading involves risk of capital loss
5. **Test First**: Always test thoroughly before considering live trading
6. **No Guarantees**: Past performance doesn't guarantee future results

## 💰 Cost Information

### Emergent LLM Key Costs
- **AI Analysis**: ~₹500-1500/month (GPT-4.1-mini)
- **Balance Management**: Profile → Universal Key → Add Balance
- **Auto Top-up**: Available for convenience

### News API Costs (Future)
- **Free Tier**: ₹0 (limited requests)
- **Premium**: ₹2,400-8,200/month (better data)

### Total Estimated Cost (Paper Trading)
- **Current**: ₹500-1500/month
- **With Premium News**: ₹3,000-10,000/month

## 📁 Project Structure

```
/app/
├── backend/
│   ├── server.py              # Main FastAPI server
│   ├── news_service.py        # News fetching logic
│   ├── sentiment_service.py   # AI sentiment analysis
│   ├── trading_engine.py      # Trading logic & risk mgmt
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Backend configuration
│
├── frontend/
│   ├── src/
│   │   ├── App.js            # Main React component
│   │   ├── App.css           # Styles
│   │   └── components/       # UI components
│   ├── package.json          # Node dependencies
│   └── .env                  # Frontend configuration
│
└── README.md                 # This file
```

## 🐛 Troubleshooting

### Backend Not Starting?
```bash
# Check logs
tail -n 50 /var/log/supervisor/backend.err.log

# Restart
sudo supervisorctl restart backend
```

### Frontend Issues?
```bash
# Check logs
tail -n 50 /var/log/supervisor/frontend.err.log

# Clear cache and restart
sudo supervisorctl restart frontend
```

### Database Issues?
```bash
# Check MongoDB status
sudo supervisorctl status mongodb

# Restart MongoDB
sudo supervisorctl restart mongodb
```

## 📞 Support

For issues or questions:
1. Check logs first (`/var/log/supervisor/`)
2. Review API responses in browser console
3. Test backend endpoints with curl
4. Contact Emergent support if needed

## 📝 License

Built with ❤️ using Emergent AI Platform

---

**⚠️ Remember**: This is a paper trading bot for educational purposes. Always do your own research and never invest more than you can afford to lose!

**🎯 Current Status**: ✅ Fully Functional Paper Trading Bot Ready!
