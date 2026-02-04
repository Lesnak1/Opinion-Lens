/**
 * Opinion Lens - API Client
 * Wrapper for Opinion.trade REST API with retry logic and caching
 */

import {
    API_BASE_URL,
    API_RETRY_ATTEMPTS,
    API_RETRY_BASE_DELAY,
    CACHE_TTL
} from '../shared/constants.js';
import { storage } from '../shared/storage.js';
import { sleep } from '../shared/utils.js';

class APIClient {
    constructor() {
        this.apiKey = null;
        this.requestQueue = [];
        this.lastRequestTime = 0;
        this.minRequestInterval = 67; // ~15 req/s
    }

    /**
     * Initialize API client with API key
     */
    async init() {
        this.apiKey = await storage.getApiKey();
        return !!this.apiKey;
    }

    /**
     * Get request headers
     */
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'apikey': this.apiKey })
        };
    }

    /**
     * Rate-limited fetch with retry
     */
    async fetch(endpoint, options = {}) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            await sleep(this.minRequestInterval - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();

        const url = `${API_BASE_URL}${endpoint}`;

        for (let attempt = 0; attempt < API_RETRY_ATTEMPTS; attempt++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: { ...this.getHeaders(), ...options.headers }
                });

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || 1;
                    await sleep(parseInt(retryAfter) * 1000);
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                if (data.code !== 0) {
                    throw new Error(data.message || 'API Error');
                }

                return data.data;
            } catch (error) {
                if (attempt === API_RETRY_ATTEMPTS - 1) {
                    throw error;
                }
                await sleep(API_RETRY_BASE_DELAY * Math.pow(2, attempt));
            }
        }
    }

    /**
     * Get markets list
     */
    async getMarkets(params = {}) {
        const { page = 1, limit = 10, status = 'activated', sort = 5 } = params;
        const query = new URLSearchParams({ page, limit, status, sort }).toString();

        const cacheKey = `markets_${query}`;
        if (await storage.isCacheValid(cacheKey, CACHE_TTL.MARKETS)) {
            const cached = await storage.getCache(cacheKey);
            return cached.data;
        }

        const data = await this.fetch(`/market?${query}`);
        await storage.setCache(cacheKey, data);
        return data;
    }

    /**
     * Get market details
     */
    async getMarketDetails(marketId) {
        const cacheKey = `market_${marketId}`;
        if (await storage.isCacheValid(cacheKey, CACHE_TTL.MARKET_DETAILS)) {
            const cached = await storage.getCache(cacheKey);
            return cached.data;
        }

        const data = await this.fetch(`/market/${marketId}`);
        await storage.setCache(cacheKey, data);
        return data;
    }

    /**
     * Get latest price for token
     */
    async getLatestPrice(tokenId) {
        return this.fetch(`/token/latest-price?tokenId=${tokenId}`);
    }

    /**
     * Get orderbook
     */
    async getOrderbook(tokenId, depth = 10) {
        return this.fetch(`/token/orderbook?tokenId=${tokenId}&depth=${depth}`);
    }

    /**
     * Get price history
     */
    async getPriceHistory(tokenId, interval = '1h', from, to) {
        const params = new URLSearchParams({ tokenId, interval });
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        return this.fetch(`/token/price-history?${params}`);
    }

    /**
     * Search markets by title
     */
    async searchMarkets(query) {
        const markets = await this.getMarkets({ limit: 20 });
        const lowerQuery = query.toLowerCase();
        return markets.items.filter(m =>
            m.title.toLowerCase().includes(lowerQuery)
        );
    }
}

export const apiClient = new APIClient();
export default apiClient;
