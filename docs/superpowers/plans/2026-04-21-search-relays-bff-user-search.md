# Search Relays + BFF User Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar `Relays de búsqueda` de los relays generales dentro de `/relays`, usar esa categoría para la búsqueda remota vía BFF y reutilizar la misma infraestructura de búsqueda para menciones `@` y búsqueda global de usuarios.

**Architecture:** La implementación mantiene una sola página `/relays`, pero añade una categoría persistente `search` en `relay-settings` que no contamina el pool general de relays. El cliente calcula resultados locales primero, delega el enriquecimiento remoto al BFF usando la lista de search relays configurada y centraliza la caché/estabilidad de UX con TanStack Query para que mention search y global user search compartan la misma capa de datos.

**Tech Stack:** React 19, TypeScript, TanStack Query, shadcn/ui, Fastify, Vitest, Nostr NIP-50.

---

## File Structure

- Modify: `src/nostr/relay-settings.ts`
  - Añadir categoría `search`, defaults curados y exclusión de `search` del pool general `relays`.
- Modify: `src/nostr/relay-settings.test.ts`
  - Probar defaults, migración y separación semántica.
- Modify: `src/nostr-overlay/components/settings-routes/controllers/relays-shared.tsx`
  - Etiquetas y descripción para la nueva categoría `search`.
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
  - Exponer filas y acciones separadas para search relays dentro de la misma página.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
  - Renderizar la nueva sección `Relays de búsqueda` en `/relays`.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
  - Validar el nuevo contrato de render.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx`
  - Mostrar `Búsqueda NIP-50` como categoría y advertencias de soporte cuando aplique.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
  - Cubrir el nuevo tipo `search` en la UI de detalle.
- Modify: `src/nostr-overlay/settings/relay-detail-routing.ts`
  - Permitir `type=search`.
- Modify: `src/nostr-overlay/settings/relay-detail-routing.test.ts`
  - Cubrir la nueva categoría.
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`
  - Incluir search relays en la resolución de metadata/estado para la pantalla de detalle.
- Modify: `src/nostr-api/http-client.ts`
  - Soportar arrays en query params.
- Modify: `src/nostr-api/http-client.test.ts`
  - Probar serialización de arrays.
- Modify: `src/nostr-api/user-search-api-service.ts`
  - Enviar `searchRelays` al BFF.
- Create: `src/nostr-overlay/search/local-user-search.ts`
  - Helper puro compartido para búsqueda local y ranking.
- Create: `src/nostr-overlay/search/local-user-search.test.ts`
  - Tests del helper puro.
- Modify: `src/nostr-overlay/query/keys.ts`
  - Incluir `ownerPubkey` y `searchRelaySetKey` en la query key de user search.
- Modify: `src/nostr-overlay/query/user-search.query.ts`
  - Consolidar query key, `placeholderData`, `staleTime` y reutilización entre superficies.
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
  - Integrar `local-first`, leer `byType.search` y usar el BFF para búsqueda remota.
- Modify: `src/nostr-overlay/App.tsx`
  - Pasar scope de owner/search relays a consumidores de búsqueda compartida si hace falta plumbing explícito.
- Modify: `src/nostr-overlay/components/SocialComposeDialog.tsx`
  - Recibir y pasar el scope compartido de user search al mention composer.
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
  - Recibir y pasar el scope compartido de user search al reply mention composer.
- Modify: `src/nostr-overlay/components/MentionTextarea.tsx`
  - Mantenerse sobre la capa compartida, sin lógica remota propia.
- Modify: `src/nostr-overlay/components/MentionTextarea.test.tsx`
  - Verificar estabilidad y resultados locales mientras hay refetch remoto.
- Modify: `src/nostr-overlay/components/UserSearchPage.tsx`
  - Reutilizar la misma capa compartida de búsqueda.
- Modify: `src/nostr-overlay/App.test.tsx`
  - Cobertura integrada de mention search + global search.
- Modify: `server/src/modules/users/users.schemas.ts`
  - Aceptar `searchRelays` opcional en `/users/search`.
- Modify: `server/src/modules/users/users.routes.ts`
  - Mantener el route contract actualizado.
- Modify: `server/src/modules/users/users.routes.test.ts`
  - Validar el contrato HTTP actualizado.
- Create: `server/src/modules/users/search-relay-defaults.ts`
  - Defaults curados de search relays.
- Modify: `server/src/modules/users/users.service.ts`
  - Usar `searchRelays` dedicados para búsquedas de texto y degradar bien.
- Modify: `server/src/modules/users/users.service.test.ts`
  - Probar selección de relays y fallback.

## Chunk 1: Relay Settings Model

### Task 1: Añadir una categoría `search` en relay settings

**Files:**
- Modify: `src/nostr/relay-settings.ts`
- Modify: `src/nostr/relay-settings.test.ts`

- [ ] **Step 1: Write the failing tests for the new relay type**

```ts
test('stores search relays in byType.search but does not merge them into state.relays', () => {
  const state = saveRelaySettings({
    relays: ['wss://relay.one'],
    byType: {
      nip65Both: ['wss://relay.one'],
      nip65Read: [],
      nip65Write: [],
      dmInbox: [],
      search: ['wss://search.nos.today'],
    },
  });

  expect(state.byType.search).toEqual(['wss://search.nos.today']);
  expect(state.relays).toEqual(['wss://relay.one']);
});

test('hydrates curated defaults for search relays on reset/defaults', () => {
  const state = getDefaultRelaySettings();
  expect(state.byType.search).toEqual([
    'wss://search.nos.today',
    'wss://relay.noswhere.com',
    'wss://filter.nostr.wine',
  ]);
});
```

- [ ] **Step 2: Run the failing relay-settings tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr/relay-settings.test.ts`
Expected: FAIL because `search` does not exist yet.

- [ ] **Step 3: Extend the RelayType model minimally**

Add `search` to the type union and to the persisted `byType` shape. Keep the existing storage key and migration style.

- [ ] **Step 4: Seed curated search defaults**

Use exactly:

```ts
[
  'wss://search.nos.today',
  'wss://relay.noswhere.com',
  'wss://filter.nostr.wine',
]
```

- [ ] **Step 5: Keep `search` out of the general relay list**

When building `state.relays`, exclude `byType.search`.

- [ ] **Step 6: Re-run the same test command and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr/relay-settings.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/nostr/relay-settings.ts src/nostr/relay-settings.test.ts
git commit -m "feat(relays): add dedicated search relay settings"
```

### Task 2: Extend relay detail routing for `search`

**Files:**
- Modify: `src/nostr-overlay/settings/relay-detail-routing.ts`
- Modify: `src/nostr-overlay/settings/relay-detail-routing.test.ts`

- [ ] **Step 1: Write the failing routing test**

```ts
test('builds and parses relay detail paths for search relay type', () => {
  const path = buildRelayDetailPath({
    relayUrl: 'wss://search.nos.today',
    source: 'configured',
    relayType: 'search',
  });

  expect(path).toContain('type=search');
  expect(parseRelayDetailSearch(path.split('?')[1] || '')).toMatchObject({ relayType: 'search' });
});
```

- [ ] **Step 2: Run the failing routing test**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/settings/relay-detail-routing.test.ts`
Expected: FAIL because `search` is not accepted yet.

- [ ] **Step 3: Extend the allowed relay type set**

Update parsing/building helpers to accept `search`.

- [ ] **Step 4: Re-run the test and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/settings/relay-detail-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/settings/relay-detail-routing.ts src/nostr-overlay/settings/relay-detail-routing.test.ts
git commit -m "test(relays): support search relay detail routing"
```

## Chunk 2: Single Relay Page UX

### Task 3: Render a dedicated `Relays de búsqueda` section inside `/relays`

**Files:**
- Modify: `src/nostr-overlay/components/settings-routes/controllers/relays-shared.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts`

- [ ] **Step 1: Write failing page tests for the new search relay section**

```ts
test('renders a dedicated search relays section in the same relays page', async () => {
  const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} searchConfiguredRows={[
    buildRelayRow({ relayUrl: 'wss://search.nos.today', relayTypes: ['search'], primaryRelayType: 'search' }),
  ]} searchSuggestedRows={[]} />);

  const text = rendered.container.textContent || '';
  expect(text).toContain('Relays de búsqueda');
  expect(text).toContain('autocomplete de @');
  expect(text).toContain('búsqueda global de usuarios');
});
```

- [ ] **Step 2: Add a failing test for reset behavior**

Assert the page exposes an action that resets search relays to the three curated defaults.

- [ ] **Step 3: Run the failing page tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: FAIL because the page/controller do not expose search relay data yet.

- [ ] **Step 4: Extend shared labels and descriptions for `search`**

Add a user-facing label such as `Búsqueda NIP-50`.

- [ ] **Step 5: Extend the relays controller with a second family of rows/actions**

Expose, at minimum:
- `searchConfiguredRows`
- `searchSuggestedRows`
- `onAddSearchRelays`
- `onRemoveSearchRelay`
- `onResetSearchRelaysToDefault`

Keep general relays and search relays independent.

- [ ] **Step 6: Render the new section below the existing relay sections**

Do not create a new route. Keep everything under `/relays`.

- [ ] **Step 7: Update relay detail page for `search` type**

Show `Búsqueda NIP-50` as the category when the detail route is opened for a search relay.

- [ ] **Step 8: Add detail-page coverage for the new relay type**

Update `SettingsRelayDetailPage.test.tsx` so the detail UI recognizes `search` and keeps loading metadata/status for search relays.

- [ ] **Step 9: Re-run the page tests and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/nostr-overlay/components/settings-routes/controllers/relays-shared.tsx src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx src/nostr-overlay/components/settings-routes/controllers/useRelayDetailController.ts
git commit -m "feat(relays): separate search relays within the relays page"
```

## Chunk 3: API Contract For Search Relays

### Task 4: Support repeated query params in the frontend HTTP client

**Files:**
- Modify: `src/nostr-api/http-client.ts`
- Modify: `src/nostr-api/http-client.test.ts`

- [ ] **Step 1: Write the failing array-query serialization test**

```ts
test('serializes array query values as repeated query params', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);

  const client = createHttpClient({ baseUrl: 'https://bff.example/v1' });
  await client.getJson('/users/search', {
    query: {
      ownerPubkey: 'a'.repeat(64),
      q: 'alice',
      searchRelays: ['wss://search.nos.today', 'wss://relay.noswhere.com'],
    } as any,
  });

  expect(fetchMock.mock.calls[0]?.[0]).toContain('searchRelays=wss%3A%2F%2Fsearch.nos.today');
  expect(fetchMock.mock.calls[0]?.[0]).toContain('searchRelays=wss%3A%2F%2Frelay.noswhere.com');
});
```

- [ ] **Step 2: Run the failing http-client test**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-api/http-client.test.ts`
Expected: FAIL because arrays are not serialized yet.

- [ ] **Step 3: Extend query serialization minimally**

Allow array values and serialize them as repeated params. Do not change existing scalar behavior.

- [ ] **Step 4: Re-run the test and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-api/http-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-api/http-client.ts src/nostr-api/http-client.test.ts
git commit -m "feat(api): support repeated array query params"
```

### Task 5: Extend `/users/search` to accept `searchRelays`

**Files:**
- Modify: `src/nostr-api/user-search-api-service.ts`
- Modify: `server/src/modules/users/users.schemas.ts`
- Modify: `server/src/modules/users/users.routes.ts`
- Modify: `server/src/modules/users/users.routes.test.ts`

- [ ] **Step 1: Write the failing backend contract test**

Add a route test that injects:

```http
/v1/users/search?ownerPubkey=<hex>&q=alice&limit=20&searchRelays=wss://search.nos.today&searchRelays=wss://relay.noswhere.com
```

and expects status `200`.

- [ ] **Step 2: Run the failing backend route test**

Run: `pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/users/users.routes.test.ts`
Expected: FAIL because `searchRelays` is not part of the schema yet.

- [ ] **Step 3: Extend the backend schema**

Add `searchRelays?: string[]` to the query type and JSON schema.

- [ ] **Step 4: Keep route wiring aligned with the new schema contract**

Touch `users.routes.ts` only if needed to keep the route definition and types in sync with the expanded query contract.

- [ ] **Step 5: Extend the frontend API service input**

Update `searchUsers()` to accept and send `searchRelays`.

- [ ] **Step 6: Re-run the route test and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/users/users.routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/nostr-api/user-search-api-service.ts server/src/modules/users/users.schemas.ts server/src/modules/users/users.routes.ts server/src/modules/users/users.routes.test.ts
git commit -m "feat(users): accept search relays in search api contract"
```

## Chunk 4: BFF Search Relay Execution

### Task 6: Use dedicated search relays for text search in the BFF

**Files:**
- Create: `server/src/modules/users/search-relay-defaults.ts`
- Modify: `server/src/modules/users/users.service.ts`
- Modify: `server/src/modules/users/users.service.test.ts`

- [ ] **Step 1: Write failing service tests for relay selection**

Cover these behaviors:
- when `searchRelays` is provided, text search uses that set
- when `searchRelays` is absent/empty, text search uses the curated defaults
- exact pubkey/npub fallback still works

- [ ] **Step 2: Run the failing users service tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/users/users.service.test.ts`
Expected: FAIL because the service still uses generic relay resolution.

- [ ] **Step 3: Add the curated default list in a dedicated module**

Create:

```ts
export const DEFAULT_SEARCH_RELAYS = [
  'wss://search.nos.today',
  'wss://relay.noswhere.com',
  'wss://filter.nostr.wine',
] as const;
```

- [ ] **Step 4: Update `users.service` so text search uses the dedicated search relay set**

For text queries, do not use generic bootstrap relays. Use `searchRelays` or the curated defaults.

- [ ] **Step 5: Validate and bound incoming `searchRelays` in the service**

Apply these rules:
- normalize relay URLs
- keep only valid `ws://` or `wss://` entries
- dedupe
- cap the effective list at `10`

- [ ] **Step 6: Keep exact-match fallback behavior intact**

Do not break direct `npub` / hex lookups.

- [ ] **Step 7: Re-run the service tests and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/users/users.service.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/users/search-relay-defaults.ts server/src/modules/users/users.service.ts server/src/modules/users/users.service.test.ts
git commit -m "feat(users): route text search through dedicated search relays"
```

### Task 7: Degrade gracefully when search relays fail

**Files:**
- Modify: `server/src/modules/users/users.service.ts`
- Modify: `server/src/modules/users/users.service.test.ts`

- [ ] **Step 1: Write failing tests for partial and total search-relay failures**

Expected policy:
- partial failures still return results from healthy relays
- total remote failure returns empty remote results instead of throwing hard

- [ ] **Step 2: Run the failing service tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/users/users.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the minimal failure policy**

Handle failing relays conservatively so the client can still merge local results.

The degraded result remains opaque to the client in v1. Keep observability server-side only.

- [ ] **Step 4: Re-run the tests and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project backend server/src/modules/users/users.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/users/users.service.ts server/src/modules/users/users.service.test.ts
git commit -m "fix(users): degrade gracefully when search relays fail"
```

## Chunk 5: Shared Local-First Search Layer

### Task 8: Add a shared local user search helper

**Files:**
- Create: `src/nostr-overlay/search/local-user-search.ts`
- Create: `src/nostr-overlay/search/local-user-search.test.ts`

- [ ] **Step 1: Write failing unit tests for local filtering and ranking**

Cover:
- follows first
- exact and prefix matches ahead of contains matches
- matching against `displayName`, `name`, `nip05`, `npub`, `pubkey`
- owner excluded

- [ ] **Step 2: Run the failing helper tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/search/local-user-search.test.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Implement the pure helper minimally**

Return `{ pubkeys, profiles }`-compatible output or an intermediate ranked row list that callers can reuse consistently.

- [ ] **Step 4: Re-run the tests and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/search/local-user-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/search/local-user-search.ts src/nostr-overlay/search/local-user-search.test.ts
git commit -m "feat(search): add shared local-first user search helper"
```

### Task 9: Make `useNostrOverlay.searchUsers` local-first and BFF-backed

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-api/user-search-api-service.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/SocialComposeDialog.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`

- [ ] **Step 1: Write failing integration expectations in existing tests**

Add expectations that typing a followed name still returns local matches even when remote search is pending or empty.

- [ ] **Step 2: Run the failing integration tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx src/nostr-overlay/components/MentionTextarea.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Compute local matches first in `useNostrOverlay.searchUsers`**

Use:
- `current.data.profiles`
- `current.data.follows`
- `current.data.ownerPubkey`

- [ ] **Step 4: Read `byType.search` from relay settings**

Use `loadRelaySettings({ ownerPubkey }).byType.search` when calling the BFF.

- [ ] **Step 5: Merge local + remote results before returning**

Rules:
- local matches remain visible
- remote enriches and adds missing profiles
- dedupe by `pubkey`
- shared final ranking must follow this contract:
  - exact > prefix > contains
  - follows ahead of non-follows when match quality is equivalent
  - local-known ahead of remote-only when match quality is equivalent
  - remote-only exact/prefix matches may outrank weaker local contains matches

- [ ] **Step 6: If query scope needs plumbing, pass it explicitly to search consumers**

Use `App.tsx`, `SocialComposeDialog.tsx`, and `FollowingFeedContent.tsx` only if owner/search relay scope is not already available at the query boundary.

- [ ] **Step 7: Re-run the integration tests and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx src/nostr-overlay/components/MentionTextarea.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-api/user-search-api-service.ts src/nostr-overlay/App.tsx src/nostr-overlay/components/SocialComposeDialog.tsx src/nostr-overlay/components/FollowingFeedContent.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/components/MentionTextarea.test.tsx
git commit -m "feat(search): make overlay user search local-first and bff-backed"
```

## Chunk 6: TanStack Query Reuse For Mentions And Global Search

### Task 10: Consolidate a shared TanStack Query search layer

**Files:**
- Modify: `src/nostr-overlay/query/keys.ts`
- Modify: `src/nostr-overlay/query/user-search.query.ts`
- Modify: `src/nostr-overlay/components/UserSearchPage.tsx`
- Modify: `src/nostr-overlay/components/MentionTextarea.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/components/MentionTextarea.test.tsx`

- [ ] **Step 1: Write failing tests proving both surfaces share the same data-layer behavior**

Target assertions:
- mention search keeps previous results while refetching
- global user search keeps previous results while refetching
- changing `searchRelaySetKey` changes the query key

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx src/nostr-overlay/components/MentionTextarea.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Extend `useUserSearchQuery` to include a stable search relay scope in the query key**

Update `nostrOverlayQueryKeys.userSearch(...)` in `src/nostr-overlay/query/keys.ts` so the key includes owner scope and deterministic `searchRelaySetKey`.

Include, at minimum:
- normalized term
- owner pubkey or anonymous owner scope
- deterministic search relay set key

The shared fetch size remains canonical at `20` results, so `limit` stays out of the query key in v1.

- [ ] **Step 4: Add `placeholderData` to preserve previous results during refetch**

Use TanStack Query explicitly to prevent flicker to empty.

- [ ] **Step 5: Add a short `staleTime` appropriate for mention/global search reuse**

Keep it small enough for freshness, long enough for a smooth UX.

- [ ] **Step 6: Keep UI-specific behavior in the components only**

Do not fork the underlying search logic between `MentionTextarea` and `UserSearchPage`.

- [ ] **Step 7: Re-run the tests and verify GREEN**

Run: `pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx src/nostr-overlay/components/MentionTextarea.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/nostr-overlay/query/keys.ts src/nostr-overlay/query/user-search.query.ts src/nostr-overlay/components/UserSearchPage.tsx src/nostr-overlay/components/MentionTextarea.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/components/MentionTextarea.test.tsx
git commit -m "feat(search): reuse TanStack Query search layer across mentions and global search"
```

## Chunk 7: Verification

### Task 11: Run full verification for frontend and backend

**Files:**
- Verify only

- [ ] **Step 1: Run targeted frontend tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend \
  src/nostr/relay-settings.test.ts \
  src/nostr-api/http-client.test.ts \
  src/nostr-overlay/search/local-user-search.test.ts \
  src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx \
  src/nostr-overlay/settings/relay-detail-routing.test.ts \
  src/nostr-overlay/components/MentionTextarea.test.tsx \
  src/nostr-overlay/App.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run targeted backend tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project backend \
  server/src/modules/users/users.routes.test.ts \
  server/src/modules/users/users.service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck:all`
Expected: PASS.

- [ ] **Step 4: Run lint**

Run:
- `pnpm lint:frontend`
- `pnpm lint:server`

Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Manual verification checklist**

Verify in the app:
- `/relays` still exists as one page
- the page now includes `Relays de búsqueda`
- reset for search relays restores exactly:
  - `wss://search.nos.today`
  - `wss://relay.noswhere.com`
  - `wss://filter.nostr.wine`
- global user search finds follows by name using the shared local-first layer
- mention autocomplete finds follows by name using the same shared layer
- no `bad req: unrecognised filter item` notices appear because generic relays are no longer used for NIP-50 text search

- [ ] **Step 7: Commit**

```bash
git commit -m "test(search): verify dedicated search relays and shared user search flow"
```

## Notes

- The relays UI stays on one page, per product decision.
- The search relay category is explicit and user-editable, but not published to Nostr in this phase.
- TanStack Query is a first-class part of the implementation, not an incidental detail.
- Mention autocomplete and global user search must converge on the same data-layer implementation to avoid divergent behavior.

Plan complete and saved to `docs/superpowers/plans/2026-04-21-search-relays-bff-user-search.md`. Ready to execute?
