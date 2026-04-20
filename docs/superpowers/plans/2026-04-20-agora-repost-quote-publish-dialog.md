# Agora Repost Quote Publish Dialog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la publicacion social de `Agora`, introducir un dialog reutilizable para `Publicar` y `Cita`, reemplazar el repost directo por un menu `Repost/Cita`, eliminar el composer inferior del feed principal y mostrar `toast` de exito o error en publicar, repostear y citar.

**Architecture:** La implementacion se apoya en una capa de publicacion social que firma con `writeGateway` y reenvia con `createPublishForwardApi({ client: bffClient })`, para que el controller del feed deje de depender de un writer que solo firma. Encima de esa capa, `App.tsx` controla un dialog global de composer y distribuye callbacks reutilizables a feed, hilo, sidebar y perfil, mientras `NoteCard` pasa a renderizar un menu contextual de repost con `Repost` y `Cita`. El render de `Cita` debe reutilizar el modelo visual ya consolidado para reposts: una sola tarjeta padre del autor de la cita con la nota citada embebida dentro, sin duplicados por referencias en contenido.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, sonner, shadcn/ui

---

## Chunk 1: Social Publish Pipeline

### Task 1: Cubrir en tests el fallo actual del pipeline social

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`
- Spec: `docs/superpowers/specs/2026-04-20-agora-repost-quote-publish-dialog-design.md`

- [ ] **Step 1: Escribir tests RED para distinguir firmar de publicar realmente**
  - anadir un test que abra `Agora`, dispare una publicacion y verifique que el flujo usa forwarding social, no solo `writeGateway.publishEvent`
  - anadir un test que dispare un repost directo y verifique la llamada al forwarding con `relayScope: 'social'`
  - anadir un test que cubra el path de error del forward y espere `toast.error`
  - anadir un test que cubra el path de exito y espere `toast.success`
- [ ] **Step 2: Ejecutar la suite enfocada y confirmar RED**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: FAIL por ausencia de capa de forwarding social reutilizable y de toasts en publicar/repost.

### Task 2: Introducir un publicador social explicito

**Files:**
- Create: `src/nostr-overlay/social-publisher.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/query/following-feed.mutations.ts`

- [ ] **Step 3: Crear `social-publisher.ts` con una interfaz enfocada a social publish**
  - definir una interfaz que acepte eventos unsigned y devuelva el evento firmado/publicado
  - firmar con `writeGateway.publishEvent`
  - forwardear con `createPublishForwardApi({ client: bffClient })` reutilizando el contrato actual de `publish-forward-api.ts`, sin modificarlo salvo que aparezca una necesidad real durante la implementacion
  - resolver relays sociales a partir de `nip65Write`, `nip65Both` y fallback bootstrap
  - normalizar un error unico si el publish no obtiene `ackedRelays.length > 0`
- [ ] **Step 4: Instanciar el publicador en `useNostrOverlay.ts` y exponerlo junto al resto de servicios**
  - usar el `bffClient` ya autenticado para que `includeAuth: true` realmente adjunte la prueba Nostr
  - evitar crear un cliente anonimo adicional para el forward
- [ ] **Step 5: Reemplazar en `useFollowingFeedController.ts` la dependencia de `writeGateway` por `socialPublisher` y pasarla desde `App.tsx`**
  - actualizar el punto donde `App.tsx` crea el controller para inyectar `overlay.socialPublisher`
  - mantener el resto del wiring del controller igual hasta introducir cita en el siguiente chunk
- [ ] **Step 6: Adaptar los tipos de mutacion para depender del publicador social en lugar de `WriteGatewayLike`**
  - mantener helper de notas temporales y merges optimistas
  - ampliar las entradas para cita si hace falta
- [ ] **Step 7: Re-ejecutar la suite enfocada del chunk y confirmar progreso hacia GREEN**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: menos fallos, quedando pendientes los de UI/dialog/menu si aun no estan implementados.

## Chunk 2: Quote And Compose Domain API

### Task 3: Separar acciones de repost y cita en el dominio del feed

**Files:**
- Create: `src/nostr-overlay/query/following-feed.mutations.test.ts`
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/query/following-feed.mutations.ts`

- [ ] **Step 8: Escribir tests RED en `following-feed.mutations.test.ts` para la semantica de cita y repost**
  - cubrir helper de tags/contenido de cita con referencia `nostr:nevent...`
  - cubrir que la cita publica kind `1`, no kind `6`
  - cubrir que el repost directo sigue siendo kind `6`
  - cubrir la regla de exito basada en `ackedRelays.length > 0` si el helper de publicacion la expone aqui
- [ ] **Step 9: Implementar la separacion entre `Repost` y `Cita`**
  - conservar `toggleRepost` para repost directo
  - anadir una accion nueva tipo `publishQuote`
  - construir tags de cita en un helper dedicado, manteniendo `sanitizeContent`
  - dejar explicitado desde esta capa que el renderer local no debe duplicar la nota citada cuando exista `nostr:nevent...` en `content`
  - mantener invalidaciones y optimistic updates con el menor cambio posible
- [ ] **Step 10: Ejecutar los tests del dominio de mutaciones y confirmar GREEN**
Run: `pnpm vitest run src/nostr-overlay/query/following-feed.mutations.test.ts`
Expected: PASS

## Chunk 3: Global Compose Dialog And Sidebar Entry Point

### Task 4: Añadir el dialog compartido para `Publicar` y `Cita`

**Files:**
- Create: `src/nostr-overlay/components/SocialComposeDialog.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 11: Escribir tests RED del dialog global en `App.test.tsx` y del sidebar en `OverlaySidebar.test.tsx`**
  - comprobar en `OverlaySidebar.test.tsx` que `Publicar` aparece inmediatamente despues de `Agora` y antes de `Chats` cuando `canWrite=true`
  - comprobar en `OverlaySidebar.test.tsx` que `Publicar` no aparece cuando `canWrite=false`
  - comprobar que `Publicar` abre un dialog con textarea y CTA de envio
  - comprobar que `Cita` abre ese mismo dialog con preview de la nota citada
  - comprobar que cerrar el dialog resetea draft y objetivo citado
- [ ] **Step 12: Implementar `SocialComposeDialog.tsx` con `Dialog`, `Textarea`, CTA y preview de cita**
  - soportar modo `post` sin preview
  - soportar modo `quote` con preview estable reutilizando `NoteCard` o un adaptador de preview minimo
  - deshabilitar envio cuando el draft este vacio o la accion este pending
- [ ] **Step 13: Subir el estado del dialog a `App.tsx` y conectar callbacks de abrir/cerrar/publicar/citar**
  - manejar un unico estado fuente de verdad para el dialog
  - disparar `toast.success` y `toast.error` en esta capa para evitar duplicados
- [ ] **Step 14: Añadir el item `Publicar` al sidebar principal en `OverlaySidebar.tsx`**
  - mostrarlo solo cuando `canWrite` sea `true`
  - colocarlo despues de `Agora`
- [ ] **Step 15: Re-ejecutar tests del sidebar y del dialog**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/components/OverlaySidebar.test.tsx`
Expected: PASS en apertura del dialog, orden del sidebar y toasts base.

## Chunk 4: NoteCard Repost Menu Across Feed, Thread, Profile

### Task 5: Cambiar el contrato de acciones de `NoteCard`

**Files:**
- Modify: `src/nostr-overlay/components/note-card-model.ts`
- Modify: `src/nostr-overlay/components/following-feed-note-card-mappers.ts`
- Modify: `src/nostr-overlay/components/NoteCard.tsx`
- Test: `src/nostr-overlay/components/NoteCard.test.tsx`

- [ ] **Step 16: Escribir tests RED del nuevo menu de repost**
  - verificar que el control de repost abre un menu contextual
  - verificar que el menu contiene exactamente `Repost` y `Cita`
  - verificar que el item `Repost` conserva semantica de toggle
  - verificar que el estado pending deshabilita la accion
- [ ] **Step 17: Reemplazar `onToggleRepost` por acciones explicitas de repost y cita en el modelo y mappers**
  - feed: mapear `Repost` directo y `Cita` abriendo dialog sobre `item`
  - thread: mismo patron sobre `item`
  - preview de perfil: mismo patron sobre `post`
  - introducir o ajustar un adaptador compartido para que `Cita` reutilice `embedded` como primitiva de render, en lugar de resolver otra via exclusiva por superficie
- [ ] **Step 18: Implementar el menu en `NoteCard.tsx` reutilizando el patron de menu contextual ya presente en el repo**
  - mantener labels accesibles y contadores existentes
  - no romper reactions, replies ni zaps
- [ ] **Step 19: Ejecutar la suite de `NoteCard`**
Run: `pnpm vitest run src/nostr-overlay/components/NoteCard.test.tsx`
Expected: PASS

### Task 6: Propagar el nuevo contrato a feed, hilo y perfil

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
- Test: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Test: `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`

- [ ] **Step 20: Escribir tests RED de integracion para feed, hilo y perfil**
  - `FollowingFeedSurface.test.tsx`: abrir menu `Repost/Cita` en feed y en hilo
  - `OccupantProfileDialog.test.tsx`: abrir menu `Repost/Cita` en una publicacion del perfil
  - comprobar que `Cita` delega en el callback que abre el dialog global
  - comprobar que una cita renderizada produce una sola tarjeta top-level del autor que cita
  - comprobar que el contenido adicional del autor que cita sigue visible
  - comprobar que la nota citada aparece embebida dentro de esa tarjeta
  - comprobar que no hay doble render del mismo objetivo citado por combinar `embedded` y referencia `nostr:nevent`
- [ ] **Step 21: Adaptar `FollowingFeedContent.tsx` y `OccupantProfileDialog.tsx` al nuevo contrato de acciones**
  - pasar callbacks de repost directo y cita sin duplicar estado local innecesario
  - centralizar el mapping visual de `Cita` para no repetir la logica de `embedded` solo en `FollowingFeedContent.tsx`
  - mantener reply composer del hilo sin cambios funcionales ajenos a esta feature
- [ ] **Step 22: Ejecutar las suites del surface y del profile dialog**
Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
Expected: PASS

## Chunk 5: Remove Feed Composer And Keep Thread Reply Composer

### Task 7: Ajustar la superficie de `Agora`

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Test: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 23: Escribir test RED para la ausencia del composer principal del feed**
  - confirmar que en `Agora` principal ya no aparece `.nostr-following-feed-compose`
  - confirmar que en detalle de hilo sigue apareciendo `.nostr-following-feed-reply-box`
- [ ] **Step 24: Implementar el cambio minimo en `FollowingFeedContent.tsx`**
  - no renderizar el composer principal cuando no hay hilo activo
  - mantener intacto el composer de respuesta cuando hay hilo activo
- [ ] **Step 25: Re-ejecutar la suite del surface**
Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS

## Chunk 6: Final Verification

### Task 8: Verificacion enfocada de toda la feature

**Files:**
- No code changes expected

- [ ] **Step 26: Ejecutar las suites enfocadas de la feature**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/components/OverlaySidebar.test.tsx src/nostr-overlay/components/NoteCard.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/components/OccupantProfileDialog.test.tsx src/nostr-overlay/query/following-feed.mutations.test.ts`
Expected: PASS para pipeline social, dialog global, sidebar `Publicar`, menu `Repost/Cita`, composer del hilo y toasts.

- [ ] **Step 27: Ejecutar cualquier suite nueva de controller si durante la implementacion se crea `useFollowingFeedController.test.tsx`**
Run: `pnpm vitest run src/nostr-overlay/hooks/useFollowingFeedController.test.tsx`
Expected: si el archivo no existe, omitir este paso; si existe, PASS.

- [ ] **Step 28: Verificar manualmente los contratos que no dependan solo del DOM de test**
  - publicar desde `Publicar`
  - repost directo desde una nota
  - eliminar repost desde una nota ya reposted
  - cita desde una nota
  - validar que la cita se ve como una sola tarjeta del autor que cita con la nota citada embebida dentro
  - validar que el contenido propio de la cita sigue visible y que la nota citada no se duplica
  - respuesta dentro de un hilo
  - verificar `toast.success` y `toast.error` en cada caso segun resultado

- [ ] **Step 29: No hacer commit salvo que el usuario lo pida**
