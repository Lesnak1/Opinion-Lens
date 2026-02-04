<div align="center">
  <img src="assets/icons/icon-128.png" alt="Opinion Lens Logo" width="128" height="128">
  <h1>Opinion Lens</h1>
  <p><strong>The Ultimate Prediction Market Companion for Opinion.trade</strong></p>
  <p>Track markets, get alerts, and trade directly from Twitter/X</p>
  
  <p>
    <a href="#features">Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#usage">Usage</a> •
    <a href="#development">Development</a> •
    <a href="#api">API</a>
  </p>
  
  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3">
    <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
    <img src="https://img.shields.io/badge/Tests-91%20passing-brightgreen?style=flat-square" alt="Tests">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome">
  </p>
</div>

---

## ✨ Features

### 🚀 Popup Dashboard
- **Portfolio Overview** - Real-time total value, P&L, and position count
- **Trending Markets** - Hot markets ranked by volume and activity
- **Watchlist** - Track your favorite markets with live prices
- **Quick Search** - Find any market instantly

### 🐦 Twitter/X Integration
- **Smart Detection** - Automatically detects prediction market keywords in tweets
- **Dynamic Matching** - Matches tweets with live Opinion markets using AI-powered keyword extraction
- **Market Cards** - Beautiful inline cards showing YES/NO prices and probability bars
- **Quick Trade** - One-click buttons to trade directly on Opinion.trade
- **Multi-Market Carousel** - When multiple markets match, swipe through them

### 📊 Opinion.trade Enhancement
- **Position Tracker Widget** - Draggable widget showing your open positions
- **Real-time P&L** - Live profit/loss updates as prices change
- **CSV Export** - Export your trading history for analysis

### 🔔 Smart Notifications
- **Price Alerts** - Get notified when markets hit your target prices
- **Market Events** - Alerts for resolutions and major price movements
- **Portfolio Updates** - Notifications for significant P&L changes

---

## 📦 Installation

### From Source (Recommended for Development)

1. **Clone the repository**
   ```bash
   git clone https://github.com/Lesnak1/Opinion-Lens.git
   cd Opinion-Lens
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `dist` folder

### From Chrome Web Store
*Coming soon*

---

## 🔧 Usage

### Initial Setup

1. **Get an API Key**
   - Apply at [Opinion Builders Program](https://docs.google.com/forms/d/1h7gp8UffZeXzYQ-lv4jcou9PoRNOqMAQhyW4IwZDnII)
   - You'll receive your key via email

2. **Configure the Extension**
   - Click the Opinion Lens icon → Settings (gear icon)
   - Enter your API key
   - Click "Test Connection" to verify

3. **Start Trading**
   - Browse Twitter/X normally - market cards appear automatically
   - Click the extension icon to view your dashboard
   - Visit Opinion.trade for the position tracker widget

### Twitter Integration

The extension automatically detects tweets containing:
- **Crypto**: Bitcoin, BTC, ETH, Ethereum, Solana, etc.
- **Economics**: Fed, FOMC, CPI, inflation, rate cut, etc.
- **Politics**: Trump, Biden, election, etc.
- **And more**: Any keyword from active Opinion markets

When detected, a market card appears below the tweet with:
- Current YES/NO prices
- Probability bar visualization
- Quick trade buttons
- Add to watchlist option

---

## 🛠 Development

### Tech Stack
- **Manifest V3** - Latest Chrome extension architecture
- **Vanilla JavaScript** - No framework bloat
- **Vite** - Lightning-fast builds
- **Vitest** - 91 unit + integration tests
- **Shadow DOM** - Style isolation for injected components

### Project Structure
```
opinion-lens/
├── background/          # Service worker & API client
│   ├── service-worker.js
│   ├── api-client.js
│   ├── websocket-manager.js
│   └── notification-service.js
├── content/             # Content scripts for Twitter & Opinion
│   ├── twitter-injector.js
│   ├── opinion-injector.js
│   └── *.css
├── popup/               # Extension popup UI
├── options/             # Settings page
├── shared/              # Shared utilities & constants
│   ├── constants.js
│   ├── utils.js
│   ├── storage.js
│   └── market-indexer.js
├── tests/               # Test suite
├── assets/              # Icons and images
└── dist/                # Built extension (git-ignored)
```

### Scripts
```bash
npm run dev      # Development mode with watch
npm run build    # Production build
npm test         # Run test suite
npm run lint     # Lint code
```

### Running Tests
```bash
npm test

# Output:
# Test Files  4 passed (4)
#      Tests  91 passed (91)
#   Duration  4.87s
```

---

## 🔌 API

Opinion Lens uses the [Opinion.trade API](https://api.opinion.trade):

- **REST API**: Market data, prices, positions
- **WebSocket**: Real-time price updates
- **Rate Limit**: 15 requests/second

### Key Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET /market` | Fetch active markets |
| `GET /market/{id}` | Market details |
| `GET /token/latest-price` | Current prices |
| `GET /token/orderbook` | Order book data |
| `WSS /` | Real-time price stream |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Opinion.trade](https://opinion.trade) for the amazing prediction market platform
- Built for the Opinion Builders Program

---

<div align="center">
  <p>Made with ❤️ for prediction market enthusiasts</p>
  <p>
    <a href="https://opinion.trade">Opinion.trade</a> •
    <a href="https://twitter.com/opaboratory">@opaboratory</a>
  </p>
</div>
