/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { useNip05VerificationQueries } from './nip05.query';
import { createNostrOverlayQueryClient } from './query-client';

const { validateNip05IdentifierMock } = vi.hoisted(() => ({
    validateNip05IdentifierMock: vi.fn(),
}));

vi.mock('../../nostr/nip05', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../nostr/nip05')>();
    return {
        ...actual,
        validateNip05Identifier: validateNip05IdentifierMock,
    };
});

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    rerender: (element: ReactElement) => Promise<void>;
}

interface ProbeProps {
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    onUpdate: (next: Record<string, Nip05ValidationResult | undefined>) => void;
}

function Nip05Probe({ profilesByPubkey, targetPubkeys, onUpdate }: ProbeProps): null {
    const verificationByPubkey = useNip05VerificationQueries({
        profilesByPubkey,
        targetPubkeys,
    });

    useEffect(() => {
        onUpdate(verificationByPubkey);
    }, [onUpdate, verificationByPubkey]);

    return null;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    async function render(nextElement: ReactElement): Promise<void> {
        await act(async () => {
            root.render(createElement(QueryClientProvider, { client: queryClient }, nextElement));
        });
    }

    await render(element);

    return {
        container,
        root,
        rerender: render,
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    validateNip05IdentifierMock.mockReset();
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('useNip05VerificationQueries', () => {
    test('dedupes validation requests by normalized identity', async () => {
        validateNip05IdentifierMock.mockImplementation(async (input: { pubkey: string; nip05: string }) => ({
            status: 'verified',
            identifier: input.nip05.trim().toLowerCase(),
            resolvedPubkey: input.pubkey.toLowerCase(),
            checkedAt: 1,
        }));

        let latest: Record<string, Nip05ValidationResult | undefined> = {};
        const rendered = await renderElement(createElement(Nip05Probe, {
            profilesByPubkey: {
                'pubkey-a': { pubkey: 'pubkey-a', nip05: 'Alice@example.com' },
                'PUBKEY-A': { pubkey: 'PUBKEY-A', nip05: ' alice@example.com ' },
            },
            targetPubkeys: ['PUBKEY-A', 'pubkey-a'],
            onUpdate: (next) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => Object.values(latest).some((value) => value?.status === 'verified'));
        expect(validateNip05IdentifierMock).toHaveBeenCalledTimes(1);
        expect(Object.keys(latest)).toEqual(['pubkey-a']);
    });

    test('returns deterministic output for equivalent target sets', async () => {
        validateNip05IdentifierMock.mockImplementation(async (input: { pubkey: string; nip05: string }) => ({
            status: 'verified',
            identifier: input.nip05.trim().toLowerCase(),
            resolvedPubkey: input.pubkey,
            checkedAt: 1,
        }));

        const snapshots: Record<string, Nip05ValidationResult | undefined>[] = [];
        const profilesByPubkey = {
            'pubkey-a': { pubkey: 'pubkey-a', nip05: 'alice@example.com' },
            'pubkey-b': { pubkey: 'pubkey-b', nip05: 'bob@example.com' },
        };

        const rendered = await renderElement(createElement(Nip05Probe, {
            profilesByPubkey,
            targetPubkeys: ['pubkey-b', 'pubkey-a'],
            onUpdate: (next) => {
                snapshots.push(next);
            },
        }));
        mounted.push(rendered);

        await waitFor(() =>
            Object.values(snapshots.at(-1) ?? {}).every((entry) => entry?.status === 'verified')
            && Object.keys(snapshots.at(-1) ?? {}).length === 2
        );
        const readySnapshot = snapshots.at(-1);
        expect(Object.keys(readySnapshot ?? {})).toEqual(['pubkey-a', 'pubkey-b']);

        await rendered.rerender(createElement(Nip05Probe, {
            profilesByPubkey,
            targetPubkeys: ['pubkey-a', 'pubkey-b'],
            onUpdate: (next) => {
                snapshots.push(next);
            },
        }));

        await waitFor(() => snapshots.length >= 2);
        expect(snapshots.at(-1)).toBe(readySnapshot);
    });

    test('does not retry failed validations with identity defaults', async () => {
        validateNip05IdentifierMock.mockRejectedValue(new Error('status 500'));

        let latest: Record<string, Nip05ValidationResult | undefined> = {};
        const rendered = await renderElement(createElement(Nip05Probe, {
            profilesByPubkey: {
                'pubkey-a': { pubkey: 'pubkey-a', nip05: 'alice@example.com' },
            },
            targetPubkeys: ['pubkey-a'],
            onUpdate: (next) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => validateNip05IdentifierMock.mock.calls.length > 0);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
        });

        expect(validateNip05IdentifierMock).toHaveBeenCalledTimes(1);
        expect(latest['pubkey-a']).toBeUndefined();
    });
});
