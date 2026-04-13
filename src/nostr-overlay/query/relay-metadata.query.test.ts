/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RelayInfoState } from '../components/settings-pages/types';
import { createNostrOverlayQueryClient } from './query-client';
import { useRelayMetadataByUrlQuery } from './relay-metadata.query';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    rerender: (element: ReactElement) => Promise<void>;
}

interface ProbeProps {
    relayUrls: string[];
    enabled: boolean;
    onUpdate: (next: Record<string, RelayInfoState>) => void;
}

function RelayMetadataProbe({ relayUrls, enabled, onUpdate }: ProbeProps): null {
    const relayInfoByUrl = useRelayMetadataByUrlQuery({ relayUrls, enabled });

    useEffect(() => {
        onUpdate(relayInfoByUrl);
    }, [onUpdate, relayInfoByUrl]);

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

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });

    return { promise, resolve, reject };
}

let mounted: RenderResult[] = [];
const fetchMock = vi.fn<typeof fetch>();

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'fetch', {
        configurable: true,
        writable: true,
        value: fetchMock,
    });
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    vi.unstubAllGlobals();
});

describe('useRelayMetadataByUrlQuery', () => {
    test('reports loading, ready and error states by relay', async () => {
        const loadingResponse = createDeferred<Response>();
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('loading.relay')) {
                return loadingResponse.promise;
            }

            return {
                ok: false,
                status: 500,
                json: async () => ({}),
            } as Response;
        });

        let latest: Record<string, RelayInfoState> = {};
        const rendered = await renderElement(createElement(RelayMetadataProbe, {
            relayUrls: ['wss://loading.relay', 'wss://broken.relay'],
            enabled: true,
            onUpdate: (next: Record<string, RelayInfoState>) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => latest['wss://loading.relay']?.status === 'loading');

        loadingResponse.resolve({
            ok: true,
            status: 200,
            json: async () => ({ name: 'Loading Relay' }),
        } as Response);

        await waitFor(() => latest['wss://loading.relay']?.status === 'ready');
        await waitFor(() => latest['wss://broken.relay']?.status === 'error');
    });

    test('retries recoverable relay metadata failures', async () => {
        let attempts = 0;
        fetchMock.mockImplementation(async () => {
            attempts += 1;
            if (attempts === 1) {
                return {
                    ok: false,
                    status: 500,
                    json: async () => ({}),
                } as Response;
            }

            return {
                ok: true,
                status: 200,
                json: async () => ({ name: 'Recovered Relay' }),
            } as Response;
        });

        let latest: Record<string, RelayInfoState> = {};
        const rendered = await renderElement(createElement(RelayMetadataProbe, {
            relayUrls: ['wss://recover.relay'],
            enabled: true,
            onUpdate: (next: Record<string, RelayInfoState>) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => latest['wss://recover.relay']?.status === 'ready');
        expect(attempts).toBe(2);
    });

    test('uses deterministic keying by normalized relay URL', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ name: 'Relay' }),
        } as Response);

        let latest: Record<string, RelayInfoState> = {};
        const rendered = await renderElement(createElement(RelayMetadataProbe, {
            relayUrls: ['wss://relay.example', 'wss://relay.example/', ' wss://relay.example '],
            enabled: true,
            onUpdate: (next: Record<string, RelayInfoState>) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => latest['wss://relay.example']?.status === 'ready');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(Object.keys(latest)).toEqual(['wss://relay.example']);
    });
});
