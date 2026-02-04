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
                };

                this.ws.onerror = (error) => {
                    console.error('[WS] Error:', error);
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
        this._send({ type: 'auth', apiKey: this.apiKey });
    }

    /**
     * Start heartbeat
     */
    _startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this._send({ type: 'ping' });
            }
        }, WS_HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat
     */
    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Schedule reconnection
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts < WS_RECONNECT_MAX_ATTEMPTS) {
            const delay = WS_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts);
            this.reconnectAttempts++;
            console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this._connect(), delay);
        } else {
            console.error('[WS] Max reconnection attempts reached');
        }
    }

    /**
     * Send message
     */
    _send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /**
     * Handle incoming message
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data);

            if (message.type === 'pong') return;

            this._broadcast(message);
        } catch (error) {
            console.error('[WS] Parse error:', error);
        }
    }

    /**
     * Broadcast to all handlers
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
     * Resubscribe after reconnect
     */
    _resubscribe() {
        this.subscriptions.forEach((params, channel) => {
            this._send({ type: 'subscribe', channel, ...params });
        });
    }

    /**
     * Subscribe to channel
     */
    subscribe(channel, params = {}) {
        const key = `${channel}:${JSON.stringify(params)}`;
        this.subscriptions.set(key, { channel, ...params });

        if (this.isConnected) {
            this._send({ type: 'subscribe', channel, ...params });
        }
    }

    /**
     * Unsubscribe from channel
     */
    unsubscribe(channel, params = {}) {
        const key = `${channel}:${JSON.stringify(params)}`;
        this.subscriptions.delete(key);

        if (this.isConnected) {
            this._send({ type: 'unsubscribe', channel, ...params });
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
