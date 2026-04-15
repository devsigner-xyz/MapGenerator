# Fastify Nostr BFF Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar relay networking a un BFF Fastify (social, DM, notifications, search y forward firmado), manteniendo firma/cifrado en cliente, sin DB, y retirando por completo el flujo `nsec`.

**Architecture:** Se introduce un servidor Fastify modular con plugin encapsulation, validacion por JSON schema y relay gateway compartido con cache TTL en memoria, fallback conservador y dedupe de inflight. El frontend cambia a clientes HTTP/SSE sobre TanStack Query y elimina operaciones directas contra relays para lectura y realtime.

**Tech Stack:** Fastify, TypeScript, Vitest, TanStack Query v5, NDK/nostr-tools, SSE, pnpm.

---

Spec de referencia: `docs/superpowers/specs/2026-04-15-fastify-nostr-bff-design.md`

## Chunk 1: Base del servidor Fastify

### Task 1: Crear esqueleto BFF y scripts de ejecucion

**Skills:** `@nodejs-backend-patterns`, `@vitest`

**Files:**
- Modify: `package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/main.ts`
- Create: `server/src/app.ts`
- Create: `server/src/routes/health.route.ts`
- Test: `server/src/app.test.ts`

- [ ] **Step 1: Escribir test rojo de health route**

```ts
test('GET /v1/health responde 200', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'GET', url: '/v1/health' })
  expect(res.statusCode).toBe(200)
})
```

- [ ] **Step 2: Ejecutar test focal para confirmar RED**

Run: `pnpm vitest run server/src/app.test.ts`
Expected: FAIL por app/ruta inexistente.

- [ ] **Step 3: Implementar bootstrap Fastify minimo**

Crear `buildApp()` en `server/src/app.ts`, registrar prefijo `/v1` y ruta health.

- [ ] **Step 4: Ejecutar test focal para confirmar GREEN**

Run: `pnpm vitest run server/src/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json server/tsconfig.json server/src/main.ts server/src/app.ts server/src/routes/health.route.ts server/src/app.test.ts
git commit -m "feat(bff): scaffold fastify server foundation"
```

### Task 2: Configurar plugins base de plataforma

**Skills:** `@nodejs-backend-patterns`, `@security-auditor`

**Files:**
- Create: `server/src/plugins/cors.ts`
- Create: `server/src/plugins/rate-limit.ts`
- Create: `server/src/plugins/error-handler.ts`
- Create: `server/src/plugins/request-context.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/plugins/error-handler.test.ts`

- [ ] **Step 1: Escribir tests rojos para envelope de error**

```ts
expect(body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
```

- [ ] **Step 2: Ejecutar tests para confirmar RED**

Run: `pnpm vitest run server/src/plugins/error-handler.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar plugins y registro en app**

Registrar CORS estricto, rate-limit, request-id/log context y error handler uniforme.

- [ ] **Step 4: Re-ejecutar tests para confirmar GREEN**

Run: `pnpm vitest run server/src/plugins/error-handler.test.ts server/src/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/plugins/cors.ts server/src/plugins/rate-limit.ts server/src/plugins/error-handler.ts server/src/plugins/request-context.ts server/src/app.ts server/src/plugins/error-handler.test.ts
git commit -m "feat(bff): add platform plugins and unified error envelope"
```

### Task 2.1: Implementar auth binding para `ownerPubkey` (NIP-98/challenge)

**Skills:** `@nostr-specialist`, `@security-auditor`, `@schema-validator`

**Files:**
- Create: `server/src/plugins/owner-auth.ts`
- Create: `server/src/nostr/http-auth-verify.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/plugins/owner-auth.test.ts`

- [ ] **Step 1: Escribir tests rojos de autorizacion**

Casos:
- request sin prueba firmada -> `401`,
- request con firma valida pero pubkey distinto a `ownerPubkey` -> `403`,
- request valida -> `200`.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/plugins/owner-auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar plugin y verificador HTTP auth**

Validar nonce/ts/path/method y binding explicito al `ownerPubkey` de la ruta/query.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/plugins/owner-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/plugins/owner-auth.ts server/src/nostr/http-auth-verify.ts server/src/app.ts server/src/plugins/owner-auth.test.ts
git commit -m "feat(bff): enforce owner pubkey auth binding for sensitive routes"
```

## Chunk 2: Relay gateway compartido y cache stateless

### Task 3: Implementar resolver de relays y fallback conservador

**Skills:** `@nostr-specialist`, `@nodejs-backend-patterns`

**Files:**
- Create: `server/src/relay/relay-resolver.ts`
- Create: `server/src/relay/relay-fallback.ts`
- Test: `server/src/relay/relay-resolver.test.ts`

- [ ] **Step 1: Escribir tests rojos de resolucion y fallback**

Casos minimos:
- primary usa relays scoped de usuario cuando existen,
- fallback solo en vacio/fallo recuperable,
- no mezclar bootstrap incondicionalmente.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/relay/relay-resolver.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar resolver/fallback con normalizacion y dedupe**

Incluir helper de clave estable `relaySetKey`.

- [ ] **Step 4: Re-ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/relay/relay-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/relay/relay-resolver.ts server/src/relay/relay-fallback.ts server/src/relay/relay-resolver.test.ts
git commit -m "feat(bff): add scoped relay resolver with conservative fallback"
```

### Task 4: Implementar relay gateway con timeout, cache y dedupe inflight

**Skills:** `@nostr-specialist`, `@caching-strategist`

**Files:**
- Create: `server/src/cache/ttl-cache.ts`
- Create: `server/src/relay/relay-gateway.ts`
- Create: `server/src/relay/relay-gateway.types.ts`
- Test: `server/src/relay/relay-gateway.test.ts`

- [ ] **Step 1: Escribir tests rojos de cache/inflight dedupe**

Casos:
- misma query concurrente comparte promesa,
- TTL expira y vuelve a consultar,
- timeout clasifica error recuperable.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/relay/relay-gateway.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar gateway y cache en memoria**

Implementar limites de tamaño + TTL por dominio.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/relay/relay-gateway.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/cache/ttl-cache.ts server/src/relay/relay-gateway.ts server/src/relay/relay-gateway.types.ts server/src/relay/relay-gateway.test.ts
git commit -m "feat(bff): add relay gateway with timeout cache and inflight dedupe"
```

## Chunk 3: Endpoints social read

### Task 5: Exponer `feed/following` y `thread`

**Skills:** `@nostr-specialist`, `@schema-validator`

**Files:**
- Create: `server/src/modules/social/social.schemas.ts`
- Create: `server/src/modules/social/social.service.ts`
- Create: `server/src/modules/social/social.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/modules/social/social.routes.test.ts`

- [ ] **Step 1: Escribir tests rojos de contrato para feed/thread**

Verificar schema de query (`ownerPubkey`, `limit`, `until`) y shape de respuesta (`items`, `hasMore`, `nextUntil`).

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/modules/social/social.routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar servicio y rutas con relay gateway**

Mapear eventos a contrato equivalente al consumo actual del overlay.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/modules/social/social.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/social/social.schemas.ts server/src/modules/social/social.service.ts server/src/modules/social/social.routes.ts server/src/app.ts server/src/modules/social/social.routes.test.ts
git commit -m "feat(bff): implement social feed and thread endpoints"
```

### Task 6: Exponer `engagement` batch

**Skills:** `@nostr-specialist`, `@schema-validator`

**Files:**
- Modify: `server/src/modules/social/social.schemas.ts`
- Modify: `server/src/modules/social/social.service.ts`
- Modify: `server/src/modules/social/social.routes.ts`
- Test: `server/src/modules/social/social.routes.test.ts`

- [ ] **Step 1: Escribir test rojo para POST engagement**

```ts
expect(body).toHaveProperty('byEventId')
```

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/modules/social/social.routes.test.ts -t engagement`
Expected: FAIL.

- [ ] **Step 3: Implementar agregacion de metrics por `eventIds`**

Incluir replies/reposts/reactions/zaps/zapSats.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/modules/social/social.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/social/social.schemas.ts server/src/modules/social/social.service.ts server/src/modules/social/social.routes.ts server/src/modules/social/social.routes.test.ts
git commit -m "feat(bff): add social engagement endpoint"
```

## Chunk 4: Notifications read + stream

### Task 7: Implementar endpoint de notificaciones y SSE

**Skills:** `@nostr-specialist`, `@websocket-architect`

**Files:**
- Create: `server/src/modules/notifications/notifications.schemas.ts`
- Create: `server/src/modules/notifications/notifications.service.ts`
- Create: `server/src/modules/notifications/notifications.routes.ts`
- Test: `server/src/modules/notifications/notifications.routes.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Escribir tests rojos de GET y stream**

Casos:
- GET devuelve lista ordenada/dedupe,
- stream SSE emite eventos en formato estable,
- request sin owner-auth valida devuelve `401/403`.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/modules/notifications/notifications.routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar servicio + rutas GET/SSE**

Aplicar filtros por `#p` y kinds sociales.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/modules/notifications/notifications.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/notifications/notifications.schemas.ts server/src/modules/notifications/notifications.service.ts server/src/modules/notifications/notifications.routes.ts server/src/modules/notifications/notifications.routes.test.ts server/src/app.ts
git commit -m "feat(bff): implement notifications read and sse stream"
```

## Chunk 5: User search endpoint

### Task 8: Implementar busqueda de usuarios por relays

**Skills:** `@nostr-specialist`, `@schema-validator`

**Files:**
- Create: `server/src/modules/users/users.schemas.ts`
- Create: `server/src/modules/users/users.service.ts`
- Create: `server/src/modules/users/users.routes.ts`
- Test: `server/src/modules/users/users.routes.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Escribir tests rojos de query/response**

Validar `q`, `limit` y respuesta `{ pubkeys, profiles }`.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/modules/users/users.routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar servicio usando relay gateway + cache TTL**

Soportar busqueda textual y exact match (`npub`/hex).

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/modules/users/users.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/users/users.schemas.ts server/src/modules/users/users.service.ts server/src/modules/users/users.routes.ts server/src/modules/users/users.routes.test.ts server/src/app.ts
git commit -m "feat(bff): add user search endpoint"
```

## Chunk 6: DM read + stream (sin desencriptar en servidor)

### Task 9: Implementar endpoints DM de eventos raw

**Skills:** `@nostr-specialist`, `@schema-validator`

**Files:**
- Create: `server/src/modules/dm/dm.schemas.ts`
- Create: `server/src/modules/dm/dm.service.ts`
- Create: `server/src/modules/dm/dm.routes.ts`
- Test: `server/src/modules/dm/dm.routes.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Escribir tests rojos para inbox/conversation/stream**

Casos:
- inbox devuelve solo kinds DM permitidos,
- conversation filtra por owner/peer,
- stream SSE emite eventos raw,
- request sin owner-auth valida devuelve `401/403`.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/modules/dm/dm.routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar servicio y rutas DM**

Servidor no descifra `content`, solo enruta y filtra.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/modules/dm/dm.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/dm/dm.schemas.ts server/src/modules/dm/dm.service.ts server/src/modules/dm/dm.routes.ts server/src/modules/dm/dm.routes.test.ts server/src/app.ts
git commit -m "feat(bff): implement dm raw read endpoints and stream"
```

## Chunk 7: Publish forward firmado

### Task 10: Implementar `POST /publish/forward` con verificacion NIP-01

**Skills:** `@nostr-specialist`, `@security-auditor`

**Files:**
- Create: `server/src/nostr/event-verify.ts`
- Create: `server/src/modules/publish/publish.schemas.ts`
- Create: `server/src/modules/publish/publish.service.ts`
- Create: `server/src/modules/publish/publish.routes.ts`
- Test: `server/src/modules/publish/publish.routes.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Escribir tests rojos de validacion de firma**

Casos:
- evento valido -> 200 con ack por relay,
- evento invalido (`id`/`sig`) -> 400 deterministico,
- relay URL invalida/no permitida -> 400,
- relay interna/privada -> 400,
- exceso de relays por request -> 429/400 segun politica.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/modules/publish/publish.routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar verificador y forward service**

Publicar a relays objetivo y retornar `ackedRelays`, `failedRelays`, `timeoutRelays`.
Aplicar guardas anti-abuso: solo `wss://`, cap de relays, bloqueo de destinos internos, allowlist/policy por `relayScope`.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/modules/publish/publish.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/nostr/event-verify.ts server/src/modules/publish/publish.schemas.ts server/src/modules/publish/publish.service.ts server/src/modules/publish/publish.routes.ts server/src/modules/publish/publish.routes.test.ts server/src/app.ts
git commit -m "feat(bff): add signed publish forward endpoint"
```

## Chunk 8: Migracion frontend a API BFF

### Task 11: Crear clientes API para social/notifications/search/dm/forward

**Skills:** `@react-best-practices`, `@vitest`

**Files:**
- Create: `src/nostr-api/http-client.ts`
- Create: `src/nostr-api/social-feed-api-service.ts`
- Create: `src/nostr-api/social-notifications-api-service.ts`
- Create: `src/nostr-api/dm-api-service.ts`
- Create: `src/nostr-api/user-search-api-service.ts`
- Create: `src/nostr-api/publish-forward-api.ts`
- Test: `src/nostr-api/http-client.test.ts`

- [ ] **Step 1: Escribir test rojo de cliente HTTP y errores normalizados**

Run: `pnpm vitest run src/nostr-api/http-client.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar cliente base y servicios por dominio**

Incluir timeout, parse de envelope y mapping a contratos actuales de hooks.

- [ ] **Step 3: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run src/nostr-api/http-client.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/nostr-api/http-client.ts src/nostr-api/social-feed-api-service.ts src/nostr-api/social-notifications-api-service.ts src/nostr-api/dm-api-service.ts src/nostr-api/user-search-api-service.ts src/nostr-api/publish-forward-api.ts src/nostr-api/http-client.test.ts
git commit -m "feat(frontend): add bff api clients for nostr domains"
```

### Task 12: Rewire hooks/controladores para usar BFF

**Skills:** `@react-best-practices`, `@nostr-specialist`

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/query/following-feed.query.ts`
- Modify: `src/nostr-overlay/query/social-notifications.query.ts`
- Modify: `src/nostr-overlay/query/direct-messages.query.ts`
- Modify: `src/nostr-overlay/query/user-search.query.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Escribir tests rojos de integracion con servicios API**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "agora|notifications|chats|search"`
Expected: FAIL inicial.

- [ ] **Step 2: Implementar wiring de servicios BFF en overlay**

Mantener contratos de hooks para minimizar cambios de UI.

- [ ] **Step 3: Ejecutar tests focales y confirmar GREEN**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/query/following-feed.query.test.ts src/nostr-overlay/query/social-notifications.query.test.ts src/nostr-overlay/query/direct-messages.query.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/nostr-overlay/App.tsx src/nostr-overlay/hooks/useNostrOverlay.ts src/nostr-overlay/query/following-feed.query.ts src/nostr-overlay/query/social-notifications.query.ts src/nostr-overlay/query/direct-messages.query.ts src/nostr-overlay/query/user-search.query.ts src/nostr-overlay/App.test.tsx
git commit -m "refactor(frontend): route nostr reads through fastify bff"
```

## Chunk 9: Retirar `nsec` por seguridad

### Task 13: Eliminar `nsec` de auth core y credenciales

**Skills:** `@security-auditor`, `@nodejs-backend-patterns`

**Files:**
- Modify: `src/nostr/auth/session.ts`
- Modify: `src/nostr/auth/auth-service.ts`
- Modify: `src/nostr/auth/credentials.ts`
- Delete: `src/nostr/auth/providers/nsec-provider.ts`
- Modify: `src/nostr/auth/providers/types.ts`
- Test: `src/nostr/auth/session.test.ts`
- Test: `src/nostr/auth/auth-service.test.ts`
- Test: `src/nostr/auth/credentials.test.ts`

- [ ] **Step 1: Escribir tests rojos para ausencia de `nsec`**

Casos:
- `LoginMethod` ya no acepta `nsec`,
- `auth-service` no permite start/switch `nsec`,
- parser rechaza `nsec1...` para login.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run src/nostr/auth/session.test.ts src/nostr/auth/auth-service.test.ts src/nostr/auth/credentials.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar remocion de `nsec` y limpiar storage asociado**

Eliminar ramas de lock/unlock dependientes de `nsec`.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run src/nostr/auth/session.test.ts src/nostr/auth/auth-service.test.ts src/nostr/auth/credentials.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr/auth/session.ts src/nostr/auth/auth-service.ts src/nostr/auth/credentials.ts src/nostr/auth/providers/types.ts src/nostr/auth/session.test.ts src/nostr/auth/auth-service.test.ts src/nostr/auth/credentials.test.ts
git rm src/nostr/auth/providers/nsec-provider.ts
git commit -m "security(auth): remove nsec login flow"
```

### Task 14: Eliminar `nsec` de UI y mensajes de producto

**Skills:** `@react-best-practices`, `@ui-ux-designer`

**Files:**
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.test.tsx`

- [ ] **Step 1: Escribir tests rojos para selector sin opcion `nsec`**

Run: `pnpm vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implementar cambios de UI/copy**

Mantener solo `npub`, `nip07`, `nip46` y mensajes actualizados de capacidad de escritura.

- [ ] **Step 3: Ejecutar tests de UI y confirmar GREEN**

Run: `pnpm vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/components/ProfileTab.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/nostr-overlay/components/LoginMethodSelector.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/components/ProfileTab.test.tsx
git commit -m "refactor(ui): remove nsec option and update auth messaging"
```

## Chunk 10: Hardening y verificacion final

### Task 15: Endurecimiento operativo del BFF

**Skills:** `@security-auditor`, `@monitoring-architect`

**Files:**
- Modify: `server/src/plugins/error-handler.ts`
- Modify: `server/src/plugins/request-context.ts`
- Create: `server/src/plugins/security-headers.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/plugins/request-context.test.ts`

- [ ] **Step 1: Escribir tests rojos de redaccion/logging**

Asegurar que payload sensible no se loguea.

- [ ] **Step 2: Ejecutar tests y confirmar RED**

Run: `pnpm vitest run server/src/plugins/request-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar redaction y headers de seguridad**

Aplicar whitelist de campos logueables y headers baseline.

- [ ] **Step 4: Ejecutar tests y confirmar GREEN**

Run: `pnpm vitest run server/src/plugins/request-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/plugins/error-handler.ts server/src/plugins/request-context.ts server/src/plugins/security-headers.ts server/src/app.ts server/src/plugins/request-context.test.ts
git commit -m "chore(bff): harden logging and security headers"
```

### Task 16: Verificacion integral y checklist de salida

**Skills:** `@verification-before-completion`, `@vitest`

**Files:**
- Verify: `server/src/**`
- Verify: `src/nostr-api/**`
- Verify: `src/nostr-overlay/**`

- [ ] **Step 1: Ejecutar suite backend**

Run: `pnpm vitest run server/src/**/*.test.ts`
Expected: PASS.

- [ ] **Step 2: Ejecutar suite frontend relacionada**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/query/*.test.ts`
Expected: PASS.

- [ ] **Step 3: Ejecutar typecheck global**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Smoke manual funcional**

Checklist:
- Agora carga feed/thread/engagement via BFF.
- Notifications y DM stream llegan via SSE.
- User search responde sin tocar relays en browser.
- Publish forward funciona con evento firmado.
- No existe ruta de login `nsec`.

- [ ] **Step 5: Commit final de cierre**

```bash
git add .
git commit -m "feat: migrate nostr relay networking to fastify bff and remove nsec flow"
```
