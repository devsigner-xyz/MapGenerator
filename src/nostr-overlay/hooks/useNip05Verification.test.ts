/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import * as nip05Module from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import { createNostrOverlayQueryClient } from '../query/query-client';
import { useNip05Verification } from './useNip05Verification';

vi.mock('../../nostr/nip05', () => ({
    validateNip05Identifier: vi.fn(),
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    rerender: (element: ReactElement) => Promise<void>;
}

interface ProbeProps {
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    maxConcurrency?: number;
    onUpdate: (next: Record<string, Nip05ValidationResult | undefined>) => void;
}

function VerificationProbe({ profilesByPubkey, targetPubkeys, maxConcurrency, onUpdate }: ProbeProps): null {
    const verificationByPubkey = useNip05Verification({
        profilesByPubkey,
        targetPubkeys,
        maxConcurrency,
    });

    useEffect(() => {
        onUpdate(verificationByPubkey);
    }, [verificationByPubkey, onUpdate]);

    return null;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    async function render(nextElement: ReactElement): Promise<void> {
        await act(async () => {
            root.render(
                createElement(QueryClientProvider, { client: queryClient }, nextElement)
            );
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
    for (let index = 0; index < 40; index += 1) {
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

const validateNip05IdentifierMock = vi.mocked(nip05Module.validateNip05Identifier);

function createValidationResult(pubkey: string, identifier: string): Nip05ValidationResult {
    return {
        status: 'verified',
        identifier,
        displayIdentifier: identifier,
        resolvedPubkey: pubkey,
        checkedAt: Date.now(),
    };
}

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    validateNip05IdentifierMock.mockReset();
    validateNip05IdentifierMock.mockImplementation(async ({ pubkey, nip05 }) =>
        createValidationResult(pubkey, nip05 ?? '')
    );
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

describe('useNip05Verification', () => {
    test('keeps per-pubkey cache semantics when adding targets', async () => {
        const alice = 'a'.repeat(64);
        const bob = 'b'.repeat(64);
        const profilesByPubkey: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, nip05: 'alice@example.com' },
            [bob]: { pubkey: bob, nip05: 'bob@example.com' },
        };

        let latest: Record<string, Nip05ValidationResult | undefined> = {};
        const onUpdate = (next: Record<string, Nip05ValidationResult | undefined>) => {
            latest = next;
        };

        const rendered = await renderElement(
            createElement(VerificationProbe, {
                profilesByPubkey,
                targetPubkeys: [alice],
                onUpdate,
            })
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(latest[alice]));
        expect(validateNip05IdentifierMock).toHaveBeenCalledTimes(1);

        await rendered.rerender(
            createElement(VerificationProbe, {
                profilesByPubkey,
                targetPubkeys: [alice, bob],
                onUpdate,
            })
        );

        await waitFor(() => Boolean(latest[bob]));
        expect(validateNip05IdentifierMock).toHaveBeenCalledTimes(2);
    });

    test('keeps public map contract and ignores targets without nip05', async () => {
        const alice = 'c'.repeat(64);
        const unknown = 'd'.repeat(64);
        const profilesByPubkey: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, nip05: 'alice@nostr.test' },
            [unknown]: { pubkey: unknown },
        };

        let latest: Record<string, Nip05ValidationResult | undefined> = {};
        const rendered = await renderElement(
            createElement(VerificationProbe, {
                profilesByPubkey,
                targetPubkeys: [alice, unknown, alice],
                onUpdate: (next: Record<string, Nip05ValidationResult | undefined>) => {
                    latest = next;
                },
            })
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(latest[alice]));
        expect(Object.keys(latest)).toEqual([alice]);
        expect(latest[alice]?.status).toBe('verified');
        expect(validateNip05IdentifierMock).toHaveBeenCalledTimes(1);
    });
});
