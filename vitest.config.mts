import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            jsts: 'jsts/dist/jsts.min.js',
        },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'frontend',
                    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
                    exclude: ['server/src/**/*.test.ts'],
                    environment: 'jsdom',
                    setupFiles: ['src/test/vitest.setup.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'backend',
                    include: ['server/src/**/*.test.ts'],
                    environment: 'node',
                },
            },
        ],
    },
});
