# Diseño: inbox de notificaciones enriquecida para overlay social

Fecha: 2026-04-23
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Convertir la pantalla de notificaciones del overlay en una inbox útil y consistente con el resto del proyecto.

Requisitos acordados:

- la pantalla debe mostrar más contexto que el estado actual de `kind` + pubkey truncada
- la inbox debe separarse en `Nuevas` y `Recientes`
- `Nuevas` debe usar el snapshot congelado al abrir la pantalla
- `Recientes` debe mostrar historial reciente, no solo pendientes
- los `zaps` deben agruparse por nota
- las `reacciones` deben agruparse por nota y por tipo de reacción
- `mentions` y `reposts` también deben enriquecerse con identidad y preview de nota
- la implementación debe usar `shadcn/ui` y Tailwind, manteniendo consistencia con el proyecto
- se debe minimizar la cantidad de estilos custom
- todo copy nuevo visible para usuario debe ir por i18n

## 2) Estado actual y gap principal

La implementación actual de `NotificationsPage` renderiza una lista plana basada en `SocialNotificationItem`.

Hoy solo muestra:

- etiqueta por `kind`
- `actorPubkey` truncada

No muestra:

- nombre visible ni avatar del actor
- preview de la nota objetivo
- agrupación de eventos relacionados
- suma de sats en zaps agrupados
- distinción clara entre reply y mention
- historial reciente separado del snapshot de nuevas notificaciones

Además, la pila actual de notificaciones soporta `kind 1`, `6`, `7` y `9735`, pero no `kind 16` para reposts genéricos.

## 3) Referencias externas y conclusión de producto

La revisión de otros clientes (`Primal`, `Snort`, `Coracle`, `Ditto`, `noStrudel`) muestra un patrón bastante estable:

- la inbox mejora mucho cuando muestra preview del target
- zaps y reacciones suelen agruparse
- menciones y replies suelen quedarse individuales o con poca agregación
- varios clientes distinguen replies de mentions cuando el protocolo lo permite
- varios clientes soportan más tipos, pero `quotes`, `follows` y `kind 1111` pueden quedar para una fase posterior

La conclusión para esta fase es:

- cubrir bien `reply`, `mention`, `repost`, `reaction` y `zap`
- añadir `kind 16`
- dejar el modelo preparado para `quote`, `follow`, `kind 1111` y `nutzap` sin implementarlos todavía en la UI final

## 4) Alcance

En alcance:

- `kind 1` como base de `reply` y `mention`
- `kind 6` y `kind 16` como `repost`
- `kind 7` como `reaction`
- `kind 9735` como `zap`
- secciones `Nuevas` y `Recientes`
- hidratación de perfiles y eventos objetivo
- preview de nota objetivo reutilizando infraestructura ya existente del overlay
- ampliación mínima del BFF para `kind 16`

Fuera de alcance:

- `quote` como categoría visible final en esta iteración
- `follow` como notificación visible
- `kind 1111` para comments en contenido no-`kind 1`
- `kind 9321` y demás flujos de nutzap
- tabs o filtros avanzados tipo Primal
- nueva estética o sistema visual paralelo para notificaciones

## 5) Decisiones principales

### 5.1 Secciones de inbox

La pantalla tendrá dos bloques:

- `Nuevas`
- `Recientes`

`Nuevas` se construye desde `pendingSnapshot` al abrir la pantalla.

`Recientes` se construye desde la colección completa reciente de `items` del controller.

Para evitar ruido, `Recientes` no debe duplicar eventos que ya estén presentes en `Nuevas`.

### 5.2 Tipos visibles en esta fase

La UI final de esta iteración debe soportar estas categorías de inbox:

- `reply`
- `mention`
- `repost`
- `reaction`
- `zap`

La clasificación debe ser conservadora:

- si `kind 1` puede demostrarse razonablemente como respuesta, mostrar `reply`
- si no, usar `mention`
- nunca inventar semántica no respaldada por tags claros

### 5.3 Reglas de agrupación

- `reaction`: agrupar por `targetEventId + reactionContent`
- `zap`: agrupar por `targetEventId`
- `repost`: agrupar por `targetEventId + category`
- `mention` y `reply`: individuales por defecto

## 6) Consideraciones protocolarias Nostr

La clasificación debe respetar estos límites:

- `reply` frente a `mention` puede ser ambiguo en eventos antiguos o con tags incompletos
- `kind 6` y `kind 16` no deben colapsarse a nivel de ingesta; ambos son reposts visibles, pero el soporte protocolario debe contemplar ambos kinds
- `reaction` no implica siempre `like`: `+`, `-` y otros emojis deben conservarse
- para reacciones, el target relevante debe resolverse con la lógica más segura posible, usando el último `e` tag cuando aplique
- en `zap`, el emisor puede no ser identificable con fiabilidad; la UI debe soportar actor desconocido o anónimo

No se implementará aún validación exhaustiva de receipts de zap a nivel de dominio, pero la UI no debe asumir identidad cuando no exista una resolución confiable.

## 7) Modelo de datos propuesto

No es suficiente renderizar mejor `SocialNotificationItem`. Hace falta una capa intermedia de inbox enriquecida.

### 7.1 Capa base

`SocialNotificationItem` sigue siendo el modelo de evento crudo que llega desde query/BFF/runtime.

### 7.2 Capa enriquecida

Se añadirá un modelo intermedio para render:

- `NotificationCategory`: `reply | mention | repost | reaction | zap`
- `NotificationActor`
- `NotificationInboxItem`
- `NotificationInboxSections`

Cada `NotificationInboxItem` debe contener como mínimo:

- `category`
- `groupKey`
- `actors`
- `primaryActorPubkey`
- `targetEventId`
- `targetEvent`
- `reactionContent` cuando aplique
- `zapTotalSats` cuando aplique
- `itemCount`
- `occurredAt`
- `sourceEvents`

Este modelo debe permitir estados parciales:

- perfil no cargado todavía
- target no resuelto
- actor de zap no resoluble
- evento target borrado o ausente

## 8) Flujo de datos e hidratación

El pipeline propuesto es:

1. El controller sigue entregando `items` y `pendingSnapshot` como colecciones crudas.
2. Una capa pura normaliza y clasifica eventos.
3. La pantalla reúne pubkeys y `targetEventId` únicos.
4. Se resuelven perfiles y eventos en batch reutilizando la infraestructura existente del overlay.
5. Con esos datos se agregan y construyen los `NotificationInboxItem` finales.
6. La UI renderiza solo items enriquecidos.

La pantalla no debe disparar fetch por fila.

Se reutilizarán:

- `overlay.loadProfilesByPubkeys`
- `resolveEventReferences`
- `eventReferencesById`

## 9) Rendering y comportamiento esperado

Cada fila de la inbox tendrá una plantilla homogénea:

- icono por categoría
- avatares de actores
- texto principal
- timestamp corto
- preview de nota objetivo cuando exista
- meta secundaria específica del tipo

### 9.1 Zap

Debe mostrar:

- actores agrupados
- texto agregado tipo `Alice y 2 más zapearon tu nota`
- total de sats visible en la fila
- preview de la nota objetivo

### 9.2 Reaction

Debe mostrar:

- agrupación por nota y reacción
- reacción conservada como contenido real, no siempre como like
- avatares agrupados
- preview de la nota objetivo

### 9.3 Reply

Debe mostrarse normalmente como fila individual:

- autor identificado
- copy tipo `X respondió a tu nota`
- preview contextual

### 9.4 Mention

Debe mostrarse como fila individual:

- autor identificado
- preview de la nota donde ocurre la mención

### 9.5 Repost

Puede agruparse por nota:

- actores agrupados
- preview de la nota objetivo

## 10) Restricciones de UI y stack

La implementación debe respetar explícitamente estas reglas:

- usar `shadcn/ui` como primera opción de composición
- usar Tailwind para layout y ajuste fino
- mantener consistencia con el estilo `radix-nova` ya configurado en el proyecto
- minimizar estilos custom en `src/nostr-overlay/styles.css`
- no introducir colores hardcodeados ni una estética especial solo para notificaciones
- reutilizar componentes ya presentes cuando encajen, en especial:
  - `OverlaySurface`
  - `OverlayPageHeader`
  - `Empty`
  - `Item`
  - `Badge`
  - `Avatar` y/o `VerifiedUserAvatar`
  - `NoteCard`

El preview de nota debe reutilizar la infraestructura existente (`fromResolvedReferenceEvent`, `withoutNoteActions`) en vez de crear otro renderer distinto.

## 11) Testing esperado

Cobertura mínima esperada:

- `kind 16` aparece como repost soportado
- `Nuevas` y `Recientes` se construyen correctamente
- `Recientes` no duplica entradas ya presentes en `Nuevas`
- zaps se agrupan por nota y suman sats
- reactions se agrupan por nota y reacción
- mentions y replies se muestran con el fallback conservador correcto
- perfiles ausentes hacen fallback a avatar/nombre derivado de pubkey
- targets ausentes o no resueltos no rompen la pantalla
- copy nuevo está en i18n `es` y `en`

## 12) Riesgos y mitigaciones

Riesgo principal:

- sobreclasificar eventos `kind 1` como `reply` cuando el protocolo no lo permite con seguridad

Mitigación:

- usar una estrategia conservadora y caer a `mention` cuando la evidencia sea insuficiente

Riesgo secundario:

- crear una UI rica pero acoplada a fetches por fila o lógica de render poco testeable

Mitigación:

- mantener la agregación en una capa pura y la hidratación en batch

Riesgo visual:

- resolver la pantalla con mucho CSS bespoke y romper la consistencia del overlay

Mitigación:

- componer con `shadcn/ui` y Tailwind antes de tocar CSS custom

## 13) Archivos previstos

- `server/src/modules/notifications/notifications.service.ts`
- `server/src/modules/notifications/notifications.service.test.ts`
- `src/nostr/social-notifications-service.ts`
- `src/nostr/social-notifications-runtime-service.ts`
- `src/nostr-overlay/query/social-notifications.query.ts`
- `src/nostr-overlay/query/social-notifications-inbox.ts`
- `src/nostr-overlay/query/social-notifications-inbox.test.ts`
- `src/nostr-overlay/App.tsx`
- `src/nostr-overlay/App.test.tsx`
- `src/nostr-overlay/components/NotificationsPage.tsx`
- `src/nostr-overlay/components/NotificationsPage.test.tsx`
- `src/i18n/messages/es.ts`
- `src/i18n/messages/en.ts`
