/**
 * Opinion Lens - Service Worker
 * Central orchestrator for background operations
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

    // Initialize API client
    const hasApiKey = await apiClient.init();

    if (hasApiKey) {
        // Connect WebSocket
        await wsManager.connect();

        // Setup WebSocket message handler
        wsManager.onMessage(handleWSMessage);

        // Setup alert checking alarm
        chrome.alarms.create('checkAlerts', { periodInMinutes: 1 });
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
        .catch(error => sendResponse({ error: error.message }));
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

        // Prices
        case MESSAGE_TYPES.GET_PRICES:
            return apiClient.getLatestPrice(message.tokenId);

        // Watchlist
        case MESSAGE_TYPES.GET_WATCHLIST:
            return storage.getWatchlist();

        case MESSAGE_TYPES.ADD_TO_WATCHLIST:
            const added = await storage.addToWatchlist(message.marketId);
            wsManager.subscribe('market:prices', { marketId: message.marketId });
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

        // Connection
        case MESSAGE_TYPES.CONNECTION_STATUS:
            return wsManager.getStatus();

        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}

/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'checkAlerts') {
        // Periodic alert checking when WS is disconnected
        if (!wsManager.isConnected) {
            const watchlist = await storage.getWatchlist();
            for (const marketId of watchlist) {
                try {
                    const market = await apiClient.getMarketDetails(marketId);
                    const prices = {};
                    market.tokens.forEach(t => { prices[t.tokenId] = t.lastPrice; });
                    await notificationService.checkAlerts(prices);
                } catch (error) {
                    console.error('[Alarm] Failed to check market:', marketId, error);
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
