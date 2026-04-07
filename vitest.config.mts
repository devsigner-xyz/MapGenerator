import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            jsts: 'jsts/dist/jsts.min.js',
        },
    },
    test: {
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        environment: 'jsdom',
    },
});
