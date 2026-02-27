/**
 * Opinion Lens - Market Indexer
 * Builds and maintains a keyword index from active Opinion markets
 */

import { OPINION_APP_URL } from './constants.js';

/**
 * Common words to exclude from keyword extraction
 */
const STOP_WORDS = new Set([
    'will', 'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'before', 'after', 'during', 'between', 'into', 'through', 'over',
    'than', 'then', 'now', 'any', 'only', 'just', 'can', 'more', 'some',
    'could', 'should', 'would', 'may', 'might', 'must', 'shall', 'being',
    'been', 'is', 'are', 'was', 'were', 'has', 'had', 'does', 'did',
    'win', 'lose', 'reach', 'hit', 'pass', 'exceed', 'drop', 'fall', 'rise'
]);

/**
 * Entity aliases - map common variations to canonical forms
 */
const ENTITY_ALIASES = {
    // Crypto
    'btc': 'bitcoin',
    'eth': 'ethereum',
    'sol': 'solana',
    'xrp': 'ripple',
    'doge': 'dogecoin',
    'ada': 'cardano',
    'bnb': 'binance',

    // Politics
    'potus': 'president',
    'gop': 'republican',
    'dem': 'democrat',
    'dems': 'democrat',

    // Economics
    'fomc': 'fed',
    'federal reserve': 'fed',
    'interest rate': 'rate',
    'rate cut': 'fed',
    'rate hike': 'fed',

    // Common
    'elon': 'musk',
    'donaldtrump': 'trump',
    'joebiden': 'biden'
};

/**
 * Market Indexer Class
 */
class MarketIndexer {
    constructor() {
        this.markets = [];
        this.keywordIndex = new Map(); // keyword -> [market1, market2, ...]
        this.lastUpdate = 0;
        this.updateInterval = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Extract meaningful keywords from market title
     * @param {string} title - Market title
     * @returns {string[]} - Array of keywords
     */
    extractKeywords(title) {
        const keywords = new Set();

        // Clean and normalize
        let cleaned = title
            .toLowerCase()
            .replace(/[?!.,;:'"()[\]{}]/g, ' ')
            .replace(/\$[\d,]+[kKmMbB]?/gi, match => {
                // Keep price targets as keywords
                keywords.add(match.replace(/,/g, ''));
                return ' ';
            })
            .replace(/\b(?:19|20)\d{2}\b/g, match => {
                // Keep years as keywords
                keywords.add(match);
                return ' ';
            });

        // Split into words, skipping pure numbers shorter than 4 digits (avoids false positive on generic "1", "3", "10")
        const words = cleaned.split(/\s+/).filter(w => w.length > 1 && !/^\d{1,3}$/.test(w));

        // Process each word
        for (const word of words) {
            // Skip stop words
            if (STOP_WORDS.has(word)) continue;

            // Check for aliases
            const canonical = ENTITY_ALIASES[word] || word;
            keywords.add(canonical);

            // Also add original if different
            if (canonical !== word) {
                keywords.add(word);
            }
        }

        // Extract named entities (capitalized words in original)
        const entities = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
        for (const entity of entities) {
            if (entity.length > 2) {
                keywords.add(entity.toLowerCase());
            }
        }

        // Extract hashtag-style compounds
        const compounds = title.match(/[A-Z]{2,}/g) || [];
        for (const compound of compounds) {
            keywords.add(compound.toLowerCase());
        }

        return Array.from(keywords);
    }

    /**
     * Build keyword index from markets
     * @param {Array} markets - Array of market objects
     */
    buildIndex(markets) {
        this.markets = markets;
        this.keywordIndex.clear();

        for (const market of markets) {
            const keywords = this.extractKeywords(market.title || market.question || '');

            // Store keywords on market for later reference
            market._keywords = keywords;

            // Add to index
            for (const keyword of keywords) {
                if (!this.keywordIndex.has(keyword)) {
                    this.keywordIndex.set(keyword, []);
                }
                this.keywordIndex.get(keyword).push(market);
            }
        }

        this.lastUpdate = Date.now();
        console.log(`[Opinion Lens] Indexed ${markets.length} markets with ${this.keywordIndex.size} unique keywords`);
    }

    /**
     * Find markets matching text content
     * @param {string} text - Text to search (tweet content)
     * @returns {Array} - Matching markets with relevance scores
     */
    findMatchingMarkets(text) {
        // 1. Hard Check: Did they post the actual Opinion.trade URL?
        const urlMatch = text.match(/topicId=(\d+)/);
        if (urlMatch) {
            const topicId = parseInt(urlMatch[1], 10);
            const exactMarket = this.markets.find(m => m.id === topicId || m.topicId === topicId || m.marketId === topicId);
            if (exactMarket) {
                return [{ market: exactMarket, score: 999, matchedKeywords: ['URL_MATCH'] }];
            }
        }

        const matches = new Map(); // marketId -> { market, score, matchedKeywords }

        // Normalize text
        const normalizedText = text.toLowerCase();
        const textWords = new Set(
            normalizedText
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 1)
        );

        // Check each keyword
        for (const [keyword, markets] of this.keywordIndex) {
            // Check if keyword appears in text
            const keywordLower = keyword.toLowerCase();

            // Word boundary match for better accuracy
            const regex = new RegExp(`\\b${this.escapeRegex(keywordLower)}\\b`, 'i');

            if (regex.test(normalizedText) || textWords.has(keywordLower)) {
                for (const market of markets) {
                    const marketId = market.id;

                    if (!matches.has(marketId)) {
                        matches.set(marketId, {
                            market,
                            score: 0,
                            matchedKeywords: []
                        });
                    }

                    const match = matches.get(marketId);
                    match.score += this.getKeywordWeight(keyword);
                    match.matchedKeywords.push(keyword);
                }
            }
        }

        // Filter out weak matches (require at least score of 2)
        // Sort by score and return top matches
        return Array.from(matches.values())
            .filter(match => match.score >= 2 || (match.score === 1 && match.matchedKeywords[0].length >= 5))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Max 5 markets per tweet
    }

    /**
     * Get weight for keyword (some keywords are more important)
     */
    getKeywordWeight(keyword) {
        // Named entities (proper nouns) get higher weight
        if (/^[A-Z]/.test(keyword)) return 3;

        // Crypto tickers
        if (['bitcoin', 'ethereum', 'btc', 'eth', 'sol', 'xrp'].includes(keyword.toLowerCase())) return 2;

        // Political figures
        if (['trump', 'biden', 'musk', 'powell'].includes(keyword.toLowerCase())) return 2;

        // Default weight
        return 1;
    }

    /**
     * Escape regex special characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Check if index needs refresh
     */
    needsRefresh() {
        return Date.now() - this.lastUpdate > this.updateInterval;
    }

    /**
     * Get trade URL for market
     */
    getTradeUrl(market, side = 'yes') {
        const isMulti = !!(market.childList?.length > 0) || (!market.yesTokenId && !market.yesLabel);
        const baseUrl = `${OPINION_APP_URL}/detail?topicId=${market.id}`;
        return isMulti ? `${baseUrl}&type=multi&side=${side}` : `${baseUrl}&side=${side}`;
    }

    /**
     * Get market summary for display
     */
    getMarketSummary(market) {
        const yesToken = market.tokens?.find(t => t.outcome === 'Yes') || {};
        const noToken = market.tokens?.find(t => t.outcome === 'No') || {};

        return {
            id: market.id,
            title: market.title || market.question,
            yesPrice: yesToken.price || 0.5,
            noPrice: noToken.price || 0.5,
            yesChange24h: yesToken.change24h || 0,
            volume: market.volume24h || market.volume || 0,
            endDate: market.endDate || market.resolutionDate,
            category: market.category || 'General',
            tradeUrl: this.getTradeUrl(market),
            keywords: market._keywords || []
        };
    }
}

export const marketIndexer = new MarketIndexer();
export default marketIndexer;
