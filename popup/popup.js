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
    newSection: document.getElementById('newSection'),
    watchlistSection: document.getElementById('watchlistSection'),
    aboutSection: document.getElementById('aboutSection'),
    trendingMarkets: document.getElementById('trendingMarkets'),
    newMarkets: document.getElementById('newMarkets'),
    watchlistMarkets: document.getElementById('watchlistMarkets'),
    refreshBtn: document.getElementById('refreshBtn'),
};

// State
let state = {
    markets: [],
    newMarketsList: [],
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

    // Load UI based on API key status
    if (state.hasApiKey) {
        await Promise.all([
            loadPortfolio(),
            loadMarkets(),
            loadNewMarkets(),
            loadWatchlist(),
        ]);
    } else {
        // Load trending + new markets + watchlist (all from public endpoint)
        await Promise.all([
            loadMarkets(),
            loadNewMarkets(),
            loadWatchlist(),
        ]);
    }

    // Listen for real-time updates
    chrome.runtime.onMessage.addListener(handleMessage);

    // Auto-refresh trending + new markets list every 60 seconds while popup is open
    setInterval(() => {
        loadMarkets();
        loadNewMarkets();
        if (state.hasApiKey) {
            loadPortfolio();
        }
    }, 60000);
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
        loadNewMarkets();
        if (state.hasApiKey) {
            loadPortfolio();
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
 * Load Portfolio
 */
async function loadPortfolio() {
    elements.totalValue.textContent = '...';
    elements.todayPnl.textContent = '...';
    elements.positionCount.textContent = '...';

    try {
        const positions = await sendMessage(MESSAGE_TYPES.GET_USER_POSITIONS, { params: { pageSize: 100 } });

        if (positions?.error) {
            console.log('[Opinion Lens] Portfolio fetch error or no wallet:', positions.error);
            elements.totalValue.textContent = '$0.00';
            elements.todayPnl.textContent = '$0.00';
            elements.positionCount.textContent = '0';
            return;
        }

        if (Array.isArray(positions)) {
            let totalValue = 0;
            let totalPnl = 0;
            let activeCount = 0;

            positions.forEach(pos => {
                const val = parseFloat(pos.currentValueInQuoteToken || 0);
                const pnl = parseFloat(pos.unrealizedPnl || 0);
                // only count positions with some value
                if (val > 0.001 || Math.abs(pnl) > 0.001) {
                    totalValue += val;
                    totalPnl += pnl;
                    activeCount++;
                }
            });

            elements.totalValue.textContent = `$${formatNumber(totalValue)}`;

            const isPositive = totalPnl >= 0;
            elements.todayPnl.textContent = `${isPositive ? '+' : ''}$${formatNumber(totalPnl)}`;
            elements.todayPnl.className = `portfolio-value portfolio-pnl ${isPositive ? 'positive' : 'negative'}`;

            elements.positionCount.textContent = activeCount.toString();
        }
    } catch (e) {
        console.error('[Opinion Lens] Failed to load portfolio', e);
        elements.totalValue.textContent = '$0.00';
        elements.todayPnl.textContent = '$0.00';
        elements.positionCount.textContent = '0';
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
    elements.trendingMarkets.innerHTML = '<div class="loading">Loading markets...</div>';

    try {
        const markets = await sendMessage(MESSAGE_TYPES.GET_MARKETS, {
            params: { limit: TRENDING_MARKETS_COUNT, sortBy: 5 }
        });

        if (markets?.error) {
            throw new Error(markets.error);
        }

        state.markets = Array.isArray(markets) ? markets : [];
        renderTrendingMarkets();

        // Lazy-load prices for each market
        loadMarketPrices();
    } catch (error) {
        console.error('Failed to load markets:', error);

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

/**
 * Load new markets (sorted by newest first)
 */
async function loadNewMarkets() {
    elements.newMarkets.innerHTML = '<div class="loading">Loading new markets...</div>';

    try {
        // Fetch with sortBy=1 (newest first) - the API client handles active filtering
        const markets = await sendMessage(MESSAGE_TYPES.GET_MARKETS, {
            params: { limit: TRENDING_MARKETS_COUNT, sortBy: 1 }
        });

        if (markets?.error) {
            throw new Error(markets.error);
        }

        state.newMarketsList = Array.isArray(markets) ? markets : [];
        renderNewMarkets();
    } catch (error) {
        console.error('Failed to load new markets:', error);
        elements.newMarkets.innerHTML = `
            <div class="error-state">
                <span class="error-icon">⚠️</span>
                <p>Failed to load new markets</p>
                <button class="btn-retry" onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

/**
 * Render new markets
 */
function renderNewMarkets() {
    if (state.newMarketsList.length === 0) {
        elements.newMarkets.innerHTML = `
            <div class="empty-state">
                <p>No new markets found</p>
            </div>
        `;
        return;
    }

    elements.newMarkets.innerHTML = state.newMarketsList.map(market => {
        const marketId = market.marketId || market.id;
        return renderMarketCard(market, state.watchlist.includes(String(marketId)));
    }).join('');

    attachCardListeners(elements.newMarkets);
}

async function loadMarketPrices() {
    for (const market of state.markets) {
        let yesTokenId = market.yesTokenId;
        const marketId = market.marketId || market.id;

        try {
            // If yesTokenId is missing from list response, fetch market details
            if (!yesTokenId && marketId) {
                const details = await sendMessage(MESSAGE_TYPES.GET_MARKET_DETAILS, { marketId });
                if (details && !details.error) {
                    yesTokenId = details.yesTokenId;
                    Object.assign(market, details); // Cache details
                }
            }

            if (!yesTokenId) continue;

            const priceData = await sendMessage(MESSAGE_TYPES.GET_LATEST_PRICE, { tokenId: yesTokenId });
            if (priceData && priceData.price) {
                const yesPrice = parseFloat(priceData.price);
                const noPrice = 1 - yesPrice;
                const card = document.querySelector(`[data-market-id="${marketId}"]`);
                if (card) {
                    const yesFill = card.querySelector('.price-bar.yes .price-bar-fill');
                    const noFill = card.querySelector('.price-bar.no .price-bar-fill');
                    const yesLabel = card.querySelector('.price-label.yes span:last-child');
                    const noLabel = card.querySelector('.price-label.no span:last-child');
                    if (yesFill) yesFill.style.width = `${yesPrice * 100}%`;
                    if (noFill) noFill.style.width = `${noPrice * 100}%`;
                    if (yesLabel) yesLabel.textContent = formatPrice(yesPrice);
                    if (noLabel) noLabel.textContent = formatPrice(noPrice);
                }
            }
        } catch (e) {
            console.error('[Opinion Lens] Failed to fetch price for market', marketId, e);
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

    // Try to find market data from already-loaded trending + new markets first
    const allLoadedMarkets = [...state.markets, ...state.newMarketsList];
    const watchlistMarkets = [];

    for (const marketId of state.watchlist) {
        // Check local cache first
        const cached = allLoadedMarkets.find(m => String(m.marketId || m.id) === String(marketId));
        if (cached) {
            watchlistMarkets.push(cached);
            continue;
        }

        // Fallback: try fetching details from API (works with or without API key via /topic/{id})
        try {
            const market = await sendMessage(MESSAGE_TYPES.GET_MARKET_DETAILS, { marketId });
            if (market && !market.error) {
                watchlistMarkets.push(market);
            }
        } catch (error) {
            console.warn('[Opinion Lens] Could not load watchlist market:', marketId);
        }
    }

    if (watchlistMarkets.length === 0) {
        elements.watchlistMarkets.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">⭐</span>
                <p>No watchlist data available</p>
                <p class="empty-hint">Markets may have expired or been removed</p>
            </div>
        `;
        return;
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
    const title = market.marketTitle || market.title || 'Untitled Market';

    // Default prices (will be updated by loadMarketPrices if live)
    const yesPrice = market.yesPrice !== undefined ? market.yesPrice : 0.5;
    const noPrice = 1 - yesPrice;

    const volume = parseFloat(market.volume24h) || 0;
    // cutoffAt is a unix timestamp in seconds
    const endDate = market.cutoffAt ? new Date(market.cutoffAt * 1000).toISOString() : null;
    const yesTokenId = market.yesTokenId || '';

    return `
        <div class="market-card" data-market-id="${marketId}" data-token-id="${yesTokenId}">
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
                        <span>${market.yesLabel || 'Yes'}</span>
                        <span>${formatPrice(yesPrice)}</span>
                    </div>
                </div>
                <div class="price-bar no">
                    <div class="price-bar-track">
                        <div class="price-bar-fill" style="width: ${noPrice * 100}%"></div>
                    </div>
                    <div class="price-label no">
                        <span>${market.noLabel || 'No'}</span>
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
            const isMulti = card.dataset.isMulti === 'true';
            const targetUrl = `${OPINION_APP_URL}/detail?topicId=${marketId}${isMulti ? '&type=multi' : ''}`;
            chrome.tabs.create({ url: targetUrl });
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
    elements.newSection.classList.toggle('hidden', tab !== 'new');
    elements.watchlistSection.classList.toggle('hidden', tab !== 'watchlist');
    elements.aboutSection.classList.toggle('hidden', tab !== 'about');

    // Hide search and footer on about tab
    const searchContainer = document.querySelector('.search-container');
    const footer = document.querySelector('.footer');
    if (searchContainer) searchContainer.style.display = tab === 'about' ? 'none' : '';
    if (footer) footer.style.display = tab === 'about' ? 'none' : '';
}

/**
 * Handle search
 */
async function handleSearch(e) {
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
        const yesFill = card.querySelector('.price-bar.yes .price-bar-fill');
        const noFill = card.querySelector('.price-bar.no .price-bar-fill');
        const yesLabel = card.querySelector('.price-label.yes span:last-child');
        const noLabel = card.querySelector('.price-label.no span:last-child');

        const yesPrice = parseFloat(data.price);
        const noPrice = 1 - yesPrice;

        // Perform flash animation if elements exist
        if (yesLabel && noLabel && yesFill && noFill) {
            yesFill.style.width = `${yesPrice * 100}%`;
            noFill.style.width = `${noPrice * 100}%`;
            yesLabel.textContent = formatPrice(yesPrice);
            noLabel.textContent = formatPrice(noPrice);

            // Subtle flash effect on the card
            card.style.transition = 'background-color 0.3s ease';
            card.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
            setTimeout(() => {
                card.style.backgroundColor = '';
            }, 400);
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
