/**
 * Opinion Lens - API Client
 * Handles all Opinion.trade API communications
 * Requires API key for all operations - no demo/mock data
 */

import { storage } from '../shared/storage.js';

const PROXY_API_BASE = 'https://proxy.opinion.trade:8443/openapi';
const REQUEST_TIMEOUT = 15000;

class ApiClient {
    constructor() {
        this.apiKey = null;
        this.isInitialized = false;
    }

    /**
     * Initialize with API key from storage
     */
    async init() {
        this.apiKey = await storage.getApiKey();
        this.isInitialized = true;
        return !!this.apiKey;
    }

    /**
     * Set API key
     */
    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Check if API key is configured
     */
    hasApiKey() {
        return !!this.apiKey;
    }

    /**
     * Fetch with timeout and error handling
     */
    async fetchWithTimeout(url, options = {}) {
        if (!this.apiKey) {
            throw new Error('API_KEY_REQUIRED');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'apikey': this.apiKey,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('INVALID_API_KEY');
                }
                if (response.status === 429) {
                    throw new Error('RATE_LIMITED');
                }
                throw new Error(`API_ERROR_${response.status}`);
            }

            const data = await response.json();

            if (data.errno !== 0) {
                throw new Error(data.errmsg || 'API_ERROR');
            }

            return data.result;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new Error('TIMEOUT');
            }
            throw error;
        }
    }

    /**
     * Get markets list
     */
    async getMarkets(params = {}) {
        const { page = 1, limit = 20, status = 'activated', sortBy = 5 } = params;
        const queryParams = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            status,
            sortBy: String(sortBy)
        });

        const result = await this.fetchWithTimeout(
            `${PROXY_API_BASE}/market?${queryParams}`
        );

        return result?.list || [];
    }

    /**
     * Get market details by ID
     */
    async getMarketDetails(marketId) {
        return this.fetchWithTimeout(`${PROXY_API_BASE}/market/${marketId}`);
    }

    /**
     * Get latest token price
     */
    async getLatestPrice(tokenId) {
        const queryParams = new URLSearchParams({ token_id: tokenId });
        return this.fetchWithTimeout(
            `${PROXY_API_BASE}/token/latest-price?${queryParams}`
        );
    }

    /**
     * Get token orderbook
     */
    async getOrderbook(tokenId) {
        const queryParams = new URLSearchParams({ token_id: tokenId });
        return this.fetchWithTimeout(
            `${PROXY_API_BASE}/token/orderbook?${queryParams}`
        );
    }

    /**
     * Get price history
     */
    async getPriceHistory(tokenId, interval = '1h') {
        const queryParams = new URLSearchParams({
            token_id: tokenId,
            interval
        });
        return this.fetchWithTimeout(
            `${PROXY_API_BASE}/token/price-history?${queryParams}`
        );
    }

    /**
     * Search markets by query
     */
    async searchMarkets(query) {
        // Get all markets and filter locally
        const markets = await this.getMarkets({ limit: 50 });

        if (!query) return markets;

        const lowerQuery = query.toLowerCase();
        return markets.filter(market => {
            const title = (market.title || market.marketTitle || '').toLowerCase();
            return title.includes(lowerQuery);
        });
    }

    /**
     * Test API key validity
     */
    async testApiKey(key) {
        const originalKey = this.apiKey;
        this.apiKey = key;

        try {
            await this.getMarkets({ limit: 1 });
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        } finally {
            this.apiKey = originalKey;
        }
    }
}

export const apiClient = new ApiClient();
export default apiClient;
