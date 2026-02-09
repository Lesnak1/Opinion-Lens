/**
 * Opinion Lens - Popup Application
 * Shows API key required state when no key configured
 * No demo/mock data - real Opinion data only
 */

import { MESSAGE_TYPES, TRENDING_MARKETS_COUNT, OPINION_APP_URL } from '../shared/constants.js';
import { formatPrice, formatNumber, formatRelativeDate, debounce, escapeHtml } from '../shared/utils.js';

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
    hasApiKey: false,
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

    // Check connection status first
    await loadConnectionStatus();

    if (state.hasApiKey) {
        await Promise.all([
            loadMarkets(),
            loadWatchlist(),
        ]);
    } else {
        showApiKeyRequired();
    }

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
        if (state.hasApiKey) {
            loadMarkets();
            loadWatchlist();
        }
    });
}

/**
 * Load connection status
 */
async function loadConnectionStatus() {
    try {
        const status = await sendMessage(MESSAGE_TYPES.CONNECTION_STATUS);
        state.hasApiKey = status.hasApiKey;
        updateConnectionStatus(status);
    } catch {
        state.hasApiKey = false;
        updateConnectionStatus({ wsConnected: false, hasApiKey: false });
    }
}

/**
 * Update connection status UI
 */
function updateConnectionStatus(status) {
    const { wsConnected, hasApiKey } = status;

    if (!hasApiKey) {
        elements.connectionStatus.className = 'status status--no-key';
        elements.connectionStatus.title = 'API key required';
    } else if (wsConnected) {
        elements.connectionStatus.className = 'status status--connected';
        elements.connectionStatus.title = 'Connected - Live data';
    } else {
        elements.connectionStatus.className = 'status status--disconnected';
        elements.connectionStatus.title = 'Disconnected';
    }
}

/**
 * Show API key required message
 */
function showApiKeyRequired() {
    elements.trendingMarkets.innerHTML = `
        <div class="api-key-required">
            <div class="api-key-icon">🔑</div>
            <h3>API Key Required</h3>
            <p>To view live Opinion.trade markets, you need an API key.</p>
            <div class="api-key-steps">
                <p><strong>How to get one:</strong></p>
                <ol>
                    <li>Apply at <a href="https://docs.google.com/forms/d/1h7gp8UffZeXzYQ-lv4jcou9PoRNOqMAQhyW4IwZDnII" target="_blank">Opinion Builders Program</a></li>
                    <li>Wait for approval email</li>
                    <li>Enter your key in Settings</li>
                </ol>
            </div>
            <button class="btn-primary" id="openSettingsBtn">
                ⚙️ Open Settings
            </button>
        </div>
    `;

    // Add click handler
    document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Disable search
    elements.searchInput.disabled = true;
    elements.searchInput.placeholder = 'API key required...';
}

/**
 * Load trending markets
 */
async function loadMarkets() {
    if (!state.hasApiKey) {
        showApiKeyRequired();
        return;
    }

    elements.trendingMarkets.innerHTML = '<div class="loading">Loading markets...</div>';

    try {
        const markets = await sendMessage(MESSAGE_TYPES.GET_MARKETS, {
            params: { limit: TRENDING_MARKETS_COUNT, sortBy: 5 }
        });

        if (markets.error) {
            throw new Error(markets.error);
        }

        state.markets = markets || [];
        renderTrendingMarkets();
    } catch (error) {
        console.error('Failed to load markets:', error);

        if (error.message === 'API_KEY_REQUIRED' || error.message === 'INVALID_API_KEY') {
            state.hasApiKey = false;
            showApiKeyRequired();
        } else {
            elements.trendingMarkets.innerHTML = `
                <div class="error-state">
                    <span class="error-icon">⚠️</span>
                    <p>Failed to load markets</p>
                    <p class="error-detail">${escapeHtml(error.message)}</p>
                    <button class="btn-retry" onclick="location.reload()">Retry</button>
                </div>
            `;
        }
    }
}

/**
 * Load watchlist
 */
async function loadWatchlist() {
    try {
        state.watchlist = await sendMessage(MESSAGE_TYPES.GET_WATCHLIST) || [];
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
        elements.trendingMarkets.innerHTML = `
            <div class="empty-state">
                <p>No active markets found</p>
            </div>
        `;
        return;
    }

    elements.trendingMarkets.innerHTML = state.markets.map(market => {
        const marketId = market.marketId || market.id;
        return renderMarketCard(market, state.watchlist.includes(String(marketId)));
    }).join('');

    attachCardListeners(elements.trendingMarkets);
}

/**
 * Render watchlist
 */
async function renderWatchlist() {
    if (!state.hasApiKey) {
        elements.watchlistMarkets.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔑</span>
                <p>API key required</p>
            </div>
        `;
        return;
    }

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
            if (market && !market.error) {
                watchlistMarkets.push(market);
            }
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
    const marketId = market.marketId || market.id;
    const title = market.title || market.marketTitle;

    // Get prices from tokens array
    let yesPrice = 0.5, noPrice = 0.5;
    if (market.tokens && market.tokens.length >= 2) {
        yesPrice = parseFloat(market.tokens[0]?.lastPrice) || 0.5;
        noPrice = parseFloat(market.tokens[1]?.lastPrice) || 0.5;
    }

    const volume = market.volume24h || 0;
    const endDate = market.resolutionDate || market.endDate;

    return `
        <div class="market-card" data-market-id="${marketId}">
            <div class="market-header">
                <span class="market-title">${escapeHtml(title)}</span>
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
                <span>Vol: $${formatNumber(volume)}</span>
                <span>Ends: ${formatRelativeDate(endDate)}</span>
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
            chrome.tabs.create({ url: `${OPINION_APP_URL}/market/${marketId}` });
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
    if (!state.hasApiKey) return;

    const query = e.target.value.trim();

    if (!query) {
        loadMarkets();
        return;
    }

    try {
        const results = await sendMessage(MESSAGE_TYPES.SEARCH_MARKETS, { query });
        state.markets = results?.error ? [] : (results || []);
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
            updateConnectionStatus(message);
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
