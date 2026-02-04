/**
 * Tests for shared/storage.js
 * These tests verify the storage manager interface
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

// Create mock chrome.storage before importing storage module
const mockStorage = new Map();

globalThis.chrome = {
    storage: {
        local: {
            get: vi.fn((keys) => {
                return new Promise((resolve) => {
                    if (typeof keys === 'string') {
                        resolve({ [keys]: mockStorage.get(keys) });
                    } else if (Array.isArray(keys)) {
                        const result = {};
                        keys.forEach(k => result[k] = mockStorage.get(k));
                        resolve(result);
                    } else {
                        resolve(Object.fromEntries(mockStorage));
                    }
                });
            }),
            set: vi.fn((items) => {
                return new Promise((resolve) => {
                    Object.entries(items).forEach(([k, v]) => mockStorage.set(k, v));
                    resolve();
                });
            }),
            remove: vi.fn((keys) => {
                return new Promise((resolve) => {
                    if (Array.isArray(keys)) {
                        keys.forEach(k => mockStorage.delete(k));
                    } else {
                        mockStorage.delete(keys);
                    }
                    resolve();
                });
            }),
            clear: vi.fn(() => {
                return new Promise((resolve) => {
                    mockStorage.clear();
                    resolve();
                });
            }),
        },
    },
};

// Import after setting up mock
let storage;

describe('StorageManager', () => {
    beforeAll(async () => {
        // Dynamic import after mock is set up
        const module = await import('../shared/storage.js');
        storage = module.storage;
    });

    beforeEach(() => {
        mockStorage.clear();
        vi.clearAllMocks();
    });

    describe('Settings', () => {
        it('returns default settings when none saved', async () => {
            const settings = await storage.getSettings();

            expect(settings).toBeDefined();
            expect(settings.theme).toBe('dark');
            expect(settings.notifications).toBeDefined();
        });

        it('saves and retrieves settings', async () => {
            const newSettings = {
                theme: 'light',
                notifications: {
                    priceAlerts: false,
                    marketEvents: true,
                    portfolioUpdates: false,
                },
            };

            await storage.updateSettings(newSettings);
            const retrieved = await storage.getSettings();

            expect(retrieved.theme).toBe('light');
            expect(retrieved.notifications.priceAlerts).toBe(false);
        });
    });

    describe('Watchlist', () => {
        it('returns empty array when no watchlist', async () => {
            const watchlist = await storage.getWatchlist();

            expect(Array.isArray(watchlist)).toBe(true);
            expect(watchlist.length).toBe(0);
        });

        it('adds market to watchlist', async () => {
            const result = await storage.addToWatchlist('market-1');

            expect(result).toContain('market-1');

            const watchlist = await storage.getWatchlist();
            expect(watchlist).toContain('market-1');
        });

        it('removes market from watchlist', async () => {
            await storage.addToWatchlist('market-1');
            await storage.addToWatchlist('market-2');

            const result = await storage.removeFromWatchlist('market-1');

            expect(result).not.toContain('market-1');
            expect(result).toContain('market-2');
        });
    });

    describe('Alerts', () => {
        it('returns empty array when no alerts', async () => {
            const alerts = await storage.getAlerts();

            expect(Array.isArray(alerts)).toBe(true);
            expect(alerts.length).toBe(0);
        });

        it('creates alert with generated ID', async () => {
            const alerts = await storage.addAlert({
                marketId: 'market-1',
                condition: 'above',
                price: 0.75,
            });

            expect(alerts).toBeDefined();
            expect(alerts.length).toBe(1);
            expect(alerts[0].id).toBeDefined();
            expect(alerts[0].marketId).toBe('market-1');
            expect(alerts[0].condition).toBe('above');
            expect(alerts[0].price).toBe(0.75);
        });

        it('removes alert by ID', async () => {
            const alerts = await storage.addAlert({
                marketId: 'market-1',
                condition: 'above',
                price: 0.75,
            });

            const alertId = alerts[0].id;
            const remaining = await storage.removeAlert(alertId);

            expect(remaining.find(a => a.id === alertId)).toBeUndefined();
        });
    });

    describe('API Key', () => {
        it('returns null when no API key', async () => {
            const apiKey = await storage.getApiKey();
            expect(apiKey).toBeNull();
        });

        it('saves and retrieves API key', async () => {
            await storage.setApiKey('test-api-key-123');
            const retrieved = await storage.getApiKey();

            expect(retrieved).toBe('test-api-key-123');
        });

        it('removes API key', async () => {
            await storage.setApiKey('test-api-key-123');
            await storage.removeApiKey();

            const retrieved = await storage.getApiKey();
            expect(retrieved).toBeNull();
        });
    });

    describe('Cache', () => {
        it('setCache and getCache work correctly', async () => {
            const data = { price: 0.72, volume: 1000 };

            await storage.setCache('test-key', data);
            const cached = await storage.getCache('test-key');

            expect(cached).toBeDefined();
            expect(cached.data).toEqual(data);
            expect(cached.timestamp).toBeDefined();
        });

        it('returns null for non-existent cache', async () => {
            const cached = await storage.getCache('non-existent');
            expect(cached).toBeNull();
        });

        it('isCacheValid returns false for expired cache', async () => {
            await storage.setCache('test-key', { price: 0.72 });

            // Check with 0 TTL - should be invalid
            const isValid = await storage.isCacheValid('test-key', 0);
            expect(isValid).toBe(false);
        });

        it('isCacheValid returns true for fresh cache', async () => {
            await storage.setCache('test-key', { price: 0.72 });

            // Check with long TTL - should be valid
            const isValid = await storage.isCacheValid('test-key', 60000);
            expect(isValid).toBe(true);
        });
    });

    describe('clearAll', () => {
        it('clears all stored data', async () => {
            await storage.updateSettings({ theme: 'light' });
            await storage.addToWatchlist('market-1');
            await storage.setApiKey('test-key');

            await storage.clearAll();

            expect(await storage.getApiKey()).toBeNull();
            // Settings return defaults after clear
            expect((await storage.getSettings()).theme).toBe('dark');
        });
    });
});
