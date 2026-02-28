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

            if (data.errno !== 0 && data.code !== 0) {
                // Opinion API usually uses errno=0 or code=0. 
                // If BOTH are not 0, it's an error. But if errno is undefined and code is undefined, don't fail just yet.
                if (data.errno !== undefined || data.code !== undefined) {
                    throw new Error(data.errmsg || data.msg || data.message || 'API_ERROR');
                }
            }

            return data.result !== undefined ? data.result : (data.data !== undefined ? data.data : data);
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
        const { page = 1, limit = 200, status = 'activated', sortBy = 5 } = params;

        // ── Authenticated path: use the official /openapi/market endpoint ──
        if (this.apiKey) {
            // API docs: sort=1(new), 2(ending soon), 3(vol desc), 5(vol24h desc)
            // API docs: status=activated or resolved, limit max=20
            // Paginate to get more than 20 markets
            const allMarkets = [];
            const maxPages = Math.ceil(Math.min(limit, 200) / 20);
            for (let p = 1; p <= maxPages; p++) {
                try {
                    const queryParams = new URLSearchParams({
                        page: String(p),
                        limit: '20',
                        status,
                        sort: String(sortBy)
                    });
                    const result = await this.fetchWithTimeout(
                        `${PROXY_API_BASE}/market?${queryParams}`
                    );
                    const pageList = result?.list || [];
                    allMarkets.push(...pageList);
                    if (pageList.length < 20) break; // No more pages
                } catch {
                    break;
                }
            }
            console.log(`[Opinion Lens] Authenticated: fetched ${allMarkets.length} markets across ${Math.min(maxPages, Math.ceil(allMarkets.length / 20))} pages`);
            return allMarkets.slice(0, limit);
        }

        // ── Public fallback: fetch multiple pages from /topic, filter client-side ──
        try {
            // Fetch up to 20 pages of 20 to get a large pool of markets
            const allMarkets = [];
            for (let p = 1; p <= 20; p++) {
                try {
                    const pageResult = await this.fetchWithTimeout(
                        `https://proxy.opinion.trade:8443/api/bsc/api/v2/topic?limit=20&sortBy=1&page=${p}`
                    );
                    const pageList = pageResult?.list || pageResult?.result?.list || [];
                    allMarkets.push(...pageList);
                    if (pageList.length < 20) break; // No more pages
                } catch {
                    break; // Stop if a page fails
                }
            }

            console.log(`[Opinion Lens] Public: fetched ${allMarkets.length} raw markets`);

            const now = Math.floor(Date.now() / 1000);

            // Only keep ACTIVE markets (status === 2 AND cutoff in the future or no cutoff)
            const activeMarkets = allMarkets.filter(m =>
                m.status === 2 && (!m.cutoffTime || m.cutoffTime > now)
            );

            console.log(`[Opinion Lens] Active after filtering: ${activeMarkets.length} markets`);

            // Map to our internal format
            const mapped = activeMarkets.map(m => ({
                marketId: m.topicId,
                title: m.title || m.topicTitle,
                yesTokenId: m.yesPos || '',
                noTokenId: m.noPos || '',
                yesLabel: m.yesLabel || 'YES',
                noLabel: m.noLabel || 'NO',
                volume24h: parseFloat(m.volume24h || 0),
                totalVolume: parseFloat(m.volume || 0),
                cutoffAt: m.cutoffTime || null,
                createTime: m.createTime || 0,
                yesPrice: parseFloat(m.yesMarketPrice || m.yesBuyPrice || 0.5),
                noPrice: parseFloat(m.noBuyPrice || 0),
                slug: m.slug || '',
                thumbnailUrl: m.thumbnailUrl || '',
                labelName: m.labelName || []
            }));

            // Sort based on the caller's request
            if (sortBy === 1) {
                // New Markets: sort by creation time descending (newest first)
                mapped.sort((a, b) => b.createTime - a.createTime);
            } else {
                // Trending: sort by total volume descending (highest volume = most trending)
                mapped.sort((a, b) => b.totalVolume - a.totalVolume);
            }

            // Return requested limit
            return mapped.slice(0, limit);
        } catch (err) {
            console.warn('Public markets fallback failed:', err);
            return [];
        }
    }

    /**
     * Get market details by ID (with public fallback)
     */
    async getMarketDetails(marketId) {
        // Try authenticated endpoint first
        if (this.apiKey) {
            try {
                const result = await this.fetchWithTimeout(`${PROXY_API_BASE}/market/${marketId}`);
                if (result?.data || result) return result?.data || result;
            } catch (e) {
                // Fall through to public endpoint
            }
        }

        // Public fallback: uses the same proxy but the public v2 topic API (no API key required)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
            const response = await fetch(`https://proxy.opinion.trade:8443/api/bsc/api/v2/topic/${marketId}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) return null;
            const json = await response.json();
            // API returns { errno: 0, result: { data: { ... } } }
            const data = json?.result?.data || json?.data || json;
            if (data && data.topicId) {
                return {
                    marketId: data.topicId || marketId,
                    title: data.title || data.topicTitle || '',
                    marketTitle: data.title || data.topicTitle || '',
                    yesTokenId: data.yesPos || '',
                    noTokenId: data.noPos || '',
                    yesLabel: data.yesLabel || 'YES',
                    noLabel: data.noLabel || 'NO',
                    yesPrice: parseFloat(data.yesMarketPrice || data.yesBuyPrice || 0.5),
                    noPrice: parseFloat(data.noMarketPrice || data.noBuyPrice || 0.5),
                    slug: data.slug || '',
                    thumbnailUrl: data.thumbnailUrl || '',
                    childList: data.childList || [],
                    volume24h: parseFloat(data.volume24h || data.volume || 0),
                    cutoffAt: data.cutoffTime || 0,
                    status: data.status,
                };
            }
            return null;
        } catch (e) {
            console.warn(`[Opinion Lens] Public fallback for market ${marketId} also failed:`, e.message);
            return null;
        }
    }

    /**
     * Search for a market by slug — paginates through ALL API pages until found
     */
    async searchBySlug(slug) {
        const slugLower = slug.toLowerCase();
        const slugWords = slugLower.split('-').filter(w => w.length > 1);
        console.log(`[Opinion Lens] searchBySlug: Looking for "${slug}" across all API pages...`);

        for (let p = 1; p <= 50; p++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                const response = await fetch(
                    `https://proxy.opinion.trade:8443/api/bsc/api/v2/topic?limit=20&sortBy=1&page=${p}`, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.apiKey ? { 'apikey': this.apiKey } : {})
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) break;
                const json = await response.json();
                const list = json?.list || json?.result?.list || [];
                if (list.length === 0) break;

                // Check each market for slug match
                for (const m of list) {
                    const mSlug = (m.slug || '').toLowerCase();
                    const mTitle = (m.title || m.topicTitle || '').toLowerCase();

                    // Direct slug prefix match
                    if (mSlug && (mSlug.startsWith(slugLower) || slugLower.startsWith(mSlug))) {
                        console.log(`[Opinion Lens] searchBySlug: FOUND on page ${p}: "${m.title || m.topicTitle}"`);
                        return this._mapTopicToMarket(m);
                    }

                    // Word-based match (2+ slug words found in title or slug)
                    if (slugWords.length >= 2) {
                        const score = slugWords.filter(w => mTitle.includes(w) || mSlug.includes(w)).length;
                        if (score >= 2) {
                            console.log(`[Opinion Lens] searchBySlug: FOUND (words) on page ${p}: "${m.title || m.topicTitle}"`);
                            return this._mapTopicToMarket(m);
                        }
                    }
                }

                if (list.length < 20) break; // No more pages
            } catch (e) {
                console.warn(`[Opinion Lens] searchBySlug page ${p} failed:`, e.message);
                break;
            }
        }

        console.warn(`[Opinion Lens] searchBySlug: NOT FOUND for slug "${slug}"`);
        return null;
    }

    /**
     * Map a raw topic API object to our internal market format
     */
    _mapTopicToMarket(m) {
        return {
            marketId: m.topicId,
            title: m.title || m.topicTitle || '',
            marketTitle: m.title || m.topicTitle || '',
            yesTokenId: m.yesPos || '',
            noTokenId: m.noPos || '',
            yesLabel: m.yesLabel || 'YES',
            noLabel: m.noLabel || 'NO',
            volume24h: parseFloat(m.volume24h || 0),
            totalVolume: parseFloat(m.volume || 0),
            cutoffAt: m.cutoffTime || null,
            createTime: m.createTime || 0,
            yesPrice: parseFloat(m.yesMarketPrice || m.yesBuyPrice || 0.5),
            noPrice: parseFloat(m.noBuyPrice || 0),
            slug: m.slug || '',
            thumbnailUrl: m.thumbnailUrl || '',
            labelName: m.labelName || [],
            childList: m.childList || [],
            status: m.status,
        };
    }
    /**
     * Get latest token price
     */
    async getLatestPrice(tokenId) {
        if (!this.apiKey) return null; // Public users rely on initial activity list price

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
     * Get user positions
     */
    async getUserPositions(walletAddress, params = {}) {
        if (!this.apiKey) {
            throw new Error('API_KEY_REQUIRED');
        }
        if (!walletAddress) throw new Error('Wallet address required');

        const { page = 1, pageSize = 50 } = params;
        const queryParams = new URLSearchParams({
            page: String(page),
            pageSize: String(pageSize)
        });

        const result = await this.fetchWithTimeout(
            `${PROXY_API_BASE}/positions/user/${walletAddress}?${queryParams}`
        );

        return result?.list || [];
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
