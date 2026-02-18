/**
 * Opinion Lens - Twitter Content Script (Enhanced)
 * Detects macro-related tweets and injects Opinion market cards with dynamic matching
 */

import { MESSAGE_TYPES, OPINION_APP_URL } from '../shared/constants.js';
import { formatPrice, formatNumber, formatRelativeDate, escapeHtml, debounce, throttle } from '../shared/utils.js';

// Configuration
const CONFIG = {
  cardClass: 'opinion-lens-card',
  processedAttr: 'data-ol-processed',
  highlightClass: 'ol-keyword',
  maxMarketsPerTweet: 3,
  cacheExpiry: 5 * 60 * 1000, // 5 minutes
};

// Market index cache
let marketIndex = null;
let indexLastUpdate = 0;

// Processed tweets cache
const processedTweets = new WeakSet();

/**
 * Market Index - Synced from background
 */
class MarketIndex {
  constructor() {
    this.markets = [];
    this.keywordMap = new Map();
  }

  update(markets) {
    this.markets = markets;
    this.keywordMap.clear();

    for (const market of markets) {
      const keywords = this.extractKeywords(market.title || market.question || '');
      market._keywords = keywords;

      for (const keyword of keywords) {
        if (!this.keywordMap.has(keyword)) {
          this.keywordMap.set(keyword, []);
        }
        this.keywordMap.get(keyword).push(market);
      }
    }

    console.log(`[Opinion Lens] Updated index: ${markets.length} markets, ${this.keywordMap.size} keywords`);
  }

  extractKeywords(title) {
    const keywords = new Set();
    const stopWords = new Set(['will', 'the', 'be', 'to', 'of', 'and', 'a', 'in', 'is', 'are', 'was', 'has', 'have', 'before', 'after', 'by', 'for', 'on', 'at', 'or', 'an', 'if', 'than', 'then']);

    // Extract words
    const words = title.toLowerCase()
      .replace(/[?!.,;:'"()[\]{}$%]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    words.forEach(w => keywords.add(w));

    // Extract named entities (capitalized)
    const entities = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g) || [];
    entities.forEach(e => keywords.add(e.toLowerCase()));

    // Extract tickers and abbreviations
    const tickers = title.match(/\b[A-Z]{2,5}\b/g) || [];
    tickers.forEach(t => keywords.add(t.toLowerCase()));

    // Extract numbers with context (like "100k", "2024")
    const numbers = title.match(/\$?\d+(?:[,.]\d+)?[kKmMbB]?/g) || [];
    numbers.forEach(n => keywords.add(n.toLowerCase()));

    return Array.from(keywords);
  }

  findMatches(text) {
    const matches = new Map();
    const lowerText = text.toLowerCase();
    const textWords = new Set(lowerText.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/));

    for (const [keyword, markets] of this.keywordMap) {
      // Check word boundary match
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

      if (regex.test(lowerText) || textWords.has(keyword)) {
        for (const market of markets) {
          const id = market.id;
          if (!matches.has(id)) {
            matches.set(id, {
              market,
              score: 0,
              keywords: []
            });
          }
          matches.get(id).score++;
          matches.get(id).keywords.push(keyword);
        }
      }
    }

    return Array.from(matches.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, CONFIG.maxMarketsPerTweet);
  }
}

/**
 * Fetch markets from background service
 */
async function fetchMarkets() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GET_MARKETS,
      params: { limit: 50, status: 'activated' }
    });
    return Array.isArray(response) ? response : (response?.items || []);
  } catch (error) {
    console.error('[Opinion Lens] Failed to fetch markets:', error);
    return [];
  }
}

/**
 * Refresh market index
 */
async function refreshIndex() {
  const now = Date.now();
  if (marketIndex && now - indexLastUpdate < CONFIG.cacheExpiry) {
    return;
  }

  const markets = await fetchMarkets();
  if (markets.length > 0) {
    if (!marketIndex) {
      marketIndex = new MarketIndex();
    }
    marketIndex.update(markets);
    indexLastUpdate = now;
  }
}

/**
 * Tweet Observer - Watches for new tweets with IntersectionObserver
 */
class TweetObserver {
  constructor(callback) {
    this.callback = callback;
    this.mutationObserver = null;
    this.intersectionObserver = null;
    this.pendingTweets = new Set();
  }

  start() {
    // Intersection Observer for lazy processing
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && this.pendingTweets.has(entry.target)) {
            this.pendingTweets.delete(entry.target);
            this.callback(entry.target);
          }
        });
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    this.waitForTimeline().then(timeline => {
      this.mutationObserver = new MutationObserver(
        throttle((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                this.processTweets(node);
              }
            }
          }
        }, 200)
      );

      this.mutationObserver.observe(timeline, {
        childList: true,
        subtree: true
      });

      this.processTweets(timeline);
    });
  }

  processTweets(container) {
    const tweets = container.querySelectorAll('[data-testid="tweet"]');
    tweets.forEach(tweet => {
      if (!processedTweets.has(tweet) && !tweet.hasAttribute(CONFIG.processedAttr)) {
        this.pendingTweets.add(tweet);
        this.intersectionObserver.observe(tweet);
      }
    });
  }

  waitForTimeline() {
    return new Promise(resolve => {
      const check = () => {
        const timeline = document.querySelector('[data-testid="primaryColumn"]');
        if (timeline) {
          resolve(timeline);
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  stop() {
    this.mutationObserver?.disconnect();
    this.intersectionObserver?.disconnect();
  }
}

/**
 * Create enhanced market card HTML
 */
function createMarketCard(market, matchedKeywords) {
  const yesPrice = market.yesPrice || 0.5;
  const noPrice = 1 - yesPrice;
  // Change data not available in list response
  const yesChange = 0;
  const volume = parseFloat(market.volume24h) || 0;
  const yesPct = Math.round(yesPrice * 100);

  const title = market.marketTitle || market.title || market.question || 'Untitled Market';
  const endDate = market.cutoffAt ? new Date(market.cutoffAt * 1000).toISOString() : (market.resolutionDate || market.endDate);

  const changeClass = yesChange >= 0 ? 'positive' : 'negative';
  const changeSign = yesChange >= 0 ? '+' : '';

  return `
    <div class="ol-card" data-market-id="${market.id}">
      <div class="ol-header">
        <div class="ol-brand">
          <svg class="ol-logo" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="olGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#6366F1"/>
                <stop offset="100%" style="stop-color:#8B5CF6"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#olGrad)"/>
            <text x="12" y="16" text-anchor="middle" fill="white" font-size="11" font-weight="bold">O</text>
          </svg>
          <span>Opinion Market</span>
        </div>
        <div class="ol-change ${changeClass}">
          ${changeSign}${(yesChange * 100).toFixed(1)}%
        </div>
      </div>
      
      <div class="ol-title">${escapeHtml(title)}</div>
      
      <div class="ol-probability">
        <div class="ol-prob-bar">
          <div class="ol-prob-fill" style="width: ${yesPct}%"></div>
        </div>
        <div class="ol-prob-labels">
          <span class="ol-yes-label">${yesPct}% YES</span>
          <span class="ol-no-label">${100 - yesPct}% NO</span>
        </div>
      </div>
      
      <div class="ol-prices">
        <button class="ol-trade-btn ol-yes-btn" data-side="yes">
          <span class="ol-btn-label">YES</span>
          <span class="ol-btn-price">${formatPrice(yesPrice)}</span>
        </button>
        <button class="ol-trade-btn ol-no-btn" data-side="no">
          <span class="ol-btn-label">NO</span>
          <span class="ol-btn-price">${formatPrice(noPrice)}</span>
        </button>
      </div>
      
      <div class="ol-footer">
        <div class="ol-meta">
          <span class="ol-volume">💰 ${formatNumber(volume)}</span>
          <span class="ol-ends">⏰ ${formatRelativeDate(endDate)}</span>
        </div>
        <div class="ol-actions">
          <button class="ol-action-btn ol-watchlist" title="Add to Watchlist">⭐</button>
          <button class="ol-action-btn ol-share" title="Copy Link">📋</button>
        </div>
      </div>
      
      <a class="ol-cta" href="${OPINION_APP_URL}/market/${market.id}" target="_blank" rel="noopener">
        Trade on Opinion.trade →
      </a>
    </div>
  `;
}

/**
 * Create carousel for multiple markets
 */
function createMarketCarousel(matches) {
  if (matches.length === 1) {
    return createMarketCard(matches[0].market, matches[0].keywords);
  }

  const cards = matches.map((m, i) =>
    `<div class="ol-carousel-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
            ${createMarketCard(m.market, m.keywords)}
        </div>`
  ).join('');

  const dots = matches.map((_, i) =>
    `<button class="ol-carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`
  ).join('');

  return `
    <div class="ol-carousel" data-count="${matches.length}">
      <div class="ol-carousel-track">${cards}</div>
      <div class="ol-carousel-nav">
        <button class="ol-carousel-prev">‹</button>
        <div class="ol-carousel-dots">${dots}</div>
        <button class="ol-carousel-next">›</button>
      </div>
    </div>
  `;
}

/**
 * Get enhanced styles
 */
function getEnhancedStyles() {
  return `
    :host {
      --ol-primary: #6366F1;
      --ol-primary-light: #818CF8;
      --ol-green: #10B981;
      --ol-red: #EF4444;
      --ol-bg: rgba(15, 15, 20, 0.95);
      --ol-border: rgba(99, 102, 241, 0.3);
      --ol-text: #FFFFFF;
      --ol-text-muted: rgba(255, 255, 255, 0.6);
    }
    
    .ol-container {
      margin: 12px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .ol-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, var(--ol-bg) 100%);
      border: 1px solid var(--ol-border);
      border-radius: 16px;
      backdrop-filter: blur(12px);
    }
    
    .ol-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .ol-brand {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .ol-logo {
      width: 18px;
      height: 18px;
    }
    
    .ol-brand span {
      font-size: 11px;
      color: var(--ol-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .ol-change {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 6px;
    }
    
    .ol-change.positive {
      color: var(--ol-green);
      background: rgba(16, 185, 129, 0.15);
    }
    
    .ol-change.negative {
      color: var(--ol-red);
      background: rgba(239, 68, 68, 0.15);
    }
    
    .ol-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--ol-text);
      line-height: 1.4;
    }
    
    .ol-probability {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    
    .ol-prob-bar {
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .ol-prob-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--ol-green) 0%, var(--ol-primary) 100%);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    
    .ol-prob-labels {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 500;
    }
    
    .ol-yes-label { color: var(--ol-green); }
    .ol-no-label { color: var(--ol-red); }
    
    .ol-prices {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    
    .ol-trade-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 12px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    
    .ol-yes-btn {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    
    .ol-yes-btn:hover {
      background: rgba(16, 185, 129, 0.25);
      transform: translateY(-2px);
    }
    
    .ol-no-btn {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    
    .ol-no-btn:hover {
      background: rgba(239, 68, 68, 0.25);
      transform: translateY(-2px);
    }
    
    .ol-btn-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .ol-yes-btn .ol-btn-label { color: var(--ol-green); }
    .ol-no-btn .ol-btn-label { color: var(--ol-red); }
    
    .ol-btn-price {
      font-size: 18px;
      font-weight: 700;
      color: var(--ol-text);
    }
    
    .ol-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .ol-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--ol-text-muted);
    }
    
    .ol-actions {
      display: flex;
      gap: 6px;
    }
    
    .ol-action-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    }
    
    .ol-action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: scale(1.1);
    }
    
    .ol-cta {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      background: linear-gradient(135deg, var(--ol-primary) 0%, #4F46E5 100%);
      border-radius: 10px;
      color: white;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    
    .ol-cta:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
    }
    
    /* Carousel */
    .ol-carousel {
      position: relative;
    }
    
    .ol-carousel-track {
      display: flex;
      transition: transform 0.3s ease;
    }
    
    .ol-carousel-slide {
      flex: 0 0 100%;
      display: none;
    }
    
    .ol-carousel-slide.active {
      display: block;
    }
    
    .ol-carousel-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-top: 12px;
    }
    
    .ol-carousel-prev,
    .ol-carousel-next {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 18px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .ol-carousel-prev:hover,
    .ol-carousel-next:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .ol-carousel-dots {
      display: flex;
      gap: 6px;
    }
    
    .ol-carousel-dot {
      width: 8px;
      height: 8px;
      background: rgba(255, 255, 255, 0.3);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .ol-carousel-dot.active {
      background: var(--ol-primary);
      transform: scale(1.2);
    }
    
    /* Keyword highlight */
    .ol-keyword {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
      border-radius: 4px;
      padding: 1px 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .ol-keyword:hover {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.5) 0%, rgba(139, 92, 246, 0.5) 100%);
    }
  `;
}

/**
 * Inject market cards into tweet
 */
function injectMarketCards(tweet, matches) {
  const tweetText = tweet.querySelector('[data-testid="tweetText"]');
  if (!tweetText || matches.length === 0) return;

  // Create container with Shadow DOM
  const container = document.createElement('div');
  container.className = CONFIG.cardClass;

  const shadow = container.attachShadow({ mode: 'closed' });

  const content = matches.length === 1
    ? createMarketCard(matches[0].market, matches[0].keywords)
    : createMarketCarousel(matches);

  shadow.innerHTML = `
        <style>${getEnhancedStyles()}</style>
        <div class="ol-container">${content}</div>
    `;

  // Add event listeners for carousel
  if (matches.length > 1) {
    setupCarouselEvents(shadow);
  }

  // Add event listeners for buttons
  setupCardEvents(shadow, matches);

  // Insert after tweet text
  tweetText.parentNode.insertBefore(container, tweetText.nextSibling);
}

/**
 * Setup carousel navigation
 */
function setupCarouselEvents(shadow) {
  const carousel = shadow.querySelector('.ol-carousel');
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.ol-carousel-slide');
  const dots = carousel.querySelectorAll('.ol-carousel-dot');
  const prevBtn = carousel.querySelector('.ol-carousel-prev');
  const nextBtn = carousel.querySelector('.ol-carousel-next');
  let currentIndex = 0;

  const showSlide = (index) => {
    slides.forEach((s, i) => s.classList.toggle('active', i === index));
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    currentIndex = index;
  };

  prevBtn?.addEventListener('click', () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : slides.length - 1;
    showSlide(newIndex);
  });

  nextBtn?.addEventListener('click', () => {
    const newIndex = currentIndex < slides.length - 1 ? currentIndex + 1 : 0;
    showSlide(newIndex);
  });

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      showSlide(parseInt(dot.dataset.index));
    });
  });
}

/**
 * Setup card button events
 */
function setupCardEvents(shadow, matches) {
  // Trade buttons
  shadow.querySelectorAll('.ol-trade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const card = btn.closest('.ol-card');
      const marketId = card?.dataset.marketId;
      const side = btn.dataset.side;
      if (marketId) {
        window.open(`${OPINION_APP_URL}/market/${marketId}?side=${side}`, '_blank');
      }
    });
  });

  // Watchlist button
  shadow.querySelectorAll('.ol-watchlist').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.ol-card');
      const marketId = card?.dataset.marketId;
      if (marketId) {
        try {
          await chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.ADD_TO_WATCHLIST,
            marketId
          });
          btn.textContent = '⭐️';
          btn.style.color = '#FFD700';
        } catch (e) {
          console.error('[Opinion Lens] Failed to add to watchlist:', e);
        }
      }
    });
  });

  // Share button
  shadow.querySelectorAll('.ol-share').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.ol-card');
      const marketId = card?.dataset.marketId;
      if (marketId) {
        const url = `${OPINION_APP_URL}/market/${marketId}`;
        try {
          await navigator.clipboard.writeText(url);
          btn.textContent = '✓';
          setTimeout(() => btn.textContent = '📋', 2000);
        } catch (e) {
          window.open(url, '_blank');
        }
      }
    });
  });
}

/**
 * Process a single tweet
 */
async function processTweet(tweet) {
  // Mark as processed
  if (tweet.hasAttribute(CONFIG.processedAttr)) return;
  tweet.setAttribute(CONFIG.processedAttr, 'true');
  processedTweets.add(tweet);

  // Get tweet text
  const tweetText = tweet.querySelector('[data-testid="tweetText"]');
  if (!tweetText) return;

  const text = tweetText.textContent || '';
  if (text.length < 10) return; // Skip very short tweets

  // Ensure index is fresh
  await refreshIndex();
  if (!marketIndex) return;

  // Find matching markets
  const matches = marketIndex.findMatches(text);
  if (matches.length === 0) return;

  console.log(`[Opinion Lens] Found ${matches.length} markets for tweet`);

  // Fetch prices for top matches
  const topMatches = matches.slice(0, CONFIG.maxMarketsPerTweet);

  for (const match of topMatches) {
    try {
      if (match.market.yesTokenId) {
        const priceData = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.GET_LATEST_PRICE,
          tokenId: match.market.yesTokenId
        });
        if (priceData && priceData.price) {
          match.market.yesPrice = parseFloat(priceData.price);
        }
      }
    } catch (e) {
      console.error('[Opinion Lens] Failed to fetch price for match:', match.market.id, e);
    }
  }

  // Inject cards
  injectMarketCards(tweet, topMatches);
}

/**
 * Initialize
 */
async function init() {
  // Check if Twitter integration is enabled
  try {
    const settings = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
    if (!settings?.twitter?.enabled) {
      console.log('[Opinion Lens] Twitter integration disabled');
      return;
    }
  } catch (error) {
    console.error('[Opinion Lens] Failed to get settings:', error);
  }

  console.log('[Opinion Lens] Twitter integration active (Enhanced)');

  // Pre-fetch market index
  await refreshIndex();

  // Start observing tweets
  const observer = new TweetObserver(processTweet);
  observer.start();

  // Refresh index periodically
  setInterval(refreshIndex, CONFIG.cacheExpiry);

  // Handle real-time price updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MESSAGE_TYPES.PRICE_UPDATE) {
      // Could update visible cards here
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
