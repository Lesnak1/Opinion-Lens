/**
 * Tests for shared/utils.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    formatPrice,
    formatProbability,
    formatPnL,
    formatNumber,
    formatRelativeDate,
    debounce,
    throttle,
    sleep,
    escapeHtml,
    generateId,
    deepClone,
    isEmpty,
} from '../shared/utils.js';

describe('formatPrice', () => {
    it('formats 0.72 as 72.0¢', () => {
        expect(formatPrice(0.72)).toBe('72.0¢');
    });

    it('formats 0 as 0.0¢', () => {
        expect(formatPrice(0)).toBe('0.0¢');
    });

    it('formats 1 as 100.0¢', () => {
        expect(formatPrice(1)).toBe('100.0¢');
    });

    it('formats 0.5 as 50.0¢', () => {
        expect(formatPrice(0.5)).toBe('50.0¢');
    });

    it('formats decimal precision correctly', () => {
        expect(formatPrice(0.725)).toBe('72.5¢');
    });
});

describe('formatProbability', () => {
    it('formats 0.72 as 72%', () => {
        expect(formatProbability(0.72)).toBe('72%');
    });

    it('formats 0 as 0%', () => {
        expect(formatProbability(0)).toBe('0%');
    });

    it('formats 1 as 100%', () => {
        expect(formatProbability(1)).toBe('100%');
    });
});

describe('formatPnL', () => {
    it('formats positive value with + sign', () => {
        expect(formatPnL(10.5)).toBe('+$10.50');
    });

    it('formats negative value with - sign', () => {
        expect(formatPnL(-5.25)).toBe('-$5.25');
    });

    it('formats zero as positive', () => {
        expect(formatPnL(0)).toBe('+$0.00');
    });

    it('formats percentage when isPercentage is true', () => {
        expect(formatPnL(15.5, true)).toBe('+15.50%');
    });

    it('formats negative percentage', () => {
        expect(formatPnL(-3.2, true)).toBe('-3.20%');
    });
});

describe('formatNumber', () => {
    it('formats millions with M suffix', () => {
        expect(formatNumber(1500000)).toBe('1.50M');
    });

    it('formats thousands with K suffix', () => {
        expect(formatNumber(15000)).toBe('15.0K');
    });

    it('formats small numbers with decimals', () => {
        expect(formatNumber(123.45)).toBe('123.45');
    });

    it('formats exactly 1000 as 1.0K', () => {
        expect(formatNumber(1000)).toBe('1.0K');
    });

    it('formats exactly 1000000 as 1.00M', () => {
        expect(formatNumber(1000000)).toBe('1.00M');
    });
});

describe('formatRelativeDate', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "Today" for same day', () => {
        // Use exact same time for 0 diff - Today
        expect(formatRelativeDate('2026-02-01T12:00:00Z')).toBe('Today');
    });

    it('returns "Tomorrow" for next day', () => {
        expect(formatRelativeDate('2026-02-02T12:00:00Z')).toBe('Tomorrow');
    });

    it('returns days for within a week', () => {
        expect(formatRelativeDate('2026-02-05T12:00:00Z')).toBe('4d');
    });

    it('returns "Ended" for past dates', () => {
        expect(formatRelativeDate('2026-01-30T12:00:00Z')).toBe('Ended');
    });
});

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('delays function execution', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets timer on subsequent calls', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        vi.advanceTimersByTime(50);
        debounced();
        vi.advanceTimersByTime(50);

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe('throttle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('executes immediately on first call', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('prevents execution within limit', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        throttled();
        throttled();

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('allows execution after limit', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        vi.advanceTimersByTime(100);
        throttled();

        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('sleep', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves after specified time', async () => {
        const promise = sleep(100);
        vi.advanceTimersByTime(100);
        await expect(promise).resolves.toBeUndefined();
    });
});

describe('escapeHtml', () => {
    it('escapes < and >', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert("xss")&lt;/script&gt;'
        );
    });

    it('escapes &', () => {
        expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('returns empty string for empty input', () => {
        expect(escapeHtml('')).toBe('');
    });
});

describe('generateId', () => {
    it('generates unique IDs', () => {
        const id1 = generateId();
        const id2 = generateId();
        expect(id1).not.toBe(id2);
    });

    it('generates string IDs', () => {
        expect(typeof generateId()).toBe('string');
    });

    it('generates IDs with sufficient length', () => {
        expect(generateId().length).toBeGreaterThan(10);
    });
});

describe('deepClone', () => {
    it('clones nested objects', () => {
        const original = { a: { b: { c: 1 } } };
        const cloned = deepClone(original);

        expect(cloned).toEqual(original);
        expect(cloned).not.toBe(original);
        expect(cloned.a).not.toBe(original.a);
    });

    it('clones arrays', () => {
        const original = [1, [2, 3], { a: 4 }];
        const cloned = deepClone(original);

        expect(cloned).toEqual(original);
        expect(cloned).not.toBe(original);
    });
});

describe('isEmpty', () => {
    it('returns true for empty object', () => {
        expect(isEmpty({})).toBe(true);
    });

    it('returns false for object with properties', () => {
        expect(isEmpty({ a: 1 })).toBe(false);
    });
});
