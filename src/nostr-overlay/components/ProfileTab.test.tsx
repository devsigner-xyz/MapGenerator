import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ProfileTab } from './ProfileTab';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

async function waitForCondition(check: () => boolean, timeoutMs: number = 2000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (check()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
    }

    throw new Error('Condition was not met in time');
}

function buildSession() {
    return {
        method: 'nsec' as const,
        pubkey: 'a'.repeat(64),
        readonly: false,
        locked: false,
        createdAt: 123,
        capabilities: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44' as const],
        },
    };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
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

describe('ProfileTab relay stats', () => {
    test('shows relay totals and connection counts in profile information tab', async () => {
        window.localStorage.setItem(
            'nostr.overlay.relays.v1',
            JSON.stringify({
                relays: ['wss://relay.general.one', 'wss://relay.inbox.one', 'wss://relay.shared.one', 'wss://relay.outbox.one'],
                byType: {
                    general: ['wss://relay.general.one'],
                    dmInbox: ['wss://relay.inbox.one', 'wss://relay.shared.one'],
                    dmOutbox: ['wss://relay.outbox.one', 'wss://relay.shared.one'],
                },
            })
        );

        const probeRelayStatus = vi.fn(async (relayUrl: string) => relayUrl === 'wss://relay.general.one');
        const rendered = await renderElement(
            <ProfileTab
                ownerPubkey={'a'.repeat(64)}
                followsCount={4}
                followersCount={1}
                followersLoading={false}
                authSession={buildSession() as any}
                canWrite
                canEncrypt
                relayConnectionProbe={probeRelayStatus}
            />
        );
        mounted.push(rendered);

        await waitForCondition(() => {
            const metricValues = Array.from(rendered.container.querySelectorAll('.nostr-profile-relay-stats dd'))
                .map((node) => node.textContent?.trim() || '');
            return metricValues.length === 3 && metricValues[0] === '5' && metricValues[1] === '1' && metricValues[2] === '4';
        });

        const metricValues = Array.from(rendered.container.querySelectorAll('.nostr-profile-relay-stats dd'))
            .map((node) => node.textContent?.trim() || '');
        expect(metricValues).toEqual(['5', '1', '4']);

        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.general.one', expect.any(Number));
        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.inbox.one', expect.any(Number));
        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.shared.one', expect.any(Number));
        expect(probeRelayStatus).toHaveBeenCalledWith('wss://relay.outbox.one', expect.any(Number));
    });
});
