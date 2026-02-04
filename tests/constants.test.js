/**
 * Tests for shared/constants.js
 */

import { describe, it, expect } from 'vitest';
import {
    API_BASE_URL,
    WS_URL,
    OPINION_APP_URL,
    API_RATE_LIMIT,
    CACHE_TTL,
    MESSAGE_TYPES,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    MACRO_KEYWORDS,
    ALL_KEYWORDS,
    KEYWORD_SET,
    TRENDING_MARKETS_COUNT,
    MAX_WATCHLIST_SIZE,
} from '../shared/constants.js';

describe('API Configuration', () => {
    it('has valid API base URL', () => {
        expect(API_BASE_URL).toBe('https://api.opinion.trade/v1');
        expect(API_BASE_URL).toMatch(/^https:\/\//);
    });

    it('has valid WebSocket URL', () => {
        expect(WS_URL).toBe('wss://ws.opinion.trade');
        expect(WS_URL).toMatch(/^wss:\/\//);
    });

    it('has valid Opinion app URL', () => {
        expect(OPINION_APP_URL).toBe('https://app.opinion.trade');
    });

    it('has reasonable rate limit', () => {
        expect(API_RATE_LIMIT).toBe(15);
        expect(API_RATE_LIMIT).toBeGreaterThan(0);
        expect(API_RATE_LIMIT).toBeLessThanOrEqual(60);
    });
});

describe('Cache TTL', () => {
    it('has all required cache keys', () => {
        expect(CACHE_TTL).toHaveProperty('MARKETS');
        expect(CACHE_TTL).toHaveProperty('MARKET_DETAILS');
        expect(CACHE_TTL).toHaveProperty('PRICES');
        expect(CACHE_TTL).toHaveProperty('ORDERBOOK');
        expect(CACHE_TTL).toHaveProperty('POSITIONS');
    });

    it('has reasonable TTL values in milliseconds', () => {
        expect(CACHE_TTL.MARKETS).toBeGreaterThanOrEqual(60000); // At least 1 minute
        expect(CACHE_TTL.PRICES).toBeLessThanOrEqual(60000); // At most 1 minute
    });
});

describe('Message Types', () => {
    it('has all market-related message types', () => {
        expect(MESSAGE_TYPES.GET_MARKETS).toBeDefined();
        expect(MESSAGE_TYPES.GET_MARKET_DETAILS).toBeDefined();
        expect(MESSAGE_TYPES.GET_PRICES).toBeDefined();
        expect(MESSAGE_TYPES.SEARCH_MARKETS).toBeDefined();
    });

    it('has all watchlist message types', () => {
        expect(MESSAGE_TYPES.GET_WATCHLIST).toBeDefined();
        expect(MESSAGE_TYPES.ADD_TO_WATCHLIST).toBeDefined();
        expect(MESSAGE_TYPES.REMOVE_FROM_WATCHLIST).toBeDefined();
    });

    it('has all alert message types', () => {
        expect(MESSAGE_TYPES.GET_ALERTS).toBeDefined();
        expect(MESSAGE_TYPES.CREATE_ALERT).toBeDefined();
        expect(MESSAGE_TYPES.DELETE_ALERT).toBeDefined();
        expect(MESSAGE_TYPES.ALERT_TRIGGERED).toBeDefined();
    });

    it('has all settings message types', () => {
        expect(MESSAGE_TYPES.GET_SETTINGS).toBeDefined();
        expect(MESSAGE_TYPES.UPDATE_SETTINGS).toBeDefined();
    });

    it('has broadcast message types', () => {
        expect(MESSAGE_TYPES.PRICE_UPDATE).toBeDefined();
        expect(MESSAGE_TYPES.MARKET_UPDATE).toBeDefined();
        expect(MESSAGE_TYPES.CONNECTION_STATUS).toBeDefined();
    });

    it('has unique message type values', () => {
        const values = Object.values(MESSAGE_TYPES);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(values.length);
    });
});

describe('Storage Keys', () => {
    it('has all required storage keys', () => {
        expect(STORAGE_KEYS.API_KEY).toBeDefined();
        expect(STORAGE_KEYS.WATCHLIST).toBeDefined();
        expect(STORAGE_KEYS.ALERTS).toBeDefined();
        expect(STORAGE_KEYS.SETTINGS).toBeDefined();
    });

    it('has unique storage key values', () => {
        const values = Object.values(STORAGE_KEYS);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(values.length);
    });
});

describe('Default Settings', () => {
    it('has theme setting', () => {
        expect(DEFAULT_SETTINGS.theme).toBe('dark');
    });

    it('has notification settings', () => {
        expect(DEFAULT_SETTINGS.notifications).toBeDefined();
        expect(DEFAULT_SETTINGS.notifications.priceAlerts).toBe(true);
        expect(DEFAULT_SETTINGS.notifications.marketEvents).toBe(true);
        expect(DEFAULT_SETTINGS.notifications.portfolioUpdates).toBe(true);
    });

    it('has display settings', () => {
        expect(DEFAULT_SETTINGS.display).toBeDefined();
        expect(DEFAULT_SETTINGS.display.priceFormat).toBeDefined();
        expect(DEFAULT_SETTINGS.display.refreshInterval).toBeGreaterThan(0);
    });

    it('has Twitter settings', () => {
        expect(DEFAULT_SETTINGS.twitter).toBeDefined();
        expect(DEFAULT_SETTINGS.twitter.enabled).toBe(true);
        expect(DEFAULT_SETTINGS.twitter.showMarketCards).toBe(true);
    });
});

describe('Macro Keywords', () => {
    it('has central banks keywords', () => {
        expect(MACRO_KEYWORDS.centralBanks).toContain('FOMC');
        expect(MACRO_KEYWORDS.centralBanks).toContain('Fed');
        expect(MACRO_KEYWORDS.centralBanks).toContain('Powell');
    });

    it('has economic indicators keywords', () => {
        expect(MACRO_KEYWORDS.indicators).toContain('CPI');
        expect(MACRO_KEYWORDS.indicators).toContain('GDP');
        expect(MACRO_KEYWORDS.indicators).toContain('NFP');
    });

    it('has geopolitical keywords', () => {
        expect(MACRO_KEYWORDS.geopolitical).toContain('tariff');
        expect(MACRO_KEYWORDS.geopolitical).toContain('OPEC');
    });

    it('has crypto keywords', () => {
        expect(MACRO_KEYWORDS.crypto).toContain('Bitcoin');
        expect(MACRO_KEYWORDS.crypto).toContain('BTC');
        expect(MACRO_KEYWORDS.crypto).toContain('ETF');
    });
});

describe('ALL_KEYWORDS', () => {
    it('is a flat array of all keywords', () => {
        expect(Array.isArray(ALL_KEYWORDS)).toBe(true);
        expect(ALL_KEYWORDS.length).toBeGreaterThan(0);
    });

    it('contains keywords from all categories', () => {
        expect(ALL_KEYWORDS).toContain('FOMC');
        expect(ALL_KEYWORDS).toContain('CPI');
        expect(ALL_KEYWORDS).toContain('tariff');
        expect(ALL_KEYWORDS).toContain('Bitcoin');
    });
});

describe('KEYWORD_SET', () => {
    it('is a Set for fast lookup', () => {
        expect(KEYWORD_SET instanceof Set).toBe(true);
    });

    it('contains lowercase keywords', () => {
        expect(KEYWORD_SET.has('fomc')).toBe(true);
        expect(KEYWORD_SET.has('cpi')).toBe(true);
        expect(KEYWORD_SET.has('bitcoin')).toBe(true);
    });

    it('has same size as ALL_KEYWORDS', () => {
        expect(KEYWORD_SET.size).toBe(ALL_KEYWORDS.length);
    });
});

describe('UI Constants', () => {
    it('has reasonable trending markets count', () => {
        expect(TRENDING_MARKETS_COUNT).toBe(5);
        expect(TRENDING_MARKETS_COUNT).toBeGreaterThan(0);
        expect(TRENDING_MARKETS_COUNT).toBeLessThanOrEqual(20);
    });

    it('has reasonable max watchlist size', () => {
        expect(MAX_WATCHLIST_SIZE).toBe(20);
        expect(MAX_WATCHLIST_SIZE).toBeGreaterThan(0);
    });
});
