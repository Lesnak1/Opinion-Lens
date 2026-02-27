/**
 * Opinion Lens - WebSocket Manager
 * Handles real-time data streaming from Opinion.trade
 */

import { WS_URL, WS_HEARTBEAT_INTERVAL, WS_RECONNECT_MAX_ATTEMPTS, WS_RECONNECT_BASE_DELAY } from '../shared/constants.js';
import { storage } from '../shared/storage.js';

class WebSocketManager {
    constructor() {
        this.ws = null;
        this.apiKey = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.subscriptions = new Map();
        this.messageHandlers = new Set();
        this.heartbeatInterval = null;
    }

    /**
     * Initialize and connect
     */
    async connect() {
        this.apiKey = await storage.getApiKey();
        if (!this.apiKey) {
            console.warn('[WS] No API key, skipping connection');
            return false;
        }

        return this._connect();
    }

    /**
     * Internal connect
     */
    _connect() {
        return new Promise((resolve) => {
            try {
                this.ws = new WebSocket(WS_URL);

                this.ws.onopen = () => {
                    console.log('[WS] Connected');
                    this._authenticate();
                    this._startHeartbeat();
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this._resubscribe();
                    this._broadcast({ type: 'CONNECTION_STATUS', connected: true });
                    resolve(true);
                };

                this.ws.onclose = () => {
                    console.log('[WS] Disconnected');
                    this.isConnected = false;
                    this._stopHeartbeat();
                    this._broadcast({ type: 'CONNECTION_STATUS', connected: false });
                    this._scheduleReconnect();
                    resolve(false);
                };

                this.ws.onerror = (error) => {
                    console.error('[WS] Error:', error);
                    resolve(false);
                };

                this.ws.onmessage = (event) => {
                    this._handleMessage(event.data);
                };
            } catch (error) {
                console.error('[WS] Connection failed:', error);
                resolve(false);
            }
        });
    }

    /**
     * Authenticate with API key
     */
    _authenticate() {
        this._send({ action: 'AUTH', apiKey: this.apiKey });
    }

    /**
     * Start heartbeat interval
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this._send({ action: 'PING' });
        }, WS_HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat interval
     */
    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Schedule reconnect
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
            console.error('[WS] Max reconnect attempts reached');
            return;
        }

        const delay = WS_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;

        console.log(`[WS] Reconnecting in ${delay}ms...`);
        setTimeout(() => this._connect(), delay);
    }

    /**
     * Broadcast to listeners
     */
    _broadcast(message) {
        this.messageHandlers.forEach(handler => {
            try {
                handler(message);
            } catch (error) {
                console.error('[WS] Handler error:', error);
            }
        });
    }

    /**
     * Send message
     */
    _send(payload) {
        if (this.ws && this.isConnected) {
            try {
                this.ws.send(JSON.stringify(payload));
            } catch (error) {
                console.error('[WS] Send error:', error);
            }
        }
    }

    /**
     * Resubscribe after reconnect
     */
    _resubscribe() {
        this.subscriptions.forEach((params, channel) => {
            if (channel === 'user-market') {
                this.subscribeUserMarket(params.marketId);
            } else {
                this._send({ action: 'SUBSCRIBE', channel, ...params });
            }
        });
    }

    /**
     * Subscribe to channel
     */
    subscribe(channel, params = {}) {
        const key = `${channel}:${JSON.stringify(params)}`;
        this.subscriptions.set(key, { channel, ...params });

        if (this.isConnected) {
            this._send({ action: 'SUBSCRIBE', channel, ...params });
        }
    }

    /**
     * Subscribe to user updates for a market
     */
    subscribeUserMarket(marketId) {
        const key = `user-market:${marketId}`;
        this.subscriptions.set(key, { channel: 'user-market', marketId });

        if (this.isConnected) {
            // Subscribe to both Order Update and Trade Executed channels
            this._send({
                action: 'SUBSCRIBE',
                channel: 'trade.order.update',
                marketId
            });
            this._send({
                action: 'SUBSCRIBE',
                channel: 'trade.record.new',
                marketId
            });
        }
    }

    /**
     * Unsubscribe from channel
     */
    unsubscribe(channel, params = {}) {
        const key = `${channel}:${JSON.stringify(params)}`;
        this.subscriptions.delete(key);

        if (this.isConnected) {
            this._send({ action: 'UNSUBSCRIBE', channel, ...params });
        }
    }

    /**
     * Handle incoming message
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data);

            if (message.type === 'pong') return;
            if (message.type === 'auth' && message.code === 0) {
                console.log('[WS] Authenticated');
                return;
            }

            // Handle user channel messages
            if (message.msgType === 'trade.order.update') {
                this._broadcast({
                    type: 'USER_ORDER_UPDATE',
                    data: message
                });
                return;
            }

            if (message.msgType === 'trade.record.new') {
                this._broadcast({
                    type: 'USER_TRADE_EXECUTED',
                    data: message
                });
                return;
            }

            this._broadcast(message);
        } catch (error) {
            console.error('[WS] Parse error:', error);
        }
    }

    /**
     * Add message handler
     */
    onMessage(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    /**
     * Disconnect
     */
    disconnect() {
        this._stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.subscriptions.clear();
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            subscriptions: this.subscriptions.size
        };
    }
}

export const wsManager = new WebSocketManager();
export default wsManager;
