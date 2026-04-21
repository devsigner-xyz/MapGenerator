# Diseño: relays de búsqueda separados + búsqueda de usuarios vía BFF

Fecha: 2026-04-21
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Separar claramente los `Relays de búsqueda` de los relays generales dentro de la misma página `/relays`, y usar esa categoría dedicada para la búsqueda remota de usuarios y menciones a través del BFF.

La meta funcional es doble:

- evitar que la búsqueda por nombre dependa de enviar filtros `search` a relays generales que no soportan NIP-50
- unificar la infraestructura de búsqueda para dos superficies del producto:
  - autocomplete de menciones `@`
  - buscador global de usuarios

Requisitos acordados:

- La pantalla `/relays` se mantiene como una sola página.
- Dentro de `/relays` deben existir secciones claramente separadas para:
  - `Relays configurados`
  - `Relays de búsqueda`
- Los `Relays de búsqueda` iniciales serán:
  - `wss://search.nos.today`
  - `wss://relay.noswhere.com`
  - `wss://filter.nostr.wine`
- El autocomplete de menciones y la búsqueda global de usuarios deben reutilizar la misma capa de búsqueda.
- La UX de búsqueda debe ser `local-first`.
- La búsqueda remota debe pasar por el BFF, no por consultas NIP-50 directas desde el cliente a relays generales.
- TanStack Query debe aprovecharse explícitamente para cachear y estabilizar la UX de búsqueda.

## 2) Decisión principal

Se introducirá una categoría persistente de `Relays de búsqueda` en `relay-settings`, separada de las categorías ya existentes (`nip65Both`, `nip65Read`, `nip65Write`, `dmInbox`).

Esta nueva categoría tendrá tres propiedades deliberadas:

1. vive en la misma pantalla `/relays`
2. se persiste junto con el resto de settings locales de relays
3. no forma parte del conjunto `relays` general usado para lectura/publicación normal

En otras palabras: se comparte la pantalla de configuración, pero no se comparte la semántica operativa.

También se descarta, para esta fase, intentar descubrir dinámicamente relays NIP-50 desde el pool general del usuario como fuente principal. Esa estrategia se considera complementaria, no base. La base será una lista dedicada de search relays configurables y enviada al BFF.

## 3) Alcance

En alcance:

- ampliar el modelo local de relay settings con una categoría `search`
- mostrar y editar `Relays de búsqueda` dentro de `/relays`
- seedear la categoría `search` con una lista curada inicial
- enrutar la búsqueda remota de usuarios del cliente al BFF usando esa lista
- reutilizar la misma infraestructura de búsqueda para:
  - menciones `@`
  - buscador global de usuarios
- aplicar estrategia `local-first`
- usar TanStack Query para cachear, estabilizar resultados y reutilizar respuestas entre superficies

Fuera de alcance en esta fase:

- publicar una `Search Relay List` en Nostr
- sincronizar `Relays de búsqueda` entre dispositivos vía eventos Nostr
- descubrimiento automático persistente de soporte NIP-50 por relay
- crear una pantalla nueva o un item nuevo de sidebar para búsqueda
- mezclar por defecto relays generales del usuario en la búsqueda NIP-50

## 4) Arquitectura propuesta

### 4.1 Modelo de settings de relays

`relay-settings` tendrá una nueva categoría `search` dentro de `byType`.

Contrato esperado:

```ts
type RelayType = 'nip65Both' | 'nip65Read' | 'nip65Write' | 'dmInbox' | 'search';

interface RelaySettingsByType {
  nip65Both: string[];
  nip65Read: string[];
  nip65Write: string[];
  dmInbox: string[];
  search: string[];
}
```

Pero `state.relays` seguirá representando únicamente los relays generales operativos del cliente para lectura/publicación tradicional.

Regla explícita:

- `byType.search` no se mezcla en `relays`

Motivación:

- evita contaminar el pool general con relays pensados solo para NIP-50
- mantiene claro el modelo mental del usuario
- reduce el riesgo de side effects en otras áreas del overlay

### 4.2 UX de `/relays`

La ruta sigue siendo una sola: `/relays`.

La página quedará organizada como una pila de secciones, con separación visual clara:

1. `Relays configurados`
2. `Añadir relay`
3. `Relays sugeridos`
4. `Relays de búsqueda`

La sección `Relays de búsqueda` debe presentarse como categoría distinta, con copy propio. No debe verse como una simple variación más de los tipos NIP-65/NIP-17.

Copy funcional esperado:

- se usan para búsqueda global de usuarios
- se usan para autocomplete de menciones `@`
- se usan para consultas NIP-50

La UI debe permitir:

- listar search relays configurados
- añadir search relays manualmente
- eliminar search relays
- restaurar defaults de búsqueda
- abrir detalle de relay también para esta categoría

### 4.3 Defaults iniciales de search relays

Los defaults de la categoría `search` serán:

- `wss://search.nos.today`
- `wss://relay.noswhere.com`
- `wss://filter.nostr.wine`

Se usarán como:

- valor inicial de la categoría en settings locales
- fallback del BFF cuando el cliente no envíe ninguno

### 4.4 Búsqueda remota vía BFF

El cliente dejará de resolver búsqueda remota de usuarios con `searchUsersDomain()` sobre relays generales cuando el objetivo sea búsqueda textual.

En su lugar:

- el cliente llamará a `/users/search`
- incluirá `ownerPubkey`, `q`, `limit` y `searchRelays`
- el BFF ejecutará la búsqueda NIP-50 contra esa lista dedicada

La responsabilidad del BFF en esta fase es estricta:

- usar los `searchRelays` recibidos o, si faltan, usar defaults curados
- no usar por defecto el pool general del usuario para búsquedas de texto

La búsqueda exacta por pubkey/npub sigue siendo un fallback lógico válido y no depende de NIP-50.

### 4.5 Estrategia `local-first`

La UX no debe bloquearse ni vaciarse por depender solo de red.

Regla de producto:

- la búsqueda local se calcula primero
- la búsqueda remota enriquece después

Fuentes locales previstas:

- `overlay.data.profiles`
- `overlay.data.follows`
- perfiles ya cargados durante la sesión

Matching mínimo local:

- `displayName`
- `name`
- `nip05`
- `npub`
- `pubkey`

Ranking mínimo local:

1. follows antes que no follows
2. exact match antes que prefix match
3. prefix match antes que contains match
4. owner excluido

### 4.6 Reutilización entre menciones y búsqueda global

La misma infraestructura de búsqueda debe alimentar dos superficies distintas:

#### Menciones `@`

- necesita respuesta rápida
- lista corta
- navegación por teclado
- no necesita acciones secundarias complejas

#### Búsqueda global de usuarios

- puede mostrar más resultados
- puede ofrecer acciones como `Follow` o `Mensaje`
- necesita estados vacíos y de carga más explícitos

La diferencia entre ambas debe vivir en la presentación, no en la capa de datos.

Decisión explícita de tamaño compartido:

- la capa compartida de datos trabajará con un tamaño canónico de búsqueda de `20` resultados
- mention search no hará una query distinta con límite menor; consumirá la misma respuesta canónica y recortará visualmente los primeros resultados relevantes
- búsqueda global podrá mostrar el conjunto completo o paginar visualmente más adelante, pero en esta fase parte de la misma respuesta base

Esto permite que la query key no dependa de `limit` en v1 y que la caché sea realmente compartida entre menciones y búsqueda global.

Capas compartidas:

- normalización del query
- búsqueda local
- llamada remota al BFF
- merge de resultados
- deduplicación por `pubkey`
- ranking final
- cacheado con TanStack Query

Capas separadas:

- UI
- tamaño de página/lista
- copy de estados
- interacción por teclado

### 4.7 Rol de TanStack Query

TanStack Query no se usará solo como “fetch wrapper”, sino como parte explícita de la UX.

Decisiones:

- una query key incluirá:
  - owner pubkey
  - término normalizado
  - `searchRelaySetKey`
- la query key no incluirá `limit` en v1 porque ambas superficies compartirán un fetch canónico de `20` resultados
- la query debe mantener resultados previos durante refetch (`placeholderData`)
- la caché debe ser compartible entre mention search y búsqueda global
- el `searchRelaySetKey` debe invalidar correctamente cuando cambian los search relays

Objetivo UX:

- evitar flicker a `Sin resultados`
- evitar transiciones bruscas de lista útil -> vacío -> lista útil
- reutilizar resultados recientes entre superficies similares

## 5) Contrato de API

### 5.1 Cliente -> BFF

La llamada a `/users/search` extenderá su contrato con `searchRelays` opcional.

Forma conceptual:

```http
GET /v1/users/search?ownerPubkey=<hex>&q=alice&limit=20&searchRelays=wss://search.nos.today&searchRelays=wss://relay.noswhere.com
```

Condiciones:

- si `searchRelays` viene vacío o ausente, el BFF usa defaults curados
- si `searchRelays` viene informado, el BFF debe normalizarlo, deduplicarlo y validarlo
- el BFF solo aceptará URLs `ws://` o `wss://` válidas; cualquier entrada inválida se descarta
- el BFF limitará la lista efectiva a un máximo pequeño y predecible en v1 (`10` relays)
- el cliente puede enviar relays arbitrarios configurados por el usuario, pero el servidor nunca debe usarlos sin normalización y bounds claros
- si `q` es un texto no vacío, el BFF puede usar NIP-50
- si `q` es un `npub` o pubkey exacto, el fallback exact-match sigue vigente

### 5.2 Respuesta

La respuesta no cambia estructuralmente:

```ts
interface UsersSearchResponseDto {
  pubkeys: string[];
  profiles: Record<string, UserProfileDto>;
}
```

La mejora es de fuente, estabilidad y ranking, no de shape.

## 6) Contrato de merge y ranking final

La búsqueda final se construirá en tres pasos explícitos:

1. calcular candidatos locales
2. traer candidatos remotos del BFF
3. fusionar por `pubkey` y reranquear el conjunto final

Reglas de merge:

- si el mismo `pubkey` existe en local y remoto, se conserva una sola fila
- el perfil remoto puede enriquecer campos faltantes del perfil local (`displayName`, `name`, `nip05`, `picture`, etc.)
- la identidad de la fila la define siempre el `pubkey`

Reglas de ranking final compartidas entre mention search y búsqueda global:

1. exact match antes que prefix match
2. prefix match antes que contains match
3. follows antes que no follows cuando el match quality es equivalente
4. perfiles ya conocidos localmente tienen prioridad sobre perfiles solo remotos cuando el match quality es equivalente
5. resultados remotos solo pueden adelantar a resultados locales si su calidad de match es claramente superior

En términos prácticos:

- un remote-only exact match puede quedar por encima de un local-only contains match
- un follow local con prefix match no debe ser desplazado por un remote-only contains match

Mention search y búsqueda global compartirán este ranking base. La diferencia será solo cuántos resultados muestra cada UI.

## 7) Comportamiento de error

No se debe convertir un fallo parcial de relays de búsqueda en una caída dura de UX.

Política deseada:

- si fallan algunos search relays, continuar con los restantes
- si fallan todos, devolver cero resultados remotos en lugar de reventar la búsqueda del cliente
- la capa cliente sigue pudiendo mostrar resultados locales

Resultado esperado:

- el usuario no ve `Sin resultados` solo porque un relay remoto no respondió o no soportó el filtro

Decisión explícita de observabilidad en v1:

- el resultado degradado será opaco para el cliente
- el API no añadirá metadata extra para indicar “todos los relays fallaron”
- la observabilidad del fallo queda del lado servidor mediante logs/métricas internas
- el cliente solo distingue entre resultados remotos presentes o ausencia de resultados remotos

## 8) Testing esperado

Cobertura mínima:

### 7.1 Settings

- persistencia de `byType.search`
- defaults correctos
- migración de payloads antiguos
- `search` no se mezcla en `relays`
- render de la nueva sección en `/relays`

### 7.2 Cliente de búsqueda

- el cliente envía `searchRelays` al BFF
- cambio en search relays invalida la query key
- menciones y búsqueda global usan el mismo fetch canónico de `20` resultados
- mention search y búsqueda global reutilizan la misma infraestructura de datos

### 7.3 BFF

- usa relays de búsqueda dedicados
- cae a defaults cuando faltan
- valida, normaliza, deduplica y acota `searchRelays`
- mantiene fallback exact match
- degrada bien ante errores parciales/totales de relays

### 7.4 UX integrada

- escribir `@` devuelve follows/perfiles locales inmediatamente
- escribir nombre no provoca caída a vacío mientras refetch remoto corre
- búsqueda global reutiliza el mismo comportamiento local-first

## 9) Riesgos y mitigaciones

Riesgo principal:

- introducir una nueva categoría de relay que accidentalmente se mezcle con el pool general

Mitigación:

- test explícito de que `search` queda fuera de `state.relays`

Riesgo secundario:

- duplicar lógica entre mention search y global search

Mitigación:

- helper puro de búsqueda local compartido
- `useUserSearchQuery` como capa común

Riesgo terciario:

- que el BFF acepte `searchRelays` pero siga usando bootstrap relays generales internamente

Mitigación:

- test de service verificando que la búsqueda textual sale por la lista dedicada

Riesgo adicional:

- que una caché compartida entre ambas superficies produzca listas truncadas o inconsistentes

Mitigación:

- fijar un fetch canónico compartido de `20` resultados y hacer el recorte en la UI, no en la query base

## 10) Implementación prevista

Secuencia de trabajo prevista:

1. ampliar `relay-settings` con `search`
2. separar visualmente `Relays de búsqueda` dentro de `/relays`
3. extender el contrato `/users/search` con `searchRelays`
4. mover la ejecución remota de búsqueda textual al BFF usando esa lista dedicada
5. introducir helper local-first compartido
6. reutilizar la misma capa de datos en menciones y búsqueda global
7. estabilizar la UX con TanStack Query
8. verificar frontend + backend + flujos integrados

## 11) Nota de control

Este diseño consolida lo hablado en conversación:

- una sola página `/relays`
- categoría separada de `Relays de búsqueda`
- lista curada inicial
- búsqueda remota vía BFF
- reutilización explícita entre mention search y búsqueda global de usuarios

Queda listo para implementación.
