# Profile Relay Discovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir que el dialog de detalle de persona muestre relays vacios cuando el perfil si publica relays, y endurecer la carga de relays declarados siguiendo NIP-65/NIP-17 y patrones observados en otros clientes Nostr.

**Architecture:** Extraer la carga de relays declarados a una unidad pequena y testeable en `src/nostr`, dejando que `useNostrOverlay` solo orqueste clientes y datos de estado. La nueva unidad conectara el cliente, consultara `kind:10002` y `kind:10050`, parseara con utilidades existentes y aplicara fallback de discovery sin mezclar responsabilidades de UI.

**Tech Stack:** TypeScript, React 19, TanStack Query, NDK via `NostrClient`, Vitest, NIP-65 relay list metadata, NIP-17/NIP-10050 DM relay list.

---

## Contexto

El dialog `OccupantProfileDialog` no consulta relays directamente. Solo renderiza `relaySuggestionsByType`, que llega desde `activeProfileService.loadNetwork` en `src/nostr-overlay/hooks/useNostrOverlay.ts`.

La causa mas probable del bug actual esta en `src/nostr-overlay/hooks/useNostrOverlay.ts:1650-1695`: se crea un cliente nuevo y se llama `client.fetchLatestReplaceableEvent(pubkey, 10002)` y `client.fetchLatestReplaceableEvent(pubkey, 10050)` sin llamar antes a `client.connect()`.

Esto es inconsistente con otros lectores Nostr del proyecto:

- `src/nostr/posts.ts` llama `await input.client.connect()` antes de `fetchEvents`.
- `src/nostr/profiles.ts` llama `await client.connect()` antes de cargar metadata.
- `src/nostr/follows.ts` llama `await client.connect()` antes de `fetchLatestReplaceableEvent`.
- `src/nostr/followers.ts` llama `await input.client.connect()` antes de buscar followers.

Tambien hay dos debilidades de resiliencia:

- La consulta usa `Promise.all`, por lo que un fallo de `kind:10050` borra tambien los relays validos de `kind:10002`.
- El `catch` convierte cualquier error en listas vacias, ocultando el fallo y haciendo que la UI parezca que el perfil no publico relays.

## Referencias De Clientes

- Coracle fuerza la carga de `RELAYS`, `MESSAGING_RELAYS` y `FOLLOWS` al abrir un perfil, y renderiza los relays desde la lista derivada del pubkey.
- Primal tiene una accion especifica `fetchRelayList(pubkey)` y parsea tags `r` con permisos `read`/`write`.
- Snort actualiza cache de relay lists por autor antes de operar con outbox/inbox, y parsea tanto NIP-65 como fallback legacy desde kind 3.
- noStrudel usa `kinds.RelayList` como fuente explicita para mailboxes y extrae relays desde tags `r`.

## Referencias De Protocolo

- NIP-65: `kind:10002` usa tags `['r', relayUrl]`, `['r', relayUrl, 'read']` o `['r', relayUrl, 'write']`. Sin marcador significa read+write.
- NIP-65 discovery: los clientes deben propagar y buscar la lista en relays publicos/indexadores cuando sea necesario.
- NIP-17 / DM relays: los relays de mensajes son datos separados; un fallo cargando DM relays no debe borrar los relays NIP-65.

## Files

- Create: `src/nostr/profile-relay-discovery.ts`
- Create: `src/nostr/profile-relay-discovery.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.test.tsx`
- No expected UI copy changes. If copy changes become necessary, update both `src/i18n/messages/en.ts` and `src/i18n/messages/es.ts`.

## Chunk 1: Discovery Unit

Recommended skills: `solid`, `nostr-specialist`, `vitest`.

### Task 1: Add Failing Unit Tests For Profile Relay Discovery

**Files:**

- Create: `src/nostr/profile-relay-discovery.test.ts`
- Create later: `src/nostr/profile-relay-discovery.ts`

- [ ] **Step 1: Write the failing test file**

Use a small `NostrClient` stub that records `connect()` calls and can reject individual event fetches.

Core examples to cover:

```ts
import { describe, expect, test, vi } from 'vitest';
import { loadProfileRelaySuggestions } from './profile-relay-discovery';
import type { NostrClient, NostrEvent } from './types';

function event(input: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'pubkey' | 'tags'>): NostrEvent {
    return {
        id: `evt-${input.kind}`,
        pubkey: input.pubkey,
        kind: input.kind,
        created_at: 123,
        tags: input.tags,
        content: '',
        ...(input.sig ? { sig: input.sig } : {}),
    };
}

function clientStub(eventsByKind: Record<number, NostrEvent | null | Error>): NostrClient & { connect: ReturnType<typeof vi.fn> } {
    const connect = vi.fn(async () => undefined);
    return {
        connect,
        fetchEvents: vi.fn(async () => []),
        fetchLatestReplaceableEvent: vi.fn(async (_pubkey: string, kind: number) => {
            if (!connect.mock.calls.length) {
                throw new Error('client must be connected before fetching');
            }

            const next = eventsByKind[kind] ?? null;
            if (next instanceof Error) {
                throw next;
            }

            return next;
        }),
    };
}

describe('loadProfileRelaySuggestions', () => {
    test('connects before fetching relay metadata', async () => {
        const pubkey = 'a'.repeat(64);
        const client = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.profile.example']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient: client });

        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(result.nip65Both).toEqual(['wss://relay.profile.example']);
        expect(result.nip65Read).toEqual(['wss://relay.profile.example']);
        expect(result.nip65Write).toEqual(['wss://relay.profile.example']);
    });

    test('keeps NIP-65 relays when DM relay metadata fails', async () => {
        const pubkey = 'b'.repeat(64);
        const client = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.read.example', 'read']],
            }),
            10050: new Error('dm relay timeout'),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient: client });

        expect(result.nip65Read).toEqual(['wss://relay.read.example']);
        expect(result.nip65Write).toEqual([]);
        expect(result.dmInbox).toEqual([]);
    });

    test('falls back when the primary client returns no relay metadata', async () => {
        const pubkey = 'c'.repeat(64);
        const primaryClient = clientStub({ 10002: null, 10050: null });
        const fallbackClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.fallback.example', 'write']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient, fallbackClient });

        expect(primaryClient.connect).toHaveBeenCalledTimes(1);
        expect(fallbackClient.connect).toHaveBeenCalledTimes(1);
        expect(result.nip65Write).toEqual(['wss://relay.fallback.example']);
    });

    test('does not use fallback when primary client returns relay metadata', async () => {
        const pubkey = 'd'.repeat(64);
        const primaryClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.primary.example']],
            }),
        });
        const fallbackClient = clientStub({
            10002: event({
                pubkey,
                kind: 10002,
                tags: [['r', 'wss://relay.fallback.example']],
            }),
        });

        const result = await loadProfileRelaySuggestions({ pubkey, primaryClient, fallbackClient });

        expect(result.nip65Both).toEqual(['wss://relay.primary.example']);
        expect(fallbackClient.connect).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/profile-relay-discovery.test.ts
```

Expected: FAIL because `./profile-relay-discovery` does not exist.

### Task 2: Implement Minimal Discovery Unit

**Files:**

- Create: `src/nostr/profile-relay-discovery.ts`
- Test: `src/nostr/profile-relay-discovery.test.ts`

- [ ] **Step 1: Add the implementation**

Implementation shape:

```ts
import type { RelaySettingsByType } from './relay-settings';
import {
    dmInboxRelayListFromKind10050Event,
    relaySuggestionsByTypeFromKind10002Event,
} from './relay-policy';
import type { NostrClient } from './types';

const DEFAULT_PROFILE_RELAY_METADATA_TIMEOUT_MS = 10_000;

export interface ProfileRelayDiscoveryInput {
    pubkey: string;
    primaryClient: NostrClient;
    fallbackClient?: NostrClient;
    timeoutMs?: number;
}

function emptyRelaySettingsByType(): RelaySettingsByType {
    return {
        nip65Both: [],
        nip65Read: [],
        nip65Write: [],
        dmInbox: [],
        search: [],
    };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(message));
        }, timeoutMs);

        void promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

function hasAnyRelay(settings: RelaySettingsByType): boolean {
    return settings.nip65Both.length > 0
        || settings.nip65Read.length > 0
        || settings.nip65Write.length > 0
        || settings.dmInbox.length > 0;
}

async function loadFromClient(input: { pubkey: string; client: NostrClient; timeoutMs: number }): Promise<RelaySettingsByType> {
    await input.client.connect();

    const [relayListResult, dmRelayListResult] = await Promise.allSettled([
        withTimeout(
            input.client.fetchLatestReplaceableEvent(input.pubkey, 10002),
            input.timeoutMs,
            'Relay timeout while fetching profile relay list (kind 10002)'
        ),
        withTimeout(
            input.client.fetchLatestReplaceableEvent(input.pubkey, 10050),
            input.timeoutMs,
            'Relay timeout while fetching profile DM relay list (kind 10050)'
        ),
    ]);

    const relayListEvent = relayListResult.status === 'fulfilled' ? relayListResult.value : null;
    const dmRelayListEvent = dmRelayListResult.status === 'fulfilled' ? dmRelayListResult.value : null;

    return {
        ...relaySuggestionsByTypeFromKind10002Event(relayListEvent),
        dmInbox: dmInboxRelayListFromKind10050Event(dmRelayListEvent),
        search: [],
    };
}

export async function loadProfileRelaySuggestions(input: ProfileRelayDiscoveryInput): Promise<RelaySettingsByType> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_PROFILE_RELAY_METADATA_TIMEOUT_MS;
    const primary = await loadFromClient({ pubkey: input.pubkey, client: input.primaryClient, timeoutMs })
        .catch(() => emptyRelaySettingsByType());

    if (hasAnyRelay(primary) || !input.fallbackClient) {
        return primary;
    }

    return loadFromClient({ pubkey: input.pubkey, client: input.fallbackClient, timeoutMs })
        .catch(() => emptyRelaySettingsByType());
}
```

- [ ] **Step 2: Run the unit test**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/profile-relay-discovery.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run existing relay policy tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/relay-policy.test.ts src/nostr/profile-relay-discovery.test.ts
```

Expected: PASS.

## Chunk 2: Overlay Integration

Recommended skills: `solid`, `nostr-specialist`, `vitest`.

### Task 3: Add Integration Coverage For Active Profile Relays

**Files:**

- Modify: `src/nostr-overlay/App.test.tsx`
- Modify later: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [ ] **Step 1: Add a failing integration test for fallback discovery**

Add a test near the existing active profile relay suggestions tests around `imports active profile relay suggestions into local relay settings`.

Behavior to prove:

- Initial owner graph loads normally.
- The selected profile has no relay list on primary/scoped relays.
- The fallback/bootstrap client returns `kind:10002` for the active profile.
- The dialog info tab shows `relay.profile-fallback.example`.

Test structure guidance:

```ts
test('loads active profile relay suggestions from fallback discovery relays', async () => {
    const ownerPubkey = 'f'.repeat(64);
    const followedPubkey = 'a'.repeat(64);
    const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();
    const createClient = vi.fn((relays?: string[]): NostrClient => ({
        connect: async () => {},
        fetchLatestReplaceableEvent: async (pubkey: string, kind: number) => {
            const relaySet = relays ?? [];
            const isFallbackClient = relaySet.includes('wss://relay.damus.io');
            if (!isFallbackClient || pubkey !== followedPubkey || kind !== 10002) {
                return null;
            }

            return {
                id: 'relay-list-active-profile-fallback',
                pubkey,
                kind: 10002,
                created_at: 321,
                tags: [['r', 'wss://relay.profile-fallback.example']],
                content: '',
            };
        },
        fetchEvents: async () => [],
    }));

    const rendered = await renderApp(
        <App
            mapBridge={bridge}
            services={{
                createClient,
                fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                    ownerPubkey,
                    follows: [followedPubkey],
                    relayHints: [],
                }),
                fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                    const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                    for (const pubkey of pubkeys) {
                        profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                    }
                    return profiles;
                }),
            }}
        />
    );
    mounted.push(rendered);

    const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
    const form = rendered.container.querySelector('form');

    await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
        npubInput.dispatchEvent(new Event('input', { bubbles: true }));
        npubInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

    await act(async () => {
        triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
    });

    await selectActiveProfileDialogTab('Informacion');
    await waitFor(() => (rendered.container.textContent || '').includes('relay.profile-fallback.example'));
});
```

Adjust the tab label to the exact string used by helpers in the test file. Existing tests use `Informacion`/`Información` depending on locale helpers; follow nearby tests.

- [ ] **Step 2: Run the integration test and verify failure**

Run the single test if practical with Vitest name filtering, otherwise run the file:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx
```

Expected: FAIL because `useNostrOverlay` does not create a fallback client for active profile relay metadata yet.

### Task 4: Integrate Discovery Helper In useNostrOverlay

**Files:**

- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Import the helper**

Add:

```ts
import { loadProfileRelaySuggestions } from '../../nostr/profile-relay-discovery';
```

Use the correct relative path from `src/nostr-overlay/hooks/useNostrOverlay.ts`.

- [ ] **Step 2: Replace the inline relay metadata `Promise.all` block**

Inside `loadNetwork`, replace lines around `1668-1695` with:

```ts
const primaryRelays = resolveOverlayRelays(current.data.relayHints);
const fallbackRelays = mergeRelaySets(primaryRelays, getBootstrapRelays());
const relaySuggestionsByTypePromise = loadProfileRelaySuggestions({
    pubkey,
    primaryClient: createClient(primaryRelays),
    ...(!hasSameRelaySet(primaryRelays, fallbackRelays)
        ? { fallbackClient: createClient(fallbackRelays) }
        : {}),
    timeoutMs: RELAY_METADATA_TIMEOUT_MS,
});

const client = createClient(primaryRelays);
```

Keep `client` for `resolveProfilesByOwner` to avoid broad behavior changes. If TypeScript complains about ordering, create `client` before `relaySuggestionsByTypePromise` and reuse it as `primaryClient`:

```ts
const primaryRelays = resolveOverlayRelays(current.data.relayHints);
const fallbackRelays = mergeRelaySets(primaryRelays, getBootstrapRelays());
const client = createClient(primaryRelays);
const relaySuggestionsByTypePromise = loadProfileRelaySuggestions({
    pubkey,
    primaryClient: client,
    ...(!hasSameRelaySet(primaryRelays, fallbackRelays)
        ? { fallbackClient: createClient(fallbackRelays) }
        : {}),
    timeoutMs: RELAY_METADATA_TIMEOUT_MS,
});
```

This avoids creating two identical primary clients.

- [ ] **Step 3: Run the integration test**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx
```

Expected: PASS for the new test and existing tests.

## Chunk 3: Regression Hardening

Recommended skills: `solid`, `nostr-specialist`, `vitest`.

### Task 5: Add Integration Coverage For Partial Failure

**Files:**

- Modify: `src/nostr-overlay/App.test.tsx`
- Test existing implementation from previous tasks.

- [ ] **Step 1: Add test where `10050` fails but `10002` succeeds**

Add a variant of the existing `imports active profile relay suggestions into local relay settings` test where:

- `kind === 10002` returns a relay list event.
- `kind === 10050` throws `new Error('dm relay failed')`.
- The info tab still shows the NIP-65 relay.

Acceptance assertion:

```ts
await waitFor(() => (rendered.container.textContent || '').includes('relay.profile.example'));
expect(rendered.container.textContent || '').not.toContain('Sin relays declarados');
```

- [ ] **Step 2: Run the focused file**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx
```

Expected: PASS.

### Task 6: Typecheck And Focused Verification

**Files:**

- No new files.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/profile-relay-discovery.test.ts src/nostr/relay-policy.test.ts src/nostr-overlay/App.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
pnpm typecheck:frontend
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint if imports or formatting changed**

Run:

```bash
pnpm lint:frontend
```

Expected: PASS or only unrelated pre-existing warnings. If failures are caused by this change, fix them before completion.

## Non-Goals

- Do not change visible UI copy unless required. If required, update both supported locales.
- Do not add legacy fallback from kind 3 in this iteration. Snort supports it, but it mixes old contact-list relay metadata with NIP-65; if added, make it a separate explicit compatibility task.
- Do not refactor `OccupantProfileDialog`; it already has the correct responsibility: render provided relay rows.
- Do not change `relay-policy.ts` unless a protocol test proves a parser defect.

## Acceptance Criteria

- Opening a person's detail dialog loads relays declared by that profile from `kind:10002` when available.
- The metadata client calls `connect()` before fetching replaceable events.
- A failure loading `kind:10050` does not erase valid `kind:10002` relays.
- The active profile relay metadata lookup attempts bootstrap/indexer fallback when scoped relays return no relay metadata.
- Existing NIP-65 parser behavior remains unchanged.
- Focused tests and `pnpm typecheck:frontend` pass.
