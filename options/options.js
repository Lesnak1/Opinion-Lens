/**
 * Opinion Lens - Options Page
 */

import { MESSAGE_TYPES, DEFAULT_SETTINGS } from '../shared/constants.js';
import { storage } from '../shared/storage.js';

// DOM Elements
const elements = {
    apiKey: document.getElementById('apiKey'),
    walletAddress: document.getElementById('walletAddress'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    testConnection: document.getElementById('testConnection'),
    connectionResult: document.getElementById('connectionResult'),
    priceAlerts: document.getElementById('priceAlerts'),
    marketEvents: document.getElementById('marketEvents'),
    portfolioUpdates: document.getElementById('portfolioUpdates'),
    twitterEnabled: document.getElementById('twitterEnabled'),
    showMarketCards: document.getElementById('showMarketCards'),
    showPriceOverlays: document.getElementById('showPriceOverlays'),
    priceFormat: document.getElementById('priceFormat'),
    refreshInterval: document.getElementById('refreshInterval'),
    exportData: document.getElementById('exportData'),
    importData: document.getElementById('importData'),
    importFile: document.getElementById('importFile'),
    clearData: document.getElementById('clearData'),
    saveBtn: document.getElementById('saveBtn'),
    saveStatus: document.getElementById('saveStatus'),
};

/**
 * Initialize options page
 */
async function init() {
    await loadSettings();
    setupEventListeners();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
    // Load API key
    const apiKey = await storage.getApiKey();
    if (apiKey) {
        elements.apiKey.value = apiKey;
    }

    // Load Wallet Address
    const walletAddress = await storage.getWalletAddress();
    if (walletAddress) {
        elements.walletAddress.value = walletAddress;
    }

    // Load settings
    const settings = await storage.getSettings();

    // Notifications
    elements.priceAlerts.checked = settings.notifications?.priceAlerts ?? true;
    elements.marketEvents.checked = settings.notifications?.marketEvents ?? true;
    elements.portfolioUpdates.checked = settings.notifications?.portfolioUpdates ?? true;

    // Twitter
    elements.twitterEnabled.checked = settings.twitter?.enabled ?? true;
    elements.showMarketCards.checked = settings.twitter?.showMarketCards ?? true;
    elements.showPriceOverlays.checked = settings.twitter?.showPriceOverlays ?? true;

    // Display
    elements.priceFormat.value = settings.display?.priceFormat ?? 'cents';
    elements.refreshInterval.value = settings.display?.refreshInterval ?? 30000;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Toggle API key visibility
    elements.toggleApiKey.addEventListener('click', () => {
        const type = elements.apiKey.type === 'password' ? 'text' : 'password';
        elements.apiKey.type = type;
    });

    // Test connection
    elements.testConnection.addEventListener('click', testConnection);

    // Save settings
    elements.saveBtn.addEventListener('click', saveSettings);

    // Export data
    elements.exportData.addEventListener('click', exportData);

    // Import data
    elements.importData.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', importData);

    // Clear data
    elements.clearData.addEventListener('click', clearData);
}

/**
 * Test API connection
 */
async function testConnection() {
    const apiKey = elements.apiKey.value.trim();
    if (!apiKey) {
        showConnectionResult('Please enter an API key', false);
        return;
    }

    elements.testConnection.disabled = true;
    elements.testConnection.textContent = 'Testing...';
    showConnectionResult('', null);

    try {
        // Send TEST_API_KEY message to service worker
        const result = await chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.TEST_API_KEY,
            apiKey: apiKey
        });

        if (result?.valid) {
            showConnectionResult('✓ Connected successfully!', true);
        } else {
            showConnectionResult(`✗ ${result?.error || 'Invalid API key'}`, false);
        }
    } catch (error) {
        showConnectionResult(`✗ ${error.message}`, false);
    } finally {
        elements.testConnection.disabled = false;
        elements.testConnection.textContent = 'Test Connection';
    }
}

/**
 * Show connection result
 */
function showConnectionResult(message, success) {
    elements.connectionResult.textContent = message;
    elements.connectionResult.className = 'connection-result ' + (success ? 'success' : 'error');
}

/**
 * Save settings
 */
async function saveSettings() {
    try {
        // Save API key via service worker to update live client
        const apiKey = elements.apiKey.value.trim();
        await chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.SET_API_KEY,
            apiKey: apiKey || null
        });

        // Save Wallet Address
        const walletAddress = elements.walletAddress.value.trim();
        await storage.setWalletAddress(walletAddress || null);

        // Save settings
        const settings = {
            notifications: {
                priceAlerts: elements.priceAlerts.checked,
                marketEvents: elements.marketEvents.checked,
                portfolioUpdates: elements.portfolioUpdates.checked,
            },
            twitter: {
                enabled: elements.twitterEnabled.checked,
                showMarketCards: elements.showMarketCards.checked,
                showPriceOverlays: elements.showPriceOverlays.checked,
            },
            display: {
                priceFormat: elements.priceFormat.value,
                refreshInterval: parseInt(elements.refreshInterval.value),
            },
        };

        await storage.updateSettings(settings);

        // Show success
        elements.saveStatus.textContent = '✓ Settings saved!';
        setTimeout(() => {
            elements.saveStatus.textContent = '';
        }, 3000);
    } catch (error) {
        console.error('Failed to save settings:', error);
        elements.saveStatus.textContent = '✗ Failed to save';
        elements.saveStatus.style.color = '#EF4444';
    }
}

/**
 * Export data
 */
async function exportData() {
    try {
        const data = {
            settings: await storage.getSettings(),
            watchlist: await storage.getWatchlist(),
            alerts: await storage.getAlerts(),
            exportedAt: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `opinion-lens-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export data');
    }
}

/**
 * Import data
 */
async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.settings) {
            await storage.updateSettings(data.settings);
        }
        if (data.watchlist) {
            await storage.setWatchlist(data.watchlist);
        }
        if (data.alerts) {
            await storage.setAlerts(data.alerts);
        }

        await loadSettings();
        alert('Data imported successfully!');
    } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import data. Please check the file format.');
    }

    // Reset file input
    e.target.value = '';
}

/**
 * Clear all data
 */
async function clearData() {
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
        return;
    }

    try {
        await storage.clearAll();
        await loadSettings();
        alert('All data cleared!');
    } catch (error) {
        console.error('Clear failed:', error);
        alert('Failed to clear data');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
