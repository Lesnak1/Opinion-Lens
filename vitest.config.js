import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['shared/**/*.js', 'background/**/*.js', 'popup/**/*.js'],
        },
    },
    resolve: {
        alias: {
            '@shared': resolve(__dirname, 'shared'),
            '@background': resolve(__dirname, 'background'),
        },
    },
});
