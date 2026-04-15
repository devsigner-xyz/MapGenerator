# Diseno: Fastify BFF Nostr relay-mediation sin custodia de claves

Fecha: 2026-04-15
Estado: validado en conversacion, listo para planificacion e implementacion

## 1) Objetivo

Mover la logica de relay networking desde frontend hacia un BFF Fastify, manteniendo el cliente como unico dueño de firma y cifrado.

Alcance confirmado:

- Lectura social: `feed/following`, `thread`, `engagement`.
- Mensajeria (lectura + realtime): ingest de eventos DM y stream hacia cliente.
- Notificaciones (lectura + realtime): mentions/replies/reactions/zaps.
- Busqueda de usuarios.
- Publicacion via `forward` de eventos ya firmados.
- Retirar flujo `nsec` por seguridad (frontend solo `npub`, `nip07`, `nip46`).

Restricciones no negociables:

- Sin base de datos.
- Sin custodiar claves privadas.
- Privacidad primero, sin degradar performance ni UX.

## 2) Contexto actual del repo

Hoy el frontend concentra transporte y estrategia de relays en runtime:

- Social feed runtime: `src/nostr/social-feed-runtime-service.ts`.
- Notificaciones runtime: `src/nostr/social-notifications-runtime-service.ts`.
- DM runtime: `src/nostr/dm-runtime-service.ts` + parse/crypto en `src/nostr/dm-service.ts`.
- User search por relays: `src/nostr/user-search.ts`.
- Wiring principal en UI: `src/nostr-overlay/App.tsx` y `src/nostr-overlay/hooks/useNostrOverlay.ts`.

Consecuencia: el browser abre/conmuta sockets y maneja fallback/policy de relays directamente, generando ruido de consola y mayor complejidad operacional en cliente.

## 3) Alternativas evaluadas

### A) Fastify BFF dedicado (recomendada)

Pros:

- Menor overhead para API stateless de alto throughput.
- Encapsulation por plugins y validacion de schemas de entrada/salida.
- Muy buena compatibilidad con `inject()` para tests de contrato.

Contras:

- Menos opinionado que NestJS; exige disciplina en boundaries y estructura.

### B) NestJS con Fastify adapter

Pros:

- Muy buena modularidad para equipos grandes.
- DI fuerte y convenciones enterprise.

Contras:

- Mayor boilerplate para este alcance.
- Costo de arranque mas alto para una capa BFF stateless.

### C) Hono/Edge-first

Pros:

- Excelente latencia global y runtime liviano.

Contras:

- Mayor friccion para integrar ciertos patrones de relay/WebSocket existentes.
- Riesgo de complejidad extra de plataforma en una migracion ya amplia.

Decision: **A) Fastify BFF dedicado**.

## 4) Decision de arquitectura

### 4.1 Principio de seguridad

- El servidor **nunca** recibe ni guarda `nsec` o clave privada.
- El cliente firma y cifra localmente (`nip07`/`nip46`) y solo envia eventos firmados para `forward`.
- Se elimina el soporte de login `nsec` en UI y en auth-service.

### 4.2 Principio de privacidad

- Sin persistencia de datos de usuario en backend.
- Caches en memoria con TTL corto y tamano acotado.
- Logs redactados: sin payload de `content` DM, sin secretos, sin credentials.

### 4.3 Principio de performance

- Relay gateway compartido con dedupe de peticiones concurrentes.
- Timeouts por relay y por handler.
- Fallback conservador por set de relays (primary -> fallback).
- SSE para realtime (notificaciones y DM) para reducir polling agresivo.

## 5) Estructura propuesta

Nuevo arbol de servidor (en el mismo repo):

```text
server/
  src/
    main.ts
    app.ts
    plugins/
      cors.ts
      rate-limit.ts
      error-handler.ts
      request-context.ts
    relay/
      relay-resolver.ts
      relay-gateway.ts
      relay-fallback.ts
      relay-cache.ts
    modules/
      social/
      notifications/
      dm/
      users/
      publish/
    nostr/
      event-verify.ts
      filters.ts
      nip-helpers.ts
    schemas/
      common.ts
```

Integracion frontend:

```text
src/nostr-api/
  http-client.ts
  social-feed-api-service.ts
  social-notifications-api-service.ts
  dm-api-service.ts
  user-search-api-service.ts
  publish-forward-api.ts
```

## 6) Contrato API inicial

Base path: `/v1`.

### 6.1 Social read

- `GET /v1/social/feed/following?ownerPubkey=<hex>&limit=20&until=<sec>&hashtag=<tag>`
- `GET /v1/social/thread/:rootEventId?limit=25&until=<sec>`
- `POST /v1/social/engagement`

Body `engagement`:

```json
{
  "eventIds": ["<id>", "<id>"],
  "until": 0
}
```

### 6.2 Notifications

- `GET /v1/notifications?ownerPubkey=<hex>&limit=120&since=<sec>`
- `GET /v1/notifications/stream?ownerPubkey=<hex>` (SSE)

### 6.3 DM (sin descifrado en servidor)

- `GET /v1/dm/events/inbox?ownerPubkey=<hex>&limit=200&since=<sec>`
- `GET /v1/dm/events/conversation?ownerPubkey=<hex>&peerPubkey=<hex>&limit=200&since=<sec>`
- `GET /v1/dm/stream?ownerPubkey=<hex>` (SSE de eventos raw)

### 6.4 User search

- `GET /v1/users/search?q=<query>&limit=20&ownerPubkey=<hex>`

### 6.5 Forward firmado

- `POST /v1/publish/forward`

Body:

```json
{
  "event": {
    "id": "...",
    "pubkey": "...",
    "kind": 1,
    "created_at": 0,
    "tags": [],
    "content": "...",
    "sig": "..."
  },
  "relayScope": "social",
  "relays": ["wss://..."]
}
```

Regla: el BFF verifica firma/evento y solo reenvia.

### 6.6 Binding de identidad para endpoints con `ownerPubkey`

Regla obligatoria para privacidad:

- Todo endpoint que acepte `ownerPubkey` sensible (`/v1/notifications*`, `/v1/dm*`, y rutas equivalentes de datos personales) requiere prueba criptografica de control del pubkey.
- Mecanismo recomendado: autenticacion HTTP firmada tipo `NIP-98` con challenge corto (`nonce + ts + path + method`) y ventana de validez corta.
- Si el caller no prueba control del `ownerPubkey`, responder `401/403` y no devolver datos.

## 7) Flujo de datos

### 7.1 Lectura

1. Frontend pide endpoint BFF con `ownerPubkey` y cursor.
2. BFF resuelve relay set (NIP-65 + hints + fallback conservador).
3. BFF ejecuta fanout con timeout/retry acotado.
4. BFF dedupe/sort de eventos y responde formato estable para TanStack Query.

### 7.2 Realtime

1. Frontend abre SSE a `/v1/notifications/stream` o `/v1/dm/stream`.
2. BFF mantiene subscription relay y emite eventos incrementales.
3. Frontend aplica normalizacion y cache updates.

### 7.3 Publish forward

1. Cliente firma/cifra localmente.
2. Cliente envia evento firmado al BFF.
3. BFF valida `id`/`sig`/shape (NIP-01).
4. BFF valida politicas anti-abuso de relays destino.
5. BFF publica a relays objetivo y devuelve ack/fail/timeout por relay.

## 8) Seguridad y cumplimiento de NIPs

NIPs obligatorios para este diseno:

- `NIP-01`: shape canonico, hash, firma.
- `NIP-10`, `NIP-18`, `NIP-25`: thread/repost/reaction.
- `NIP-11`, `NIP-65`: capacidad y routing de relays.
- `NIP-50`: busqueda cuando relay la soporta.
- `NIP-98`: autenticacion HTTP firmada para binding de `ownerPubkey`.
- `NIP-07`, `NIP-46`: firma en cliente.
- `NIP-17`, `NIP-44`, `NIP-59`: DM moderno.

Compatibilidad explicitamente permitida:

- Lectura legacy `kind 4` (NIP-04) solo como fallback de interoperabilidad, no como flujo recomendado de escritura.

Reglas operativas DM:

- Lectura DM prioriza `kind 1059` (gift wrap, flujo moderno).
- `kind 4` solo se usa como fallback de lectura legacy.
- El servidor no descifra ni desempaqueta payload cifrado; el boundary de unwrap/decrypt queda en cliente.

### 8.1 Politicas anti-abuso para `publish/forward`

- Aceptar solo URLs `wss://` validadas y normalizadas.
- Limitar cantidad de relays por request (cap fijo).
- Aplicar allowlist o resolver por `relayScope` antes de aceptar `relays` custom.
- Bloquear destinos privados/internos para evitar abuso tipo SSRF.
- Rate-limit mas estricto por ruta de forward que por rutas de lectura.

## 9) Eliminacion de `nsec`

Cambios de producto y seguridad:

- Quitar opcion `nsec` del selector de login.
- Quitar proveedor `nsec` del auth-service.
- Eliminar persistencia `ncryptsec` y flujos lock/unlock asociados a `nsec`.
- Actualizar copy UI para escribir solo con extension/bunker.

Resultado esperado:

- No existe camino de entrada para claves privadas en la app.

## 10) Estrategia de cache y resiliencia (sin DB)

### 10.1 Caches en memoria

- TTL 10-30s para consultas de lectura social/notificaciones/search.
- TTL mas corto para engagement (5-10s).
- LRU cap por endpoint para evitar crecimiento no acotado.

### 10.2 Dedupe de inflight

- Si llegan 2 requests iguales al mismo tiempo, se comparte la misma promesa.

### 10.3 Timeouts

- `handlerTimeout` Fastify global + override por ruta.
- Timeout por fanout a relay.
- Timeout por operacion de publicacion forward.

### 10.4 Fallback

- Solo entrar a fallback si el set primary falla por error recuperable.
- No mezclar bootstrap indiscriminadamente cuando hay relays de usuario validos.

## 11) UX esperada con TanStack Query

- `useInfiniteQuery` para feed/thread.
- `useQuery` batch para engagement.
- SSE + invalidaciones puntuales para notifications/DM.
- Errores normalizados para `retry` inteligente (network/timeout/recoverable).

## 12) Testing y verificacion

### 12.1 Backend

- Unit: resolver/fallback/cache/event-verify.
- Contract: schemas y payloads por endpoint.
- Integration: `fastify.inject` sobre rutas principales y forward.

### 12.2 Frontend

- Hooks de query migrados a API BFF.
- Pruebas de UX: carga inicial, paginacion, realtime, manejo de error.
- Pruebas auth: ausencia total de `nsec`.

## 13) Plan de rollout

1. Crear BFF y contratos.
2. Migrar social read.
3. Migrar notifications y search.
4. Migrar DM read/stream.
5. Activar publish forward.
6. Retirar `nsec` y limpiar codigo muerto.
7. Validacion integral y feature flag de corte.

## 14) Fuera de alcance

- Persistencia en base de datos.
- Moderacion compleja o analytics persistente.
- Custodia de claves o servicio de firmado remoto propio.

## 15) Criterios de aceptacion

- Frontend no abre sockets a relays para social/notifications/search/DM read.
- BFF cubre endpoints de lectura y realtime definidos.
- Publish usa solo forward firmado.
- `nsec` removido completamente de UI y auth flows.
- Sin DB y sin almacenamiento de secretos.
- Tests de contrato e integracion en verde.
