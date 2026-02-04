/**
 * Opinion Lens - Utility Functions
 */

/**
 * Format price as cents (e.g., 0.72 → "72¢")
 * @param {number} price - Price between 0 and 1
 * @returns {string}
 */
export function formatPrice(price) {
    return `${(price * 100).toFixed(1)}¢`;
}

/**
 * Format price as percentage (e.g., 0.72 → "72%")
 * @param {number} price - Price between 0 and 1
 * @returns {string}
 */
export function formatProbability(price) {
    return `${(price * 100).toFixed(0)}%`;
}

/**
 * Format P&L value with sign
 * @param {number} value - P&L value
 * @param {boolean} isPercentage - Whether to format as percentage
 * @returns {string}
 */
export function formatPnL(value, isPercentage = false) {
    const prefix = value >= 0 ? '+' : '-';
    if (isPercentage) {
        return `${prefix}${Math.abs(value).toFixed(2)}%`;
    }
    return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Format large numbers with K/M suffix
 * @param {number} num - Number to format
 * @returns {string}
 */
export function formatNumber(num) {
    if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(2)}M`;
    }
    if (num >= 1_000) {
        return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toFixed(2);
}

/**
 * Format date relative to now
 * @param {string|Date} date - Date to format
 * @returns {string}
 */
export function formatRelativeDate(date) {
    const now = new Date();
    const target = new Date(date);
    const diffMs = target - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Ended';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `${diffDays}d`;
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`;
    return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function}
 */
export function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle function execution
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls
 * @returns {Function}
 */
export function throttle(fn, limit) {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string}
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Generate unique ID
 * @returns {string}
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*}
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object is empty
 * @param {Object} obj - Object to check
 * @returns {boolean}
 */
export function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}
