# Diseno: relay query planner para followers y lecturas sociales BFF

Fecha: 2026-04-23
Estado: validado en conversacion, con plan asociado listo para implementacion

## 1) Objetivo

Corregir la carga de `followers` y alinear `profile-stats` y lecturas sociales relacionadas para que no dependan solo de bootstrap relays, usando una estrategia de resolucion de relays por tipo de lectura en el BFF.

La meta funcional es triple:

- hacer que la lista de seguidores deje de quedarse vacia cuando el owner depende de relays fuera del set bootstrap
- asegurar que `profile-stats.followersCount` y `graph/followers` usen el mismo universo de descubrimiento
- mejorar tambien las lecturas de perfil relacionadas, especialmente `posts`, para que sigan el mismo patron y no vuelvan a divergir

Se incluye `posts` en esta fase por una razon arquitectonica, no por oportunismo: hoy comparte la misma debilidad de routing que `followers` y `profile-stats`, y dejarlo fuera mantendria dos politicas distintas de relay selection dentro del mismo modulo `content`.

Restricciones acordadas:

- el cambio debe ser `backend-first`, pero sin ignorar la informacion de relays que el cliente ya conoce
- no se implementa una indexacion propietaria tipo Primal en esta fase
- no se introducen WebSockets ni SSE para resolver este problema
- la solucion debe seguir siendo tolerante a fallos parciales de relay
- la implementacion debe mantenerse pequena y compuesta por piezas con responsabilidad clara

## 2) Problema actual

La regresion aparece al mover followers a la ruta nueva `backend-first`.

Hoy el cliente si conoce relays contextuales del owner y del grafo cargado, pero el BFF de `graph` y `content` termina consultando followers y profile stats sobre un set demasiado pobre.

Resumen del problema:

- el cliente dispone de `relayHints`, settings NIP-65 y sugerencias por tipo
- el BFF recibe `ownerPubkey`, pero `graph.service.ts` y `content.service.ts` acaban usando `resolveRelaySets(...)` con `scopedRelays: []` y `userRelays: []`
- en la practica, eso reduce `followers` y `profile-stats` a bootstrap relays mas fallback conservador
- `following` y otras lecturas pueden seguir funcionando porque dependen de la propia contact list del usuario, que es mas facil de encontrar que la inversion de la relacion

Consecuencia:

- followers puede quedar vacio aunque existan seguidores reales en relays del owner o de los autores candidatos
- `profile-stats.followersCount` puede no representar el mismo universo que la pantalla de followers
- `posts` queda con la misma debilidad conceptual, aunque el bug visible haya explotado primero en followers

## 3) Contexto actual del repo

Puntos relevantes del cliente:

- `src/nostr-overlay/hooks/useNostrOverlay.ts`
- `src/nostr/relay-runtime.ts`
- `src/nostr/relay-settings.ts`
- `src/nostr-api/graph-api-service.ts`

Puntos relevantes del BFF:

- `server/src/modules/graph/graph.routes.ts`
- `server/src/modules/graph/graph.service.ts`
- `server/src/modules/content/content.routes.ts`
- `server/src/modules/content/content.service.ts`
- `server/src/relay/relay-resolver.ts`
- `server/src/relay/relay-gateway.ts`
- `server/src/cache/ttl-cache.ts`

Caracteristicas del sistema actual que conviene preservar:

- el cliente ya tiene una resolucion conservadora de relays reutilizable
- el BFF ya dispone de `resolveRelaySets`, `shouldUseFallbackRelays` y relay gateways con cache TTL
- `graph` y `content` ya trabajan como modulos separados, pero hoy duplican logica de follower discovery

## 4) Lo que hacen otros clientes y por que importa

La comparativa con clientes en `./context/clients` deja tres patrones claros:

### 4.1 Ditto

Patron:

- intenta primero relays configurados
- despues relay hints
- como ultimo recurso, consulta NIP-65 del autor y usa sus write relays

Leccion para este diseno:

- no basta con un set fijo de bootstrap
- los hints del cliente son utiles, pero no deben ser la unica fuente
- la lectura ideal usa una escalera de descubrimiento, no un unico pool global

### 4.2 Snort y noStrudel

Patron:

- usan outbox model y seleccion por autor o por tipo de lectura
- no tratan todas las lecturas sociales como el mismo problema de routing

Leccion para este diseno:

- un `resolver` plano de relays es insuficiente
- conviene un `planner` por tipo de lectura

### 4.3 Primal

Patron:

- resuelve followers y relay info a traves de backend/index/cache propietario

Leccion para este diseno:

- esa via da mas completitud y UX, pero cambia mucho el producto y nos saca del enfoque relay-based interoperable

Decision derivada:

- en esta fase no se adopta una arquitectura indexada tipo Primal
- se adopta un enfoque hibrido mas cercano a Ditto + outbox planning

## 5) Alternativas evaluadas

### A) Pasar solo `relayHints` desde cliente al BFF

Pros:

- cambio pequeno
- corrige parte del problema

Contras:

- `relayHints` es informacion incompleta frente a lo que el cliente ya conoce
- no arregla la deriva entre `graph` y `content`
- no crea una abstraccion reutilizable en el BFF

### B) Resolver todo server-side sin ayuda del cliente

Pros:

- mas puro desde el punto de vista backend-first

Contras:

- sufre cold start
- obliga a re-descubrir metadata que el cliente ya tiene
- añade roundtrips innecesarios en el peor momento, justo cuando faltan datos

### C) Hibrido con semillas del cliente y gobierno del BFF

Pros:

- combina correccion inmediata y arquitectura limpia
- aprovecha el conocimiento del cliente sin cederle la decision final
- habilita memoria ligera y politicas compartidas en el servidor

Contras:

- requiere una pequena pieza nueva de planificacion en el BFF

### D) Backend indexado de followers y relay intelligence

Pros:

- mayor completitud
- menor dependencia de relays online en tiempo real

Contras:

- mucho mas trabajo
- introduce una arquitectura distinta
- fuera de alcance de esta correccion

Decision: **C) enfoque hibrido con `RelayQueryPlanner` en el BFF y `scopedReadRelays` como semilla opcional del cliente**.

## 6) Decision principal

Se introducira una estrategia por capas:

1. el cliente construye `scopedReadRelays`
2. el BFF recibe ese set como pista opcional
3. el BFF usa un `RelayQueryPlanner` por tipo de lectura
4. el BFF complementa followers y stats con outboxes de `candidateAuthors`
5. `graph` y `content` comparten una unica pieza de follower discovery

La idea clave es esta:

- el cliente ya sabe cosas utiles
- el servidor debe ser quien decida como usar esas pistas
- la decision no es identica para `posts`, `followers` y `profile-stats`

Por eso no se introduce un `RelayScopeResolver` generico y plano, sino un `RelayQueryPlanner` con estrategias explicitas.

## 7) Alcance

En alcance:

- extender el contrato cliente -> BFF con `scopedReadRelays`
- calcular `scopedReadRelays` en el cliente a partir de settings y hints ya existentes
- crear un `AuthorRelayDirectory` con TTL corto en el BFF
- crear un `RelayQueryPlanner` por tipo de lectura
- extraer follower discovery compartido entre `graph` y `content`
- aplicar el planner a:
  - `graph/followers`
  - `content/profile-stats`
  - `content/posts`

Fuera de alcance en esta fase:

- base de datos o index global de followers
- streaming realtime para followers
- health ranking sofisticado de relays por historico global
- reescribir `users.search` para usar el mismo planner
- sincronizar esta inteligencia de relays entre dispositivos

## 8) Contrato nuevo cliente -> BFF

Se introduce `scopedReadRelays?: string[]` como pista opcional en lecturas sociales relevantes.

### 8.1 Endpoints afectados

- `POST /v1/graph/followers`
- `GET /v1/graph/followers`
- `POST /v1/content/profile-stats`
- `GET /v1/content/profile-stats`
- `GET /v1/content/posts`

### 8.2 Semantica de `scopedReadRelays`

No significa:

- verdad absoluta de routing
- lista final obligatoria que el servidor deba usar sin criterio

Si significa:

- mejor set de lectura que el cliente conoce para esta consulta concreta
- semilla contextual para planificacion en el BFF

### 8.3 Normalizacion y bounds

Reglas:

- trim de valores
- dedupe
- descarte de vacios
- validacion de URL `ws://` o `wss://` en servidor
- cap pequeno y estable, por ejemplo `12`

### 8.4 Propiedad de `candidateAuthors`

`candidateAuthors` sigue siendo una pista opcional del caller, no una verdad del servidor.

Decision explicita:

- el cliente es responsable de derivar `candidateAuthors` cuando ya tiene contexto de grafo cargado o perfiles relacionados
- el BFF es responsable de normalizarlo, acotarlo y usarlo solo como enrichment
- si `candidateAuthors` falta o es de baja calidad, la ruta sigue funcionando con el owner scope principal

Esto evita que el planner dependa de una señal perfecta y deja claro que la mejora de completitud es incremental, no binaria.

## 9) Arquitectura propuesta

### 9.1 Cliente: `scopedReadRelays`

El cliente ya cuenta con piezas suficientes para construir un set de lectura mejor que `relayHints` solos.

Fuentes para `scopedReadRelays`:

- `nip65Both`
- `nip65Read`
- `relayHints`
- `suggestedRelaysByType.nip65Both`
- `suggestedRelaysByType.nip65Read`

La construccion debe apoyarse en la resolucion conservadora ya existente en `src/nostr/relay-runtime.ts`, sin crear una segunda utilidad si no hace falta.

Decision explicita:

- el cliente enviara solo el `primary` canonico, no el fallback bootstrap
- el fallback sigue siendo responsabilidad del BFF

### 9.2 BFF: `AuthorRelayDirectory`

Se crea una pieza pequena responsable de resolver relays de un autor concreto.

Superficie conceptual:

```ts
interface AuthorRelayDirectory {
  getAuthorReadRelays(pubkey: string): Promise<string[]>;
  getAuthorWriteRelays(pubkey: string): Promise<string[]>;
}
```

Reglas:

- preferir `kind 10002`
- usar `kind 3` solo como fallback de compatibilidad
- cache TTL corto por pubkey
- dedupe y normalizacion de relays
- cap por autor para evitar fan-out explosivo

Fuente de datos:

- `SimplePool` y relay queries sobre un scope bootstrap conservador

No se introduce base de datos ni persistencia duradera.

Limitacion explicita:

- si la metadata `10002` o `kind 3` de un autor tampoco es visible desde ese scope bootstrap conservador, el enriquecimiento por autor puede no activarse
- eso no invalida el diseno: significa que `AuthorRelayDirectory` mejora la cobertura, pero no convierte la solucion en exhaustiva sin indexacion adicional

### 9.3 BFF: `RelayQueryPlanner`

Se crea una pieza dedicada a decidir como consultar segun el tipo de lectura.

Superficie conceptual:

```ts
interface RelayQueryPlanner {
  planPosts(input: {
    scopedReadRelays?: string[];
    targetPubkey: string;
  }): Promise<{ primary: string[]; fallback: string[] }>;

  planFollowers(input: {
    scopedReadRelays?: string[];
    targetPubkey: string;
    candidateAuthors: string[];
  }): Promise<{
    ownerScope: { primary: string[]; fallback: string[] };
    candidateAuthorScopes: Array<{ authors: string[]; relays: string[] }>;
  }>;
}
```

Responsabilidad:

- decidir relays y agrupaciones de consulta
- producir resultados canonicos para cache key estable

No responsabilidad:

- parsear followers
- decidir `complete`
- hablar con gateways directamente

### 9.4 BFF: `follower-discovery`

Hoy `graph.service.ts` y `content.service.ts` duplican parsing y descubrimiento de followers.

Se extraera una utilidad compartida con estas responsabilidades:

- `parseCandidateAuthors`
- `parseFollowsFromKind3`
- `collectFollowersFromEvents`
- escaneo `#p`
- escaneo por `candidateAuthors`

La seleccion de relays no vive aqui. Esa entrada llega ya planificada.

Decision explicita sobre ownership:

- `follower-discovery` no calcula `complete`
- `follower-discovery` no decide fallback
- cada servicio (`graph` y `content`) conserva la responsabilidad de traducir errores parciales y truncaciones a su propio contrato de salida

### 9.5 Integracion en servicios

`createGraphService()` y `createContentService()` compondran internamente:

- `AuthorRelayDirectory`
- `RelayQueryPlanner`
- fetchers creados con esas dependencias

Decision explicita:

- la composicion vive dentro de cada modulo de servicio, no en `app.ts`
- asi se evita aumentar el acoplamiento global del bootstrap Fastify

## 10) Estrategias por tipo de lectura

### 10.1 `posts`

Objetivo:

- leer posts del target sobre su scope de lectura contextual

Estrategia:

1. usar `scopedReadRelays` como primary si existen
2. usar bootstrap como fallback
3. canonizar el set para cache keys estables

### 10.2 `followers`

Objetivo:

- descubrir autores cuya contact list incluye al target

Estrategia:

1. hacer `#p` scan sobre `ownerScope`
2. si hay `candidateAuthors`, agruparlos por outboxes conocidos
3. consultar `kind 3` de esos autores en sus write relays preferidos
4. deduplicar followers y conservar `complete` segun truncaciones y errores

### 10.3 `profile-stats`

Objetivo:

- producir `followsCount` y `followersCount` coherentes con la pantalla de followers

Estrategia:

- `followsCount` sigue leyendo la contact list del target
- `followersCount` reutiliza exactamente la misma follower discovery que `graph/followers`

Decision explicita:

- `profile-stats` no mantiene un algoritmo propio de followers

## 11) Cache y canonicidad

La solucion toca caches de gateway y service-level keys.

Reglas:

- relay sets equivalentes deben producir la misma cache key
- el orden de entrada no debe fragmentar caché
- duplicados no deben fragmentar caché

En la practica:

- usar un helper canonico tipo `relaySetKey(...)`
- normalizar antes de serializar la key

Esto aplica a:

- `graph.getFollowers()`
- `content.getProfileStats()`
- `content.getPosts()`

## 12) Errores y tolerancia operativa

El sistema no debe pasar de “vacio” a “roto” por un relay malo.

Reglas operativas:

- si falla la parte enriquecida de `candidateAuthors`, el resultado sigue siendo util con `complete: false`
- si el owner scope no encuentra nada y el planner tiene fallback, se usa fallback conservador
- el overlay mantiene su comportamiento tolerante sin introducir nueva UX de error en esta fase

No se busca completitud perfecta. Se busca una mejora grande de cobertura con degradacion controlada.

## 13) Seguridad y limites

Este cambio no toca autenticacion ni firma, pero si aumenta la superficie de input de relays.

Reglas:

- el servidor valida y acota `scopedReadRelays`
- nunca se usan URLs crudas del cliente sin normalizacion
- el planner limita fan-out total y por autor
- `candidateAuthors` sigue normalizado y acotado

Esto reduce riesgo de abuso y de requests descontroladas.

## 14) Testing esperado

La implementacion debe cubrir al menos estas capas:

### 14.1 Cliente

- `graph-api-service` envia `scopedReadRelays`
- `relay-runtime` produce `primary` canonico con hints y NIP-65
- `useNostrOverlay` pasa `scopedReadRelays` a followers, stats y posts

### 14.2 Rutas BFF

- aceptan `scopedReadRelays`
- reenvian `scopedReadRelays` intacto al servicio

### 14.3 Primitivas BFF

- `AuthorRelayDirectory`
- `RelayQueryPlanner`
- `follower-discovery`

### 14.4 Servicios BFF

- `graph.service`
- `content.service`
- cache keys estables para relay sets equivalentes

## 15) Rollout y orden recomendado

Orden de implementacion recomendado:

1. contrato `scopedReadRelays`
2. calculo cliente de `scopedReadRelays`
3. `AuthorRelayDirectory`
4. `RelayQueryPlanner`
5. `follower-discovery`
6. integracion en `graph`
7. integracion en `content`
8. verificacion completa

El motivo de este orden es reducir riesgo:

- primero se fija el contrato observable
- despues se construyen primitivas pequenas y testeables
- por ultimo se cambia la integracion en servicios grandes

## 16) Que ganamos con este diseno

### 16.1 Correccion funcional

- followers deja de depender solo de bootstrap relays
- stats y followers se alinean
- posts del perfil dejan de sufrir la misma debilidad estructural

### 16.2 Mejor arquitectura

- el cliente aporta contexto, pero el BFF gobierna la decision final
- `graph` y `content` dejan de divergir en follower discovery
- se evita un resolver plano y se pasa a estrategias por caso de uso

### 16.3 Mejor eficiencia

- menos consultas ciegas a bootstrap
- mejor aprovechamiento de outboxes de autores candidatos
- cache keys estables para no fragmentar la cache por orden de arrays

### 16.4 Mejor camino evolutivo

- deja lista una base para ampliar relay intelligence en el BFF
- permite introducir memoria ligera por autor sin rehacer la API
- mantiene abierta una futura evolucion hacia indexacion si hiciera falta

## 17) Lo que no resuelve del todo

Hay limites inherentes al modelo relay-based:

- followers nunca sera perfectamente exhaustivo en todos los relays del ecosistema sin indexacion adicional
- `candidateAuthors` mejora mucho la cobertura, pero sigue siendo una heuristica
- NIP-65 y kind `3` pueden estar incompletos o desactualizados segun el usuario

Ese trade-off es aceptable en esta fase porque mejora mucho la situacion sin cambiar la arquitectura del producto.

## 18) Estado final esperado

Cuando este diseno este implementado, el sistema deberia cumplir estas propiedades:

- `graph/followers` usa relays contextuales y outboxes por autor cuando aplica
- `content/profile-stats` comparte el mismo universo de followers
- `content/posts` deja de depender de bootstrap como unica fuente real
- caches y keys son estables para relay sets equivalentes
- el overlay no cambia de UX, pero muestra datos mas correctos con la misma tolerancia a fallos

Spec asociado al plan:

- `docs/superpowers/plans/2026-04-23-relay-query-planner-followers.md`
