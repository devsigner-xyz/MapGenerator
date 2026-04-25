# Relay Query Planner For Followers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la carga de followers, profile stats y lecturas sociales relacionadas usando planificacion de relays por tipo de lectura, con semilla cliente y enriquecimiento del BFF por autor.

**Architecture:** El cliente enviara `scopedReadRelays` ricos al BFF en las lecturas sociales que hoy dependen demasiado de bootstrap. El BFF dejara de usar un scope plano y pasara a un `RelayQueryPlanner` por tipo de lectura, apoyado por un `AuthorRelayDirectory` con TTL corto y una utilidad compartida de follower discovery para que `graph` y `content` no diverjan.

**Tech Stack:** Fastify BFF, React, TypeScript, Nostr kind `3` and `10002`, Vitest, in-memory TTL cache

---

## Chunk 1: Request Contract And Client Relay Seeds

**Suggested skills:** `nostr-specialist`, `vitest`, `solid`, `typescript-advanced-types`

### Task 1: Fijar el contrato nuevo con tests de API cliente y rutas

**Files:**
- Modify: `src/nostr-api/graph-api-service.test.ts`
- Modify: `server/src/modules/graph/graph.routes.test.ts`
- Modify: `server/src/modules/content/content.routes.test.ts`

- [ ] **Step 1: Escribir tests que fallen primero para `scopedReadRelays`**

Agregar cobertura para asegurar:

- `createGraphApiService().loadFollowers()` envia `scopedReadRelays` en el body POST.
- `createGraphApiService().loadProfileStats()` envia `scopedReadRelays` en el body POST.
- `createGraphApiService().loadPosts()` envia `scopedReadRelays` en query string.
- `graph.routes` acepta `scopedReadRelays` opcional en `GET /graph/followers` y `POST /graph/followers`.
- `content.routes` acepta `scopedReadRelays` opcional en `GET /content/posts`, `GET /content/profile-stats` y `POST /content/profile-stats`.
- `graph.routes` reenvia `scopedReadRelays` intacto al servicio para GET y POST.
- `content.routes` reenvia `scopedReadRelays` intacto al servicio para GET y POST.

- [ ] **Step 2: Ejecutar los tests enfocados y confirmar fallo**

Run: `pnpm vitest run --config vitest.config.mts src/nostr-api/graph-api-service.test.ts server/src/modules/graph/graph.routes.test.ts server/src/modules/content/content.routes.test.ts`

Expected: FAIL porque `scopedReadRelays` aun no forma parte del contrato.

### Task 2: Extender los DTOs y el cliente HTTP con el cambio minimo

**Files:**
- Modify: `src/nostr-api/graph-api-service.ts`
- Modify: `server/src/modules/graph/graph.schemas.ts`
- Modify: `server/src/modules/graph/graph.routes.ts`
- Modify: `server/src/modules/content/content.schemas.ts`
- Modify: `server/src/modules/content/content.routes.ts`

- [ ] **Step 3: Anadir `scopedReadRelays` a los tipos del cliente**

Extender `GraphApiService` para aceptar:

```ts
loadFollowers(input: {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string[];
  scopedReadRelays?: string[];
})

loadPosts(input: {
  ownerPubkey: string;
  pubkey: string;
  limit?: number;
  until?: number;
  scopedReadRelays?: string[];
})

loadProfileStats(input: {
  ownerPubkey: string;
  pubkey: string;
  candidateAuthors?: string[];
  scopedReadRelays?: string[];
})
```

- [ ] **Step 4: Normalizar la lista antes de enviarla**

Crear un helper pequeno junto a `toCandidateAuthorsList` que:

- trimmee valores
- quite vacios
- deduplique
- limite el tamaño a un cap pequeno y estable, por ejemplo `12`

- [ ] **Step 5: Extender schemas y routes del BFF**

Anadir `scopedReadRelays?: string[]` con `maxItems` y `maxLength` conservadores. Mantenerlo opcional. Validar URLs `ws://` o `wss://` validas y descartar entradas invalidas. En rutas POST, unirlo o pasarlo tal cual al service. En GET, aceptar arrays repetidos siguiendo el patron ya usado por `users.search`.

- [ ] **Step 6: Ejecutar los tests enfocados y confirmar que pasen**

Run: `pnpm vitest run --config vitest.config.mts src/nostr-api/graph-api-service.test.ts server/src/modules/graph/graph.routes.test.ts server/src/modules/content/content.routes.test.ts`

Expected: PASS.

---

## Chunk 2: Shared Relay Planning Primitives In The BFF

**Suggested skills:** `nodejs-backend-patterns`, `nostr-specialist`, `solid`, `senior-architect`, `vitest`

### Task 3: Crear el directorio de relays por autor con TTL corto

**Files:**
- Create: `server/src/relay/author-relay-directory.ts`
- Create: `server/src/relay/author-relay-directory.test.ts`
- Modify: `server/src/modules/graph/graph.service.ts`
- Modify: `server/src/modules/content/content.service.ts`

- [ ] **Step 7: Escribir tests que fallen para el directorio de relays**

Cubrir estos casos:

- usa `kind 10002` como fuente principal para `read` y `write`
- cae a `kind 3` legacy cuando falta `10002`
- deduplica y normaliza URLs
- cachea por pubkey y evita refetch dentro del TTL
- devuelve arrays vacios si no hay metadata util

- [ ] **Step 8: Ejecutar el test y confirmar fallo**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/author-relay-directory.test.ts`

Expected: FAIL porque el archivo no existe.

- [ ] **Step 9: Implementar `AuthorRelayDirectory` con superficie minima**

Superficie sugerida:

```ts
export interface AuthorRelayDirectory {
  getAuthorReadRelays(pubkey: string): Promise<string[]>;
  getAuthorWriteRelays(pubkey: string): Promise<string[]>;
}
```

Pautas:

- usar `createTTLCache`
- TTL corto, por ejemplo `5 * 60_000`
- cap de relays por autor, por ejemplo `8`
- usar `10002` primero y `kind 3` solo como fallback de compatibilidad
- resolver metadata reutilizando `SimplePool.querySync(...)` sobre un scope bootstrap conservador
- para `10002`, consultar `authors: [pubkey], kinds: [10002], limit: 1`
- para fallback legacy, consultar `authors: [pubkey], kinds: [3], limit: 1`
- componer la dependencia dentro de `createGraphService()` y `createContentService()`, no en `app.ts`

- [ ] **Step 10: Ejecutar el test y confirmar que pase**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/author-relay-directory.test.ts`

Expected: PASS.

### Task 4: Crear el planner de consultas por tipo de lectura

**Files:**
- Create: `server/src/relay/relay-query-planner.ts`
- Create: `server/src/relay/relay-query-planner.test.ts`

- [ ] **Step 11: Escribir tests que fallen para el planner**

Cubrir estos casos:

- para `posts`, usa `scopedReadRelays` como primary y bootstrap como fallback
- para `followers`, combina `scopedReadRelays` con outboxes de `candidateAuthors`
- limita fan-out por autor y total de relays
- cuando no hay datos enriquecidos, cae limpiamente a bootstrap
- canoniza relay sets equivalentes para que distinto orden o duplicados no cambien el plan resultante

- [ ] **Step 12: Ejecutar el test y confirmar fallo**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-planner.test.ts`

Expected: FAIL porque el planner no existe.

- [ ] **Step 13: Implementar un planner pequeno y explicito**

Superficie sugerida:

```ts
export interface RelayQueryPlanner {
  planPosts(input: { scopedReadRelays?: string[]; targetPubkey: string }): Promise<{ primary: string[]; fallback: string[] }>;
  planFollowers(input: { scopedReadRelays?: string[]; targetPubkey: string; candidateAuthors: string[] }): Promise<{
    ownerScope: { primary: string[]; fallback: string[] };
    candidateAuthorScopes: Array<{ authors: string[]; relays: string[] }>;
  }>;
}
```

Reglas:

- no introducir abstracciones genericas fuera de este caso
- ordenar scopes de `candidateAuthors` por relay compartido para reducir queries
- preferir write relays de autores para kind `3`
- producir relay sets ya normalizados para que `relaySetKey(...)` genere claves estables

- [ ] **Step 14: Ejecutar el test y confirmar que pase**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-planner.test.ts`

Expected: PASS.

---

## Chunk 3: Shared Follower Discovery And BFF Integration

**Suggested skills:** `systematic-debugging`, `nodejs-backend-patterns`, `solid`, `vitest`, `nostr-specialist`

### Task 5: Extraer follower discovery compartido para `graph` y `content`

**Files:**
- Create: `server/src/relay/follower-discovery.ts`
- Create: `server/src/relay/follower-discovery.test.ts`
- Modify: `server/src/modules/graph/graph.service.ts`
- Modify: `server/src/modules/content/content.service.ts`

- [ ] **Step 15: Escribir tests que fallen primero para la utilidad compartida**

Cubrir estos casos:

- `#p` scan encuentra followers sobre el scope del owner/request
- `candidateAuthors` se consultan sobre sus propios outboxes
- el resultado deduplica followers repetidos
- la utilidad compartida recibe relays ya planificados y no decide por si misma la seleccion de relays
- la utilidad compartida no calcula `complete`; solo devuelve datos brutos suficientes para que cada servicio derive su propio contrato

- [ ] **Step 16: Ejecutar el test y confirmar fallo**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/follower-discovery.test.ts`

Expected: FAIL porque la utilidad aun no existe.

- [ ] **Step 17: Mover la logica comun a `follower-discovery.ts`**

Extraer desde `graph.service.ts` y `content.service.ts` solo estas piezas compartidas:

- `parseCandidateAuthors`
- `parseFollowsFromKind3`
- `collectFollowersFromEvents`
- escaneo por `#p`
- escaneo por `candidateAuthors`

Mantener la API orientada al caso de uso actual, no una libreria generica. La seleccion de relays queda fuera en el planner; el manejo de `complete`, gateways y fallos de borde queda en cada servicio.

- [ ] **Step 18: Ejecutar el test y confirmar que pase**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/follower-discovery.test.ts`

Expected: PASS.

### Task 6: Integrar planner y discovery compartido en `graph` y `content`

**Files:**
- Modify: `server/src/modules/graph/graph.service.ts`
- Modify: `server/src/modules/graph/graph.service.test.ts`
- Modify: `server/src/modules/content/content.service.ts`
- Modify: `server/src/modules/content/content.service.test.ts`

- [ ] **Step 19: Escribir o ampliar tests de servicio antes del cambio**

Agregar cobertura para asegurar:

- `graph.getFollowers()` incluye `scopedReadRelays` en la cache key
- `content.getProfileStats()` incluye `scopedReadRelays` en la cache key
- `content.getPosts()` incluye `scopedReadRelays` en la cache key
- `profileStats` usa la misma discovery shared que `followers`
- `posts` deja de consultar solo bootstrap cuando llega scope cliente
- relay sets equivalentes generan la misma cache key aunque cambie el orden o haya duplicados

- [ ] **Step 20: Ejecutar los tests enfocados y confirmar fallo**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/graph/graph.service.test.ts server/src/modules/content/content.service.test.ts`

Expected: FAIL por cache keys incompletas o por ausencia del planner.

- [ ] **Step 21: Integrar el planner en `graph.service.ts`**

Cambios esperados:

- `createGraphService()` instancia `AuthorRelayDirectory` y `RelayQueryPlanner` y los pasa a `createPoolFetchers(...)`
- `queryWithFallback()` deja de fijar `scopedRelays: []`
- `fetchFollowers()` usa `planFollowers(...)`
- `getFollowers()` incluye relay set key estable en cache key usando `relaySetKey(...)`
- mantener el comportamiento tolerante que devuelve `complete: false` al fallar

- [ ] **Step 22: Integrar el planner en `content.service.ts`**

Cambios esperados:

- `createContentService()` instancia `AuthorRelayDirectory` y `RelayQueryPlanner` y los pasa a `createPoolFetchers(...)`
- `fetchPosts()` usa el scope de lectura planificado
- `fetchProfileStats()` reutiliza `follower-discovery.ts`
- `getProfileStats()` y `getPosts()` incluyen relay set key estable en cache key usando `relaySetKey(...)`

- [ ] **Step 23: Ejecutar los tests enfocados y confirmar que pasen**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/graph/graph.service.test.ts server/src/modules/content/content.service.test.ts server/src/modules/graph/graph.routes.test.ts server/src/modules/content/content.routes.test.ts`

Expected: PASS.

---

## Chunk 4: Overlay Wiring And End-To-End Verification Of The Change Surface

**Suggested skills:** `react-best-practices`, `nostr-specialist`, `vitest`, `verification-before-completion`, `solid`

### Task 7: Reutilizar la resolucion conservadora del cliente para generar `scopedReadRelays`

**Files:**
- Modify: `src/nostr/relay-runtime.ts`
- Modify: `src/nostr/relay-runtime.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 24: Escribir tests que fallen para la resolucion cliente**

Cubrir estos casos:

- `resolveConservativeSocialRelaySets()` mezcla `nip65Both`, `nip65Read`, `relayHints` y sugerencias `nip65Read/nip65Both`
- el overlay envia `scopedReadRelays` a `loadFollowers`
- el overlay envia `scopedReadRelays` a `loadProfileStats`
- el overlay envia `scopedReadRelays` a `loadPosts`

- [ ] **Step 25: Ejecutar los tests enfocados y confirmar fallo**

Run: `pnpm vitest run --config vitest.config.mts src/nostr/relay-runtime.test.ts src/nostr-api/graph-api-service.test.ts src/nostr-overlay/App.test.tsx`

Expected: FAIL por falta de mezcla de sugerencias o por no pasar `scopedReadRelays` al BFF.

- [ ] **Step 26: Extender `resolveConservativeSocialRelaySets()` sin romper callers existentes**

Anadir soporte para que `additionalReadRelays` pueda incluir:

- `relayHints`
- `suggestedRelaysByType.nip65Both`
- `suggestedRelaysByType.nip65Read`

Mantener `primary` y `fallback` como contrato. No crear una segunda utilidad si esta ya cubre el caso. Cubrir con test que dos listas equivalentes generan el mismo `primary` canonico.

- [ ] **Step 27: Pasar `scopedReadRelays` desde `useNostrOverlay`**

Usar el `primary` resuelto por el runtime cliente en:

- `graphApiService.loadFollowers()`
- `graphApiService.loadProfileStats()`
- `graphApiService.loadPosts()`
- `loadNetwork()` cuando llama a `graphApiService.loadFollowers()`

- [ ] **Step 28: Ejecutar los tests enfocados y confirmar que pasen**

Run: `pnpm vitest run --config vitest.config.mts src/nostr/relay-runtime.test.ts src/nostr-api/graph-api-service.test.ts src/nostr-overlay/App.test.tsx`

Expected: PASS.

### Task 8: Verificacion final antes de implementar cualquier rollout adicional

**Files:**
- No code changes expected

- [ ] **Step 29: Ejecutar la verificacion de backend tocado**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/author-relay-directory.test.ts server/src/relay/relay-query-planner.test.ts server/src/relay/follower-discovery.test.ts server/src/modules/graph/graph.service.test.ts server/src/modules/content/content.service.test.ts server/src/modules/graph/graph.routes.test.ts server/src/modules/content/content.routes.test.ts`

Expected: PASS.

- [ ] **Step 30: Ejecutar la verificacion de frontend tocado**

Run: `pnpm vitest run --config vitest.config.mts src/nostr/relay-runtime.test.ts src/nostr-api/graph-api-service.test.ts src/nostr-overlay/App.test.tsx`

Expected: PASS.

- [ ] **Step 31: Ejecutar validacion general del repositorio**

Run: `pnpm test:unit && pnpm typecheck:all && pnpm lint:full`

Expected: PASS o fallos existentes no relacionados documentados con evidencia fresca.

- [ ] **Step 32: Commit solo si el usuario lo pide**

No crear commit automaticamente.
