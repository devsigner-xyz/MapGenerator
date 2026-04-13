import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const OVERLAY_ROOT = join(process.cwd(), 'src', 'nostr-overlay');

interface LegacyGuard {
    label: string;
    pattern: RegExp;
}

const LEGACY_GUARDS: LegacyGuard[] = [
    {
        label: `useFollowing${'Feed('}`,
        pattern: new RegExp(`useFollowing${'Feed\\('}`),
    },
    {
        label: `useSocial${'Notifications('}`,
        pattern: new RegExp(`useSocial${'Notifications\\('}`),
    },
    {
        label: `useDirect${'Messages('}`,
        pattern: new RegExp(`useDirect${'Messages\\('}`),
    },
    {
        label: `chatState${'Version'}`,
        pattern: new RegExp(`chatState${'Version'}`),
    },
    {
        label: `FollowingFeed${'Dialog'}`,
        pattern: new RegExp(`FollowingFeed${'Dialog'}`),
    },
];

function collectSourceFiles(directoryPath: string): string[] {
    const entries = readdirSync(directoryPath);
    const files: string[] = [];

    for (const entry of entries) {
        const absolutePath = join(directoryPath, entry);
        const stats = statSync(absolutePath);

        if (stats.isDirectory()) {
            files.push(...collectSourceFiles(absolutePath));
            continue;
        }

        if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) {
            continue;
        }

        if (absolutePath.endsWith('no-legacy-guards.test.ts')) {
            continue;
        }

        files.push(absolutePath);
    }

    return files;
}

describe('Nostr overlay legacy guards', () => {
    test('contains no legacy social state symbols', () => {
        const sourceFiles = collectSourceFiles(OVERLAY_ROOT);

        for (const sourceFile of sourceFiles) {
            const content = readFileSync(sourceFile, 'utf8');

            for (const guard of LEGACY_GUARDS) {
                expect(content, `${sourceFile} contains legacy symbol ${guard.label}`).not.toMatch(guard.pattern);
            }
        }
    });
});
