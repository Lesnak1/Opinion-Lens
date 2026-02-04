/**
 * Opinion Lens - Notification Service
 * Handles browser notifications and price alerts
 */

import { storage } from '../shared/storage.js';
import { formatPrice, formatPnL } from '../shared/utils.js';

class NotificationService {
    constructor() {
        this.lastPrices = new Map();
    }

    /**
     * Check price alerts against current prices
     */
    async checkAlerts(prices) {
        const alerts = await storage.getAlerts();
        const settings = await storage.getSettings();

        if (!settings.notifications.priceAlerts) return;

        const triggeredAlerts = [];

        for (const alert of alerts) {
            const price = prices[alert.tokenId];
            if (!price) continue;

            const triggered = this._checkAlertCondition(alert, price);
            if (triggered) {
                triggeredAlerts.push({ ...alert, currentPrice: price });
            }
        }

        for (const alert of triggeredAlerts) {
            await this._sendNotification({
                title: '🎯 Price Alert Triggered',
                message: `${alert.marketTitle}\n${alert.condition} ${formatPrice(alert.targetPrice)} → Now: ${formatPrice(alert.currentPrice)}`,
                data: { type: 'price_alert', marketId: alert.marketId }
            });

            // Remove one-time alerts
            if (alert.oneTime) {
                await storage.removeAlert(alert.id);
            }
        }
    }

    /**
     * Check if alert condition is met
     */
    _checkAlertCondition(alert, currentPrice) {
        const lastPrice = this.lastPrices.get(alert.tokenId);
        this.lastPrices.set(alert.tokenId, currentPrice);

        if (!lastPrice) return false;

        switch (alert.condition) {
            case 'above':
                return lastPrice < alert.targetPrice && currentPrice >= alert.targetPrice;
            case 'below':
                return lastPrice > alert.targetPrice && currentPrice <= alert.targetPrice;
            case 'crosses':
                return (lastPrice < alert.targetPrice && currentPrice >= alert.targetPrice) ||
                    (lastPrice > alert.targetPrice && currentPrice <= alert.targetPrice);
            default:
                return false;
        }
    }

    /**
     * Send market event notification
     */
    async notifyMarketEvent(event) {
        const settings = await storage.getSettings();
        if (!settings.notifications.marketEvents) return;

        const messages = {
            resolved: `Market resolved: ${event.outcome}`,
            new: 'New market available!',
            ending_soon: 'Market ending in 24 hours'
        };

        await this._sendNotification({
            title: `📊 ${event.marketTitle}`,
            message: messages[event.type] || event.type,
            data: { type: 'market_event', marketId: event.marketId }
        });
    }

    /**
     * Send portfolio update notification
     */
    async notifyPortfolioUpdate(update) {
        const settings = await storage.getSettings();
        if (!settings.notifications.portfolioUpdates) return;

        const change = formatPnL(update.pnlChange, true);
        await this._sendNotification({
            title: update.pnlChange >= 0 ? '📈 Portfolio Up!' : '📉 Portfolio Down',
            message: `Your portfolio changed by ${change}`,
            data: { type: 'portfolio_update' }
        });
    }

    /**
     * Send browser notification
     */
    async _sendNotification({ title, message, data }) {
        try {
            const notificationId = await chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
                title,
                message,
                priority: 2
            });

            // Store data for click handling
            if (data) {
                await chrome.storage.session.set({ [`notif_${notificationId}`]: data });
            }

            return notificationId;
        } catch (error) {
            console.error('[Notification] Failed to send:', error);
        }
    }

    /**
     * Handle notification click
     */
    async handleClick(notificationId) {
        const key = `notif_${notificationId}`;
        const result = await chrome.storage.session.get(key);
        const data = result[key];

        if (data?.marketId) {
            await chrome.tabs.create({
                url: `https://app.opinion.trade/market/${data.marketId}`
            });
        } else if (data?.type === 'portfolio_update') {
            await chrome.tabs.create({
                url: 'https://app.opinion.trade/portfolio'
            });
        }

        await chrome.storage.session.remove(key);
        chrome.notifications.clear(notificationId);
    }
}

export const notificationService = new NotificationService();
export default notificationService;
