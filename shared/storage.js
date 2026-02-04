/**
 * Opinion Lens - Storage Manager
 * Handles Chrome storage with encryption for sensitive data
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';

/**
 * Simple encryption for API keys (not cryptographically strong, but better than plaintext)
 * For production, use Web Crypto API with proper key derivation
 */
const ENCRYPTION_KEY = 'opinion-lens-v1';

function encrypt(text) {
    return btoa(text.split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length))
    ).join(''));
}

function decrypt(encoded) {
    try {
        const decoded = atob(encoded);
        return decoded.split('').map((c, i) =>
            String.fromCharCode(c.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length))
        ).join('');
    } catch {
        return null;
    }
}

/**
 * Storage Manager Class
 */
class StorageManager {
    /**
     * Get API key from storage (decrypted)
     * @returns {Promise<string|null>}
     */
    async getApiKey() {
        const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
        const encrypted = result[STORAGE_KEYS.API_KEY];
        return encrypted ? decrypt(encrypted) : null;
    }

    /**
     * Set API key (encrypted)
     * @param {string} apiKey
     */
    async setApiKey(apiKey) {
        const encrypted = encrypt(apiKey);
        await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: encrypted });
    }

    /**
     * Remove API key
     */
    async removeApiKey() {
        await chrome.storage.local.remove(STORAGE_KEYS.API_KEY);
    }

    /**
     * Get watchlist
     * @returns {Promise<string[]>}
     */
    async getWatchlist() {
        const result = await chrome.storage.local.get(STORAGE_KEYS.WATCHLIST);
        return result[STORAGE_KEYS.WATCHLIST] || [];
    }

    /**
     * Set watchlist
     * @param {string[]} marketIds
     */
    async setWatchlist(marketIds) {
        await chrome.storage.local.set({ [STORAGE_KEYS.WATCHLIST]: marketIds });
    }

    /**
     * Add market to watchlist
     * @param {string} marketId
     */
    async addToWatchlist(marketId) {
        const watchlist = await this.getWatchlist();
        if (!watchlist.includes(marketId)) {
            watchlist.push(marketId);
            await this.setWatchlist(watchlist);
        }
        return watchlist;
    }

    /**
     * Remove market from watchlist
     * @param {string} marketId
     */
    async removeFromWatchlist(marketId) {
        const watchlist = await this.getWatchlist();
        const filtered = watchlist.filter(id => id !== marketId);
        await this.setWatchlist(filtered);
        return filtered;
    }

    /**
     * Get alerts
     * @returns {Promise<Array>}
     */
    async getAlerts() {
        const result = await chrome.storage.local.get(STORAGE_KEYS.ALERTS);
        return result[STORAGE_KEYS.ALERTS] || [];
    }

    /**
     * Set alerts
     * @param {Array} alerts
     */
    async setAlerts(alerts) {
        await chrome.storage.local.set({ [STORAGE_KEYS.ALERTS]: alerts });
    }

    /**
     * Add alert
     * @param {Object} alert
     */
    async addAlert(alert) {
        const alerts = await this.getAlerts();
        alerts.push({ ...alert, id: Date.now().toString(), createdAt: new Date().toISOString() });
        await this.setAlerts(alerts);
        return alerts;
    }

    /**
     * Remove alert
     * @param {string} alertId
     */
    async removeAlert(alertId) {
        const alerts = await this.getAlerts();
        const filtered = alerts.filter(a => a.id !== alertId);
        await this.setAlerts(filtered);
        return filtered;
    }

    /**
     * Get settings
     * @returns {Promise<Object>}
     */
    async getSettings() {
        const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
    }

    /**
     * Update settings
     * @param {Object} updates
     */
    async updateSettings(updates) {
        const current = await this.getSettings();
        const merged = { ...current, ...updates };
        await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
        return merged;
    }

    /**
     * Get cached data
     * @param {string} key
     * @returns {Promise<{data: any, timestamp: number}|null>}
     */
    async getCache(key) {
        const result = await chrome.storage.local.get(key);
        return result[key] || null;
    }

    /**
     * Set cached data with timestamp
     * @param {string} key
     * @param {any} data
     */
    async setCache(key, data) {
        await chrome.storage.local.set({
            [key]: { data, timestamp: Date.now() }
        });
    }

    /**
     * Check if cache is valid
     * @param {string} key
     * @param {number} ttl - Time to live in milliseconds
     * @returns {Promise<boolean>}
     */
    async isCacheValid(key, ttl) {
        const cached = await this.getCache(key);
        if (!cached) return false;
        return (Date.now() - cached.timestamp) < ttl;
    }

    /**
     * Clear all extension data
     */
    async clearAll() {
        await chrome.storage.local.clear();
    }
}

export const storage = new StorageManager();
export default storage;
