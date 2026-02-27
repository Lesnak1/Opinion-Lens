/**
 * Opinion Lens - Twitter Content Script (Enhanced)
 * Detects macro-related tweets and injects Opinion market cards with dynamic matching
 */

import { MESSAGE_TYPES, OPINION_APP_URL } from '../shared/constants.js';
import { formatPrice, formatNumber, formatRelativeDate, escapeHtml, debounce, throttle } from '../shared/utils.js';

// Configuration
const CONFIG = {
  cardClass: 'opinion-emblem-container',
  statusAttr: 'data-ol-status',
  textAttr: 'data-ol-text',
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
      const keywords = this.extractKeywords(market.marketTitle || market.title || market.question || '');
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
    const stopWords = new Set([
      'will', 'the', 'be', 'to', 'of', 'and', 'a', 'in', 'is', 'are', 'was', 'has', 'have',
      'before', 'after', 'by', 'for', 'on', 'at', 'or', 'an', 'if', 'than', 'then', 'who',
      'what', 'when', 'where', 'why', 'how', 'do', 'does', 'did', 'vs', 'v'
    ]);

    // Enhanced regex to remove special chars but keep hyphens and apostrophes for names
    const cleanTitle = title.toLowerCase().replace(/[?!.,;:"()[\]{}$%]/g, ' ');

    // 1. Extract Individual Meaningful Words
    const words = cleanTitle.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    words.forEach(w => keywords.add(w));

    // 2. Extract Named Entities (Capitalized words, catching names, countries, e-sports teams like "NaVi", "G2")
    const entities = title.match(/[A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?/g) || [];
    // We filter entities to only those that actually start with a capital letter in the original text, to catch proper nouns
    const properNouns = title.match(/\b[A-Z][a-z0-9]+\b(?:\s+[A-Z][a-z0-9]+\b)*/g) || [];
    properNouns.forEach(e => {
      if (e.length > 2) keywords.add(e.toLowerCase());
    });

    // 3. Extract common acronyms / tickers / short team names (e.g. BTC, ETH, USA, G2, T1)
    const acronyms = title.match(/\b[A-Z0-9]{2,5}\b/g) || [];
    acronyms.forEach(t => keywords.add(t.toLowerCase()));

    // 4. Extract Multi-word Contexts (Targeting versus matches like "NaVi vs Faze" or "US vs Iran")
    // If the title contains "vs", we want to ensure the combatants are extracted clearly
    const vsMatch = cleanTitle.split(/\s+vs\s+|\s+v\s+/);
    if (vsMatch.length > 1) {
      vsMatch.forEach(part => {
        const partWords = part.trim().split(/\s+/);
        if (partWords.length > 0 && partWords[0].length > 1) {
          keywords.add(partWords[partWords.length - 1]); // the word right before/after vs
        }
      });
    }

    // 5. Extract numbers with strong context (like "$10", "100k", "2024")
    // Ignore plain 1-3 digit numbers as they cause massive false positives
    const numbers = title.match(/(?:\$|€|£)\d+(?:[,.]\d+)?[kKmMbB]?|\b\d+(?:[,.]\d+)?[kKmMbB]\b|\b(?:19|20)\d{2}\b/g) || [];
    numbers.forEach(n => keywords.add(n.toLowerCase()));

    return Array.from(keywords);
  }

  findMatches(text) {
    // 1. Hard Check: Did they post the actual Opinion.trade URL?
    const urlMatch = text.match(/topicId=(\d+)/);
    if (urlMatch) {
      const targetTopicId = parseInt(urlMatch[1], 10);
      for (const markets of this.keywordMap.values()) {
        const exact = markets.find(m => m.id === targetTopicId || m.topicId === targetTopicId || m.marketId === targetTopicId);
        if (exact) {
          return [{ market: exact, score: 999, keywords: ['URL_MATCH'] }];
        }
      }
    }

    const matches = new Map();
    const lowerText = text.toLowerCase();
    const textWords = new Set(lowerText.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/));

    for (const [keyword, markets] of this.keywordMap) {
      // Check word boundary match
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

      if (regex.test(lowerText) || textWords.has(keyword)) {
        for (const market of markets) {
          const id = market.marketId || market.id || market.topicId;
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

    // Filter out weak matches (require at least score of 2, OR a very strong single keyword > 5 chars)
    return Array.from(matches.values())
      .filter(m => m.score >= 2 || (m.score === 1 && m.keywords[0].length >= 5))
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
      params: { limit: 20, status: 'activated', sortBy: 5 } // Pull markets for the Twitter Index, sorting by popularity
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
 * Tweet Observer - Watches for new tweets with robust SPA navigation support
 * Handles: feed scrolling, tweet detail pages, back navigation, URL changes
 */
class TweetObserver {
  constructor(callback) {
    this.callback = callback;
    this.mutationObserver = null;
    this.intersectionObserver = null;
    this.pendingTweets = new Set();
    this.lastUrl = location.href;
    this.scanInterval = null;
    this.isProcessing = false;
  }

  start() {
    // Intersection Observer for lazy processing of off-screen tweets
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && this.pendingTweets.has(entry.target)) {
            this.pendingTweets.delete(entry.target);
            this.intersectionObserver.unobserve(entry.target);
            this.callback(entry.target);
          }
        });
      },
      { rootMargin: '200px', threshold: 0.1 }
    );

    // Watch document.body for ALL DOM changes (covers SPA navigation, feed updates, tweet detail pages)
    this.mutationObserver = new MutationObserver(
      throttle(() => {
        this.scanForTweets();
      }, 300)
    );

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Detect SPA navigation via URL changes (Twitter uses History API)
    this.setupNavigationDetection();

    // Periodic safety-net scan every 3 seconds
    // Catches tweets that mutations and intersection observers might miss
    this.scanInterval = setInterval(() => {
      this.scanForTweets();
    }, 3000);

    // Initial scan
    this.scanForTweets();
  }

  setupNavigationDetection() {
    // Override pushState/replaceState to detect SPA navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      self.onNavigate();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      self.onNavigate();
    };

    // Also listen for popstate (back/forward button)
    window.addEventListener('popstate', () => this.onNavigate());
  }

  onNavigate() {
    const newUrl = location.href;
    if (newUrl !== this.lastUrl) {
      this.lastUrl = newUrl;
      console.log('[Opinion Lens] SPA navigation detected:', newUrl.substring(0, 60));

      // Reset pending tweets (old DOM nodes may be gone)
      this.pendingTweets.clear();

      // Wait for Twitter to render the new page, then scan aggressively
      setTimeout(() => this.scanForTweets(), 500);
      setTimeout(() => this.scanForTweets(), 1500);
      setTimeout(() => this.scanForTweets(), 3000);
    }
  }

  scanForTweets() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find ALL tweet elements on the entire page (works for feed, detail, search, etc.)
      const tweets = document.querySelectorAll('[data-testid="tweet"]');

      tweets.forEach(tweet => {
        const textNode = tweet.querySelector('[data-testid="tweetText"]');
        const currentText = textNode ? textNode.textContent.substring(0, 100) : '';

        const processedText = tweet.getAttribute(CONFIG.textAttr);
        const status = tweet.getAttribute(CONFIG.statusAttr);

        // 1. Virtual DOM Recycling Check
        if (status && processedText !== currentText) {
          tweet.removeAttribute(CONFIG.statusAttr);
          tweet.removeAttribute(CONFIG.textAttr);
          const oldEmblem = tweet.querySelector(`.${CONFIG.cardClass}`);
          if (oldEmblem) oldEmblem.remove();
        }

        // 2. React Re-render Healing Check
        if (tweet.getAttribute(CONFIG.statusAttr) === 'has-emblem') {
          const emblem = tweet.querySelector(`.${CONFIG.cardClass}`);
          if (!emblem) {
            tweet.removeAttribute(CONFIG.statusAttr);
            tweet.removeAttribute(CONFIG.textAttr);
          }
        }

        // 3. Queue for processing if unprocessed
        if (!tweet.hasAttribute(CONFIG.statusAttr) && !this.pendingTweets.has(tweet)) {
          // Check if tweet is already visible (above fold)
          const rect = tweet.getBoundingClientRect();
          const isVisible = rect.top < window.innerHeight + 200 && rect.bottom > -200;

          if (isVisible) {
            // Process immediately — don't wait for IntersectionObserver
            this.callback(tweet);
          } else {
            // Queue for lazy processing when scrolled into view
            this.pendingTweets.add(tweet);
            this.intersectionObserver.observe(tweet);
          }
        }
      });
    } finally {
      this.isProcessing = false;
    }
  }

  stop() {
    this.mutationObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    if (this.scanInterval) clearInterval(this.scanInterval);
  }
}

/**
 * Create sleek market emblem HTML
 */
function createMarketCard(market, matchedKeywords) {
  const yesPrice = parseFloat(market.yesPrice || 0.5);
  const noPrice = 1 - yesPrice;
  const yesPct = Math.round(yesPrice * 100);

  const title = market.marketTitle || market.title || market.question || 'Untitled Market';
  const marketId = market.marketId || market.id;
  const isMulti = !!(market.childList?.length > 0) || (!market.yesTokenId && !market.yesLabel);

  // Use API-provided labels (YES/NO or UP/DOWN)
  const leftLabel = market.yesLabel || 'YES';
  const rightLabel = market.noLabel || 'NO';

  return `
    <div class="ol-emblem" data-market-id="${marketId}" data-token-id="${market.yesTokenId || ''}" data-is-multi="${isMulti ? 'true' : 'false'}">
      <div class="ol-emblem-glow"></div>
      <div class="ol-emblem-content">
        <a class="ol-emblem-brand" href="${OPINION_APP_URL}/detail?topicId=${marketId}${isMulti ? '&type=multi' : ''}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" class="ol-emblem-icon">
            <defs>
              <linearGradient id="olGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#6366F1"/>
                <stop offset="100%" style="stop-color:#8B5CF6"/>
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#olGrad)"/>
            <text x="12" y="16" text-anchor="middle" fill="white" font-size="11" font-weight="bold">O</text>
          </svg>
        </a>
        
        <a class="ol-emblem-title" href="${OPINION_APP_URL}/detail?topicId=${marketId}${isMulti ? '&type=multi' : ''}" target="_blank" rel="noopener">
          ${escapeHtml(title)}
        </a>

        <div class="ol-emblem-actions">
          <button class="ol-trade-btn ol-yes-btn" data-side="yes">
            <span class="ol-btn-label">${leftLabel}</span>
            <span class="ol-btn-price">${formatPrice(yesPrice)}</span>
          </button>
          <button class="ol-trade-btn ol-no-btn" data-side="no">
            <span class="ol-btn-label">${rightLabel}</span>
            <span class="ol-btn-price">${formatPrice(noPrice)}</span>
          </button>
        </div>
      </div>
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
 * Get enhanced emblem styles
 */
function getEnhancedStyles() {
  return `
    :host {
      --ol-primary: #6366F1;
      --ol-primary-light: #818CF8;
      --ol-green: #10B981;
      --ol-red: #EF4444;
      --ol-bg: rgba(20, 20, 28, 0.7);
      --ol-border: rgba(99, 102, 241, 0.25);
      --ol-text: #FFFFFF;
      --ol-text-muted: rgba(255, 255, 255, 0.8);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    .ol-container {
      margin: 6px 0 10px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    .ol-emblem {
      position: relative;
      display: inline-flex;
      border-radius: 9999px;
      padding: 1px;
      background: linear-gradient(90deg, var(--ol-border), transparent, var(--ol-border));
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      max-width: 100%;
    }
    
    .ol-emblem:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.2);
    }
    
    .ol-emblem-content {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--ol-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 9999px;
      padding: 6px 6px 6px 12px;
      height: 44px;
      min-width: 0;
    }
    
    .ol-emblem-brand {
      display: flex;
      align-items: center;
      text-decoration: none;
      flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    
    .ol-emblem-brand:hover {
      transform: scale(1.05);
    }
    
    .ol-emblem-icon {
      width: 22px;
      height: 22px;
    }
    
    .ol-emblem-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--ol-text);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 280px;
      letter-spacing: 0.1px;
      flex-grow: 1;
    }
    
    .ol-emblem-title:hover {
      text-decoration: underline;
      text-underline-offset: 4px;
      decoration-color: var(--ol-primary);
    }
    
    .ol-emblem-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    
    .ol-trade-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border: none;
      border-radius: 9999px;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.2s ease;
      color: #fff;
    }
    
    .ol-yes-btn {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    
    .ol-yes-btn:hover {
      background: rgba(16, 185, 129, 0.3);
    }
    
    .ol-no-btn {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    
    .ol-no-btn:hover {
      background: rgba(239, 68, 68, 0.3);
    }
    
    .ol-btn-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    
    .ol-yes-btn .ol-btn-label { color: var(--ol-green); }
    .ol-no-btn .ol-btn-label { color: var(--ol-red); }
    
    .ol-btn-price {
      font-size: 13px;
      font-weight: 600;
    }
    
    /* Price flash animations */
    @keyframes priceFlashUp {
      0% { background: rgba(16, 185, 129, 0.6); }
      100% { background: rgba(16, 185, 129, 0.15); }
    }
    @keyframes priceFlashDown {
      0% { background: rgba(239, 68, 68, 0.6); }
      100% { background: rgba(239, 68, 68, 0.15); }
    }
    .flash-up { animation: priceFlashUp 0.8s ease-out; }
    .flash-down { animation: priceFlashDown 0.8s ease-out; }

    /* Carousel overrides for emblem */
    .ol-carousel {
      max-width: 100%;
      overflow: hidden;
      position: relative;
    }
    .ol-carousel-track {
      display: flex;
      transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
    }
    .ol-carousel-slide {
      flex: 0 0 100%;
      display: none;
    }
    .ol-carousel-slide.active {
      display: block;
    }
    .ol-carousel-nav {
      display: none;
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
      const card = btn.closest('.ol-emblem');
      const side = btn.dataset.side;
      const marketId = card?.dataset.marketId;
      if (marketId) {
        const isMulti = card.dataset.isMulti === 'true';
        window.open(`${OPINION_APP_URL}/detail?topicId=${marketId}${isMulti ? '&type=multi' : ''}&side=${side}`, '_blank');
      }
    });
  });
}

/**
 * Process a single tweet
 */
async function processTweet(tweet) {
  // Check if someone else processed it while queued
  if (tweet.hasAttribute(CONFIG.statusAttr)) return;

  const tweetTextNode = tweet.querySelector('[data-testid="tweetText"]');
  if (!tweetTextNode) return;

  const text = tweetTextNode.textContent || '';
  if (text.length < 10) return; // Skip very short tweets

  // Mark as processing and save text hash (first 100 chars) to detect virtual DOM recycling
  const shortText = text.substring(0, 100);
  tweet.setAttribute(CONFIG.statusAttr, 'processing');
  tweet.setAttribute(CONFIG.textAttr, shortText);

  // Ensure index is fresh
  await refreshIndex();

  if (!marketIndex) {
    tweet.setAttribute(CONFIG.statusAttr, 'failed');
    return;
  }

  // Find matching markets
  const matches = marketIndex.findMatches(text);
  if (matches.length === 0) {
    tweet.setAttribute(CONFIG.statusAttr, 'no-match');
    return;
  }

  console.log(`[Opinion Lens] Found ${matches.length} markets for tweet`);

  // Fetch prices for top matches
  const topMatches = matches.slice(0, CONFIG.maxMarketsPerTweet);

  for (const match of topMatches) {
    try {
      const mId = match.market.marketId || match.market.id;
      // Fetch details first to ensure we have yesTokenId
      const details = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_MARKET_DETAILS,
        marketId: mId // pass marketId explicitly
      });

      if (details && !details.error) {
        // Merge details into market object (to get yesTokenId, volume24h, etc)
        Object.assign(match.market, details);
      }

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
      console.error('[Opinion Lens] Failed to fetch data for match:', match.market.marketId || match.market.id, e);
    }
  }

  // Inject cards
  injectMarketCards(tweet, topMatches);
  tweet.setAttribute(CONFIG.statusAttr, 'has-emblem');
}

/**
 * Update emblem prices dynamically with flash animation
 */
function updateEmblemPrice(data) {
  // data: { tokenId, price, type: 'yes'|'no'|etc }
  // We only get yes price from WebSocket usually, or the specific token price

  const containers = document.querySelectorAll(`.${CONFIG.cardClass}`);
  containers.forEach(container => {
    if (!container.shadowRoot) return;

    // Find emblems matching this token
    const emblems = container.shadowRoot.querySelectorAll(`.ol-emblem[data-token-id="${data.tokenId}"]`);

    emblems.forEach(emblem => {
      const yesBtn = emblem.querySelector('.ol-yes-btn');
      const noBtn = emblem.querySelector('.ol-no-btn');

      if (!yesBtn || !noBtn) return;

      const yesPriceEl = yesBtn.querySelector('.ol-btn-price');
      const noPriceEl = noBtn.querySelector('.ol-btn-price');

      const newYesPrice = parseFloat(data.price);
      const newNoPrice = 1 - newYesPrice;

      const oldYesPrice = parseFloat(yesPriceEl.textContent.replace('$', ''));

      if (Math.abs(oldYesPrice - newYesPrice) > 0.001) {
        yesPriceEl.textContent = formatPrice(newYesPrice);
        noPriceEl.textContent = formatPrice(newNoPrice);

        // Flash animation
        const flashClass = newYesPrice > oldYesPrice ? 'flash-up' : 'flash-down';

        // Remove existing animation if any
        yesBtn.classList.remove('flash-up', 'flash-down');
        noBtn.classList.remove('flash-up', 'flash-down');

        // Trigger reflow to restart animation
        void yesBtn.offsetWidth;
        void noBtn.offsetWidth;

        yesBtn.classList.add(flashClass);
        // Inverse flash for NO
        noBtn.classList.add(newYesPrice > oldYesPrice ? 'flash-down' : 'flash-up');

        // Clean up classes after animation (0.8s)
        setTimeout(() => {
          yesBtn.classList.remove('flash-up', 'flash-down');
          noBtn.classList.remove('flash-up', 'flash-down');
        }, 800);
      }
    });
  });
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
      updateEmblemPrice(message.data);
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
