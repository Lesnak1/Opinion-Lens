/**
 * Opinion Lens - Popup Application
 */

import { MESSAGE_TYPES, TRENDING_MARKETS_COUNT } from '../shared/constants.js';
import { formatPrice, formatPnL, formatNumber, formatRelativeDate, debounce, escapeHtml } from '../shared/utils.js';

// DOM Elements
const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    settingsBtn: document.getElementById('settingsBtn'),
    totalValue: document.getElementById('totalValue'),
    todayPnl: document.getElementById('todayPnl'),
    positionCount: document.getElementById('positionCount'),
    searchInput: document.getElementById('searchInput'),
    tabs: document.querySelectorAll('.tab'),
    trendingSection: document.getElementById('trendingSection'),
    watchlistSection: document.getElementById('watchlistSection'),
    trendingMarkets: document.getElementById('trendingMarkets'),
    watchlistMarkets: document.getElementById('watchlistMarkets'),
    refreshBtn: document.getElementById('refreshBtn'),
};

// State
let state = {
    markets: [],
    watchlist: [],
    activeTab: 'trending',
    isLoading: true,
};

/**
 * Send message to service worker
 */
async function sendMessage(type, data = {}) {
    return chrome.runtime.sendMessage({ type, ...data });
}

/**
 * Initialize popup
 */
async function init() {
    setupEventListeners();
    await Promise.all([
        loadConnectionStatus(),
        loadMarkets(),
        loadWatchlist(),
    ]);

    // Listen for real-time updates
    chrome.runtime.onMessage.addListener(handleMessage);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Settings button
    elements.settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Tabs
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Search
    elements.searchInput.addEventListener('input', debounce(handleSearch, 300));

    // Refresh
    elements.refreshBtn.addEventListener('click', () => {
        loadMarkets();
        loadWatchlist();
    });
}

/**
 * Load connection status
 */
async function loadConnectionStatus() {
    try {
        const status = await sendMessage(MESSAGE_TYPES.CONNECTION_STATUS);
        updateConnectionStatus(status.connected);
    } catch {
        updateConnectionStatus(false);
    }
}

/**
 * Update connection status UI
 */
function updateConnectionStatus(connected) {
    elements.connectionStatus.className = `status status--${connected ? 'connected' : 'disconnected'}`;
    elements.connectionStatus.title = connected ? 'Connected' : 'Disconnected';
}

/**
 * Load trending markets
 */
async function loadMarkets() {
    try {
        const data = await sendMessage(MESSAGE_TYPES.GET_MARKETS, {
            params: { limit: TRENDING_MARKETS_COUNT, sort: 5 }
        });
        state.markets = data.items || [];
        renderTrendingMarkets();
    } catch (error) {
        console.error('Failed to load markets:', error);
        elements.trendingMarkets.innerHTML = '<div class="empty-state"><p>Failed to load markets</p></div>';
    }
}

/**
 * Load watchlist
 */
async function loadWatchlist() {
    try {
        state.watchlist = await sendMessage(MESSAGE_TYPES.GET_WATCHLIST);
        renderWatchlist();
    } catch (error) {
        console.error('Failed to load watchlist:', error);
    }
}

/**
 * Render trending markets
 */
function renderTrendingMarkets() {
    if (state.markets.length === 0) {
        elements.trendingMarkets.innerHTML = '<div class="empty-state"><p>No markets available</p></div>';
        return;
    }

    elements.trendingMarkets.innerHTML = state.markets.map(market =>
        renderMarketCard(market, state.watchlist.includes(market.marketId))
    ).join('');

    attachCardListeners(elements.trendingMarkets);
}

/**
 * Render watchlist
 */
async function renderWatchlist() {
    if (state.watchlist.length === 0) {
        elements.watchlistMarkets.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⭐</span>
        <p>No markets in watchlist</p>
        <p class="empty-hint">Click the star on any market to add it</p>
      </div>
    `;
        return;
    }

    // Fetch details for watchlist markets
    const watchlistMarkets = [];
    for (const marketId of state.watchlist) {
        try {
            const market = await sendMessage(MESSAGE_TYPES.GET_MARKET_DETAILS, { marketId });
            watchlistMarkets.push(market);
        } catch (error) {
            console.error('Failed to load market:', marketId, error);
        }
    }

    elements.watchlistMarkets.innerHTML = watchlistMarkets.map(market =>
        renderMarketCard(market, true)
    ).join('');

    attachCardListeners(elements.watchlistMarkets);
}

/**
 * Render market card HTML
 */
function renderMarketCard(market, isWatched) {
    const yesToken = market.tokens?.[0];
    const noToken = market.tokens?.[1];
    const yesPrice = yesToken?.lastPrice || 0.5;
    const noPrice = noToken?.lastPrice || 0.5;

    return `
    <div class="market-card" data-market-id="${market.marketId}">
      <div class="market-header">
        <span class="market-title">${escapeHtml(market.title)}</span>
        <span class="market-star ${isWatched ? 'active' : ''}" data-action="toggle-watchlist">
          ${isWatched ? '★' : '☆'}
        </span>
      </div>
      <div class="market-prices">
        <div class="price-bar yes">
          <div class="price-bar-track">
            <div class="price-bar-fill" style="width: ${yesPrice * 100}%"></div>
          </div>
          <div class="price-label yes">
            <span>Yes</span>
            <span>${formatPrice(yesPrice)}</span>
          </div>
        </div>
        <div class="price-bar no">
          <div class="price-bar-track">
            <div class="price-bar-fill" style="width: ${noPrice * 100}%"></div>
          </div>
          <div class="price-label no">
            <span>No</span>
            <span>${formatPrice(noPrice)}</span>
          </div>
        </div>
      </div>
      <div class="market-meta">
        <span>Vol: $${formatNumber(market.volume24h || 0)}</span>
        <span>Ends: ${formatRelativeDate(market.resolutionDate)}</span>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to market cards
 */
function attachCardListeners(container) {
    container.querySelectorAll('.market-card').forEach(card => {
        const marketId = card.dataset.marketId;

        // Card click → open market
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-action]')) return;
            chrome.tabs.create({ url: `https://app.opinion.trade/market/${marketId}` });
        });

        // Star click → toggle watchlist
        card.querySelector('.market-star').addEventListener('click', async (e) => {
            e.stopPropagation();
            const star = e.target;
            const isWatched = star.classList.contains('active');

            if (isWatched) {
                await sendMessage(MESSAGE_TYPES.REMOVE_FROM_WATCHLIST, { marketId });
                state.watchlist = state.watchlist.filter(id => id !== marketId);
            } else {
                await sendMessage(MESSAGE_TYPES.ADD_TO_WATCHLIST, { marketId });
                state.watchlist.push(marketId);
            }

            star.classList.toggle('active');
            star.textContent = isWatched ? '☆' : '★';

            if (state.activeTab === 'watchlist') {
                renderWatchlist();
            }
        });
    });
}

/**
 * Switch tab
 */
function switchTab(tab) {
    state.activeTab = tab;

    elements.tabs.forEach(t => {
        t.classList.toggle('tab--active', t.dataset.tab === tab);
    });

    elements.trendingSection.classList.toggle('hidden', tab !== 'trending');
    elements.watchlistSection.classList.toggle('hidden', tab !== 'watchlist');
}

/**
 * Handle search
 */
async function handleSearch(e) {
    const query = e.target.value.trim();

    if (!query) {
        renderTrendingMarkets();
        return;
    }

    try {
        const results = await sendMessage(MESSAGE_TYPES.SEARCH_MARKETS, { query });
        state.markets = results;
        renderTrendingMarkets();
    } catch (error) {
        console.error('Search failed:', error);
    }
}

/**
 * Handle incoming messages (real-time updates)
 */
function handleMessage(message) {
    switch (message.type) {
        case MESSAGE_TYPES.PRICE_UPDATE:
            updateMarketPrice(message.data);
            break;
        case MESSAGE_TYPES.CONNECTION_STATUS:
            updateConnectionStatus(message.connected);
            break;
    }
}

/**
 * Update market price in UI
 */
function updateMarketPrice(data) {
    const cards = document.querySelectorAll(`[data-token-id="${data.tokenId}"]`);
    cards.forEach(card => {
        const priceEl = card.querySelector('.price-value');
        if (priceEl) {
            priceEl.textContent = formatPrice(data.price);
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
