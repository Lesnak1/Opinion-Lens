<p align="center">
  <img src="assets/icons/icon-128.png" width="80" alt="Opinion Lens" />
</p>

<h1 align="center">Opinion Lens</h1>

<p align="center">
  <strong>Chrome extension that brings Opinion.trade prediction markets to your browser</strong>
</p>

<p align="center">
  <a href="https://app.opinion.trade">Opinion.trade</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#development">Development</a>
</p>

---

## Overview

Opinion Lens seamlessly integrates [Opinion.trade](https://app.opinion.trade) prediction markets into your browsing experience. It injects real-time market data directly into Twitter/X tweets, tracks trending markets, and lets you trade with a single click — all from a sleek browser popup.

Built on top of the **Opinion Labs Open API** and designed for the BSC (Binance Smart Chain) ecosystem.

## Features

### 🐦 Twitter/X Integration
- **NLP-powered market matching** — Automatically detects tweets related to active Opinion markets using keyword extraction, acronym/ticker detection, and entity recognition
- **Direct URL matching** — Instantly links tweets that share Opinion.trade URLs with `topicId=` parameters (score: 999, 100% accuracy)
- **SPA-aware observation** — Hooks into Twitter's `history.pushState` / `replaceState` to detect client-side navigation, ensuring emblems appear on both the home feed and tweet detail pages
- **Virtual DOM healing** — Detects when Twitter recycles DOM nodes or when React re-renders wipe injected elements, and re-injects them automatically
- **Live WebSocket prices** — Market prices flash-update in real-time directly on the emblem widget

### 🔥 Trending Markets
- Real-time market data from Opinion.trade, auto-refreshing every 60 seconds
- **Authenticated users** → Official `/openapi/market` endpoint with `status=activated` and `sort=5` (volume24h desc), matching Opinion.trade's trending page exactly
- **Public users** → Multi-page `/topic` fetch with client-side filtering (`status === 2` AND `cutoffTime > now`) to exclude expired markets

### 🆕 New Markets
- Displays the latest active markets sorted by creation time
- Separate tab for discovering freshly listed prediction markets

### ⭐ Watchlist
- Star any market to add it to your personal watchlist
- Works with or without an API key — data is persisted in Chrome local storage
- Falls back to cached market data from Trending/New tabs for instant rendering

### ℹ️ About Page
- Project info, feature highlights, and developer social links

## Installation

### From Source (Developer Mode)

1. **Clone the repository**
   ```bash
   git clone https://github.com/Lesnak1/opinion-lens.git
   cd opinion-lens
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load into Chrome**
   - Open `chrome://extensions/` in your browser
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked**
   - Select the `dist/` folder from this project

5. **Pin the extension** — Click the puzzle icon in Chrome's toolbar and pin "Opinion Lens"

### From ZIP

1. Download `opinion-lens-v1.0.0.zip` from the [Releases](https://github.com/Lesnak1/opinion-lens/releases) page
2. Extract the ZIP to a folder
3. Open `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** → Select the extracted folder

## Configuration

### API Key (Optional)
An API key unlocks the full experience (official trending data, portfolio tracking, real-time WebSocket prices):

1. Apply at the [Opinion Builders Program](https://docs.google.com/forms/d/1h7gp8UffZeXzYQ-lv4jcou9PoRNOqMAQhyW4IwZDnII)
2. Once approved, click the ⚙️ icon in the extension popup
3. Enter your API key and save

Without an API key, the extension still works with public market data for Trending, New Markets, Watchlist, and Twitter matching.

## Architecture

```
opinion-lens/
├── background/
│   ├── service-worker.js    # Chrome MV3 service worker (message router)
│   └── api-client.js        # Opinion.trade API client (auth + public paths)
├── content/
│   ├── twitter-injector.js  # Twitter/X content script (NLP matching + emblem injection)
│   ├── twitter-styles.css   # Glassmorphism emblem styles
│   ├── opinion-injector.js  # Opinion.trade page enhancements
│   └── opinion-styles.css   # Opinion page styles
├── popup/
│   ├── popup.html           # Extension popup UI
│   ├── popup.js             # Popup logic (4 tabs: Trending, New, Watchlist, About)
│   └── popup.css            # Premium dark theme styles
├── options/
│   ├── options.html          # Settings page
│   └── options.js            # API key management
├── shared/
│   ├── constants.js          # App-wide constants and message types
│   ├── utils.js              # Formatting utilities
│   ├── storage.js            # Chrome storage wrapper
│   └── market-indexer.js     # Keyword extraction and market matching engine
├── manifest.prod.json        # Chrome MV3 manifest
├── vite.config.js            # Build config (IIFE content scripts + ES modules)
└── package.json
```

### Twitter Matching Pipeline

```
Tweet appears → MutationObserver on document.body → throttle 300ms
→ scanForTweets() queries all [data-testid="tweet"]
→ Visible tweets processed immediately (getBoundingClientRect)
→ Off-screen tweets queued via IntersectionObserver
→ processTweet: extract text → refreshIndex (if stale)
→ findMatches: URL priority check → NLP keyword scoring
→ Filter weak matches (score < 2) → Fetch live prices
→ Inject Shadow DOM emblem → Mark tweet as processed
→ SPA navigation (pushState/popstate) triggers re-scan
→ Periodic 3s safety-net re-scan catches stragglers
```

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Manifest V3 |
| Build | Vite + Rollup (IIFE for content scripts) |
| API | Opinion Labs Open API + Public BSC Proxy |
| Blockchain | BSC (Binance Smart Chain) |
| Real-time | WebSocket price streaming |
| Styling | Vanilla CSS with CSS variables, glassmorphism |

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Run tests
npm test
```

## API Reference

This extension uses the [Opinion Labs Open API](https://docs.opinion.trade/developer-guide/opinion-open-api):

| Endpoint | Method | Description |
|---|---|---|
| `/openapi/market` | GET | List markets (sort, status, pagination) |
| `/openapi/market/{id}` | GET | Market details |
| `/openapi/token/latest-price` | GET | Latest trade price |
| `/openapi/token/orderbook` | GET | Order book depth |

## Contact

- **Twitter/X**: [@LesnaCrex](https://x.com/LesnaCrex)
- **GitHub**: [Lesnak1](https://github.com/Lesnak1)
- **Email**: philosophyfactss@gmail.com

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for the <a href="https://app.opinion.trade">Opinion.trade</a> community<br/>
  Powered by Opinion Labs Open API
</p>
