/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { NostrProfile } from '../../nostr/types';
import type { IdentityApiService } from '../../nostr-api/identity-api-service';
import { useNip05VerificationQueries } from './nip05.query';
import { createNostrOverlayQueryClient } from './query-client';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    rerender: (element: ReactElement) => Promise<void>;
}

interface ProbeProps {
    ownerPubkey?: string;
    profilesByPubkey: Record<string, NostrProfile>;
    targetPubkeys: string[];
    identityApiService: IdentityApiService;
    onUpdate: (next: Record<string, Nip05ValidationResult | undefined>) => void;
}

function Nip05Probe({ ownerPubkey, profilesByPubkey, targetPubkeys, identityApiService, onUpdate }: ProbeProps): null {
    const verificationInput = ownerPubkey === undefined
        ? {
            profilesByPubkey,
            targetPubkeys,
            identityApiService,
        }
        : {
            ownerPubkey,
            profilesByPubkey,
            targetPubkeys,
            identityApiService,
        };

    const verificationByPubkey = useNip05VerificationQueries(verificationInput);

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
    test('dedupes verification checks by normalized identity in one batch call', async () => {
        const verifyNip05Batch = vi.fn<IdentityApiService['verifyNip05Batch']>(async ({ checks }) =>
            checks.map((check) => ({
                pubkey: check.pubkey,
                result: {
                    status: 'verified',
                    identifier: check.nip05,
                    resolvedPubkey: check.pubkey,
                    checkedAt: 1,
                },
            })),
        );
        const identityApiService: IdentityApiService = {
            verifyNip05Batch,
            resolveProfiles: vi.fn(async () => ({})),
        };

        let latest: Record<string, Nip05ValidationResult | undefined> = {};
        const rendered = await renderElement(createElement(Nip05Probe, {
            ownerPubkey: 'f'.repeat(64),
            profilesByPubkey: {
                'pubkey-a': { pubkey: 'pubkey-a', nip05: 'Alice@example.com' },
                'PUBKEY-A': { pubkey: 'PUBKEY-A', nip05: ' alice@example.com ' },
            },
            targetPubkeys: ['PUBKEY-A', 'pubkey-a'],
            identityApiService,
            onUpdate: (next) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => Object.values(latest).some((value) => value?.status === 'verified'));
        expect(verifyNip05Batch).toHaveBeenCalledTimes(1);
        expect(verifyNip05Batch.mock.calls[0]?.[0].checks).toEqual([
            {
                pubkey: 'pubkey-a',
                nip05: 'alice@example.com',
            },
        ]);
        expect(Object.keys(latest)).toEqual(['pubkey-a']);
    });

    test('keeps deterministic batch key for equivalent target sets', async () => {
        const verifyNip05Batch = vi.fn<IdentityApiService['verifyNip05Batch']>(async ({ checks }) =>
            checks.map((check) => ({
                pubkey: check.pubkey,
                result: {
                    status: 'verified',
                    identifier: check.nip05,
                    resolvedPubkey: check.pubkey,
                    checkedAt: 1,
                },
            })),
        );
        const identityApiService: IdentityApiService = {
            verifyNip05Batch,
            resolveProfiles: vi.fn(async () => ({})),
        };

        const profilesByPubkey = {
            'pubkey-a': { pubkey: 'pubkey-a', nip05: 'alice@example.com' },
            'pubkey-b': { pubkey: 'pubkey-b', nip05: 'bob@example.com' },
        };

        const rendered = await renderElement(createElement(Nip05Probe, {
            ownerPubkey: 'f'.repeat(64),
            profilesByPubkey,
            targetPubkeys: ['pubkey-b', 'pubkey-a'],
            identityApiService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await waitFor(() => verifyNip05Batch.mock.calls.length === 1);

        await rendered.rerender(createElement(Nip05Probe, {
            ownerPubkey: 'f'.repeat(64),
            profilesByPubkey,
            targetPubkeys: ['pubkey-a', 'pubkey-b'],
            identityApiService,
            onUpdate: () => {},
        }));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(verifyNip05Batch).toHaveBeenCalledTimes(1);
    });

    test('skips batch request when owner pubkey is missing', async () => {
        const verifyNip05Batch = vi.fn<IdentityApiService['verifyNip05Batch']>(async () => []);
        const identityApiService: IdentityApiService = {
            verifyNip05Batch,
            resolveProfiles: vi.fn(async () => ({})),
        };

        let latest: Record<string, Nip05ValidationResult | undefined> = {
            seed: undefined,
        };
        const rendered = await renderElement(createElement(Nip05Probe, {
            profilesByPubkey: {
                'pubkey-a': { pubkey: 'pubkey-a', nip05: 'alice@example.com' },
            },
            targetPubkeys: ['pubkey-a'],
            identityApiService,
            onUpdate: (next) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(verifyNip05Batch).not.toHaveBeenCalled();
        expect(latest).toEqual({});
    });
});
