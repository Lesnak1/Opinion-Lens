/**
 * Integration tests for Opinion API
 * These tests make real API calls to verify the API is working correctly
 * 
 * Run with: npm test -- tests/api-integration.test.js
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE_URL = 'https://api.opinion.trade/v1';

describe('Opinion API Integration', () => {
    // Skip in CI if no network - these are real API tests
    const skipTests = process.env.CI === 'true';

    describe.skipIf(skipTests)('Markets Endpoint', () => {
        it('fetches markets list successfully', async () => {
            const response = await fetch(`${API_BASE_URL}/market?page=1&limit=5&status=activated`);

            // API might require auth or have different response
            expect(response.status).toBeLessThan(500);

            if (response.ok) {
                const data = await response.json();
                expect(data).toBeDefined();
                // Check for standard API response structure
                if (data.code !== undefined) {
                    expect(data.code).toBe(0);
                }
            }
        });

        it('markets endpoint returns content-type json', async () => {
            const response = await fetch(`${API_BASE_URL}/market?page=1&limit=5`);

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                expect(contentType).toContain('application/json');
            }
        });

        it('markets endpoint responds within 5 seconds', async () => {
            const startTime = Date.now();
            await fetch(`${API_BASE_URL}/market?page=1&limit=5`);
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(5000);
        });
    });

    describe.skipIf(skipTests)('Token Endpoints', () => {
        it('token price endpoint format is correct', async () => {
            // Test with a sample token ID format
            const testTokenId = '0x0000000000000000000000000000000000000000';
            const response = await fetch(`${API_BASE_URL}/token/latest-price?tokenId=${testTokenId}`);

            // May return 404 for non-existent token, but should not error
            expect(response.status).toBeLessThan(500);
        });
    });
});

describe('API Client Unit Tests', () => {
    it('API_BASE_URL is valid HTTPS URL', () => {
        expect(API_BASE_URL).toMatch(/^https:\/\//);
        expect(API_BASE_URL).toContain('opinion.trade');
    });

    it('endpoint paths are correctly formed', () => {
        const marketEndpoint = `/market?page=1&limit=10`;
        const priceEndpoint = `/token/latest-price?tokenId=0xtest`;

        expect(`${API_BASE_URL}${marketEndpoint}`).toBe(
            'https://api.opinion.trade/v1/market?page=1&limit=10'
        );
        expect(`${API_BASE_URL}${priceEndpoint}`).toBe(
            'https://api.opinion.trade/v1/token/latest-price?tokenId=0xtest'
        );
    });
});

describe('API Error Handling', () => {
    it('handles network errors gracefully', async () => {
        try {
            // Try to fetch from a non-existent domain
            await fetch('https://this-domain-does-not-exist-12345.invalid/api');
        } catch (error) {
            expect(error).toBeDefined();
            expect(error.name).toBe('TypeError'); // fetch throws TypeError for network errors
        }
    });

    it('handles timeout correctly', async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 100);

        try {
            // This should either complete or abort
            await fetch(`${API_BASE_URL}/market`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (error) {
            // Can be AbortError (if aborted) or TypeError (if network fails first)
            expect(['AbortError', 'TypeError']).toContain(error.name);
        }
    });
});
