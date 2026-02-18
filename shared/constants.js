/**
 * Opinion Lens - Shared Constants
 * Central configuration for the extension
 */

// API Configuration
export const API_BASE_URL = 'https://api.opinion.trade/v1';
export const WS_URL = 'wss://ws.opinion.trade';
export const OPINION_APP_URL = 'https://app.opinion.trade';

// Rate Limiting
export const API_RATE_LIMIT = 15; // requests per second
export const API_RETRY_ATTEMPTS = 3;
export const API_RETRY_BASE_DELAY = 1000; // ms

// Cache TTL (milliseconds)
export const CACHE_TTL = {
    MARKETS: 5 * 60 * 1000,      // 5 minutes
    MARKET_DETAILS: 2 * 60 * 1000, // 2 minutes
    PRICES: 30 * 1000,            // 30 seconds (fallback when WS disconnected)
    ORDERBOOK: 30 * 1000,         // 30 seconds
    POSITIONS: 60 * 1000,         // 1 minute
};

// WebSocket
export const WS_HEARTBEAT_INTERVAL = 30000; // 30 seconds
export const WS_RECONNECT_MAX_ATTEMPTS = 5;
export const WS_RECONNECT_BASE_DELAY = 1000;

// Message Types (Internal Communication)
export const MESSAGE_TYPES = {
    // Requests
    GET_MARKETS: 'GET_MARKETS',
    GET_MARKET_DETAILS: 'GET_MARKET_DETAILS',
    GET_PRICES: 'GET_PRICES',
    GET_WATCHLIST: 'GET_WATCHLIST',
    ADD_TO_WATCHLIST: 'ADD_TO_WATCHLIST',
    REMOVE_FROM_WATCHLIST: 'REMOVE_FROM_WATCHLIST',
    GET_ALERTS: 'GET_ALERTS',
    CREATE_ALERT: 'CREATE_ALERT',
    DELETE_ALERT: 'DELETE_ALERT',
    GET_SETTINGS: 'GET_SETTINGS',
    UPDATE_SETTINGS: 'UPDATE_SETTINGS',
    SEARCH_MARKETS: 'SEARCH_MARKETS',
    GET_LATEST_PRICE: 'GET_LATEST_PRICE',
    SUBSCRIBE_USER_MARKET: 'SUBSCRIBE_USER_MARKET',

    // Broadcasts
    PRICE_UPDATE: 'PRICE_UPDATE',
    MARKET_UPDATE: 'MARKET_UPDATE',
    USER_ORDER_UPDATE: 'USER_ORDER_UPDATE',
    USER_TRADE_EXECUTED: 'USER_TRADE_EXECUTED',
    ALERT_TRIGGERED: 'ALERT_TRIGGERED',
    CONNECTION_STATUS: 'CONNECTION_STATUS',
};

// Storage Keys
export const STORAGE_KEYS = {
    API_KEY: 'opinion_api_key',
    WATCHLIST: 'opinion_watchlist',
    ALERTS: 'opinion_alerts',
    SETTINGS: 'opinion_settings',
    CACHE_MARKETS: 'cache_markets',
    CACHE_PRICES: 'cache_prices',
};

// Default Settings
export const DEFAULT_SETTINGS = {
    theme: 'dark',
    notifications: {
        priceAlerts: true,
        marketEvents: true,
        portfolioUpdates: true,
    },
    display: {
        priceFormat: 'cents', // 'cents' | 'percentage'
        refreshInterval: 30000,
    },
    twitter: {
        enabled: true,
        showMarketCards: true,
        showPriceOverlays: true,
    },
};

// Macro Keywords for Twitter Detection
export const MACRO_KEYWORDS = {
    centralBanks: [
        'FOMC', 'Fed', 'Federal Reserve', 'Powell',
        'ECB', 'Lagarde', 'BOE', 'BOJ', 'PBOC',
        'rate cut', 'rate hike', 'interest rate',
        'hawkish', 'dovish', 'pivot', 'QE', 'QT',
    ],
    indicators: [
        'CPI', 'inflation', 'PPI', 'PCE',
        'GDP', 'jobs report', 'NFP', 'payroll',
        'unemployment', 'retail sales', 'ISM', 'PMI',
    ],
    geopolitical: [
        'tariff', 'sanctions', 'trade war',
        'OPEC', 'oil', 'treasury', 'yield curve',
        'recession', 'stimulus', 'debt ceiling',
    ],
    crypto: [
        'Bitcoin', 'BTC', 'Ethereum', 'ETH',
        'halving', 'ETF', 'SEC', 'spot ETF',
    ],
};

// Flatten keywords for quick lookup
export const ALL_KEYWORDS = Object.values(MACRO_KEYWORDS).flat();
export const KEYWORD_SET = new Set(ALL_KEYWORDS.map(k => k.toLowerCase()));

// UI Constants
export const POPUP_WIDTH = 400;
export const POPUP_HEIGHT = 600;
export const TRENDING_MARKETS_COUNT = 5;
export const MAX_WATCHLIST_SIZE = 20;
