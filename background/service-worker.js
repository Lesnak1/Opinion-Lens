/**
 * Opinion Lens - Service Worker
 * Central orchestrator for background operations
 * Requires API key for all operations - no demo/mock data
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { storage } from '../shared/storage.js';
import { apiClient } from './api-client.js';
import { wsManager } from './websocket-manager.js';
import { notificationService } from './notification-service.js';

// State
let isInitialized = false;

/**
 * Initialize extension
 */
async function init() {
    if (isInitialized) return;

    console.log('[Opinion Lens] Initializing...');

    // Initialize API client with stored key
    const hasApiKey = await apiClient.init();

    if (hasApiKey) {
        try {
            // Connect WebSocket
            await wsManager.connect();
            wsManager.onMessage(handleWSMessage);
        } catch (e) {
            console.log('[Opinion Lens] WebSocket connection failed:', e.message);
        }
        // Setup alert checking alarm
        chrome.alarms.create('checkAlerts', { periodInMinutes: 1 });
    } else {
        console.log('[Opinion Lens] No API key configured - extension in standby mode');
    }

    isInitialized = true;
    console.log('[Opinion Lens] Initialized', { hasApiKey });
}

/**
 * Handle WebSocket messages
 */
function handleWSMessage(message) {
    switch (message.type) {
        case 'price':
            broadcastToTabs({ type: MESSAGE_TYPES.PRICE_UPDATE, data: message.data });
            notificationService.checkAlerts({ [message.data.tokenId]: message.data.price });
            break;

        case 'event':
            broadcastToTabs({ type: MESSAGE_TYPES.MARKET_UPDATE, data: message.data });
            notificationService.notifyMarketEvent(message.data);
            break;

        case 'USER_ORDER_UPDATE':
            notificationService.notifyOrderUpdate(message.data);
            break;

        case 'USER_TRADE_EXECUTED':
            notificationService.notifyTradeExecution(message.data);
            break;
    }
}

/**
 * Broadcast message to all tabs
 */
async function broadcastToTabs(message) {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, message).catch(() => { });
    });
}

/**
 * Handle messages from popup/content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
            console.error('[Opinion Lens] Message error:', error.message);
            sendResponse({ error: error.message });
        });
    return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
    switch (message.type) {
        // Markets
        case MESSAGE_TYPES.GET_MARKETS:
            return apiClient.getMarkets(message.params);

        case MESSAGE_TYPES.GET_MARKET_DETAILS:
            return apiClient.getMarketDetails(message.marketId);

        case MESSAGE_TYPES.SEARCH_MARKETS:
            return apiClient.searchMarkets(message.query);

        case MESSAGE_TYPES.SUBSCRIBE_USER_MARKET:
            if (wsManager.isConnected) {
                wsManager.subscribeUserMarket(message.marketId);
                return { success: true };
            }
            return { success: false, error: 'Not connected' };

        // Prices
        case MESSAGE_TYPES.GET_PRICES:
            return apiClient.getLatestPrice(message.tokenId);

        case MESSAGE_TYPES.GET_LATEST_PRICE:
            return apiClient.getLatestPrice(message.tokenId);

        // Portfolio
        case MESSAGE_TYPES.GET_USER_POSITIONS:
            const wallet = await storage.getWalletAddress();
            if (!wallet) return { error: 'Wallet address required' };
            return apiClient.getUserPositions(wallet, message.params);

        // Watchlist
        case MESSAGE_TYPES.GET_WATCHLIST:
            return storage.getWatchlist();

        case MESSAGE_TYPES.ADD_TO_WATCHLIST:
            const added = await storage.addToWatchlist(message.marketId);
            if (wsManager.isConnected) {
                wsManager.subscribe('market:prices', { marketId: message.marketId });
                wsManager.subscribeUserMarket(message.marketId);
            }
            return added;

        case MESSAGE_TYPES.REMOVE_FROM_WATCHLIST:
            return storage.removeFromWatchlist(message.marketId);

        // Alerts
        case MESSAGE_TYPES.GET_ALERTS:
            return storage.getAlerts();

        case MESSAGE_TYPES.CREATE_ALERT:
            return storage.addAlert(message.alert);

        case MESSAGE_TYPES.DELETE_ALERT:
            return storage.removeAlert(message.alertId);

        // Settings
        case MESSAGE_TYPES.GET_SETTINGS:
            return storage.getSettings();

        case MESSAGE_TYPES.UPDATE_SETTINGS:
            return storage.updateSettings(message.settings);

        // API Key Management
        case MESSAGE_TYPES.SET_API_KEY:
            await storage.setApiKey(message.apiKey);
            apiClient.setApiKey(message.apiKey);
            // Reinitialize with new key
            if (message.apiKey) {
                try {
                    await wsManager.connect();
                    wsManager.onMessage(handleWSMessage);
                } catch (e) {
                    console.log('[Opinion Lens] WebSocket failed after key update');
                }
            }
            return { success: true };

        case MESSAGE_TYPES.TEST_API_KEY:
            return apiClient.testApiKey(message.apiKey);

        // Connection & Status
        case MESSAGE_TYPES.CONNECTION_STATUS:
            return {
                wsConnected: wsManager.isConnected,
                hasApiKey: apiClient.hasApiKey()
            };

        default:
            console.warn(`[Opinion Lens] Unknown message type: ${message.type}`);
            return null;
    }
}

/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkAlerts') {
        // Periodic alert checking when WS is disconnected
        if (!wsManager.isConnected && apiClient.hasApiKey()) {
            const watchlist = await storage.getWatchlist();
            for (const marketId of watchlist) {
                try {
                    const market = await apiClient.getMarketDetails(marketId);
                    if (market) {
                        const prices = {};
                        if (market.yesTokenId) {
                            try {
                                const p = await apiClient.getLatestPrice(market.yesTokenId);
                                if (p?.price) prices[market.yesTokenId] = parseFloat(p.price);
                            } catch (e) { /* ignore */ }
                        }
                        if (market.noTokenId) {
                            try {
                                const p = await apiClient.getLatestPrice(market.noTokenId);
                                if (p?.price) prices[market.noTokenId] = parseFloat(p.price);
                            } catch (e) { /* ignore */ }
                        }

                        if (Object.keys(prices).length > 0) {
                            await notificationService.checkAlerts(prices);
                        }
                    }
                } catch (error) {
                    // Suppress network IO suspended or 404 errors from spamming the alarm logs
                    if (!error.message?.includes('Network Error') && !error.message?.includes('Failed to fetch')) {
                        console.error('[Alarm] Failed to check market:', marketId, error);
                    }
                }
            }
        }
    }
});

/**
 * Handle notification clicks
 */
chrome.notifications.onClicked.addListener((notificationId) => {
    notificationService.handleClick(notificationId);
});

/**
 * Handle extension install/update
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Opinion Lens] Installed:', details.reason);
    init();
});

/**
 * Handle browser startup
 */
chrome.runtime.onStartup.addListener(() => {
    console.log('[Opinion Lens] Browser started');
    init();
});

// Initialize on load
init();
