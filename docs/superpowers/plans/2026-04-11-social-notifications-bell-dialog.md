# Social Notifications Bell And Dialog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un icono de notificaciones sociales junto a las acciones del overlay, mostrar punto rojo cuando haya pendientes, y abrir un dialog con el listado de pendientes que se marcan como leidas al abrir.

**Architecture:** Implementar una capa social dedicada separada de DMs: runtime service Nostr (bootstrap + stream), store/hook con persistencia de `lastReadSocialAt`, y componentes UI (`NotificationsIconButton` + `NotificationsDialog`) integrados en toolbar normal y compacta. El comportamiento unread sigue modelo tipo Snort/Primal (`created_at > lastReadSocialAt`) y usa snapshot para preservar el listado visible al abrir.

**Tech Stack:** React 19, TypeScript, Vitest, NDK transport existente, componentes shadcn (`Dialog`, `Button`).

---

## Execution Constraints (obligatorio)

- [x] **Sin worktrees**: ejecutar todo en el workspace actual (`/home/pablo/projects/MapGenerator`).
- [x] **Checklist vivo**: marcar cada paso de este plan con `- [x]` justo al completarlo.
- [ ] **Unico commit al final**: no hacer commits intermedios.
- [ ] **Gate de revision manual**: antes del commit final, esperar y registrar aprobacion manual del usuario.

## File Structure

**Create**
- `src/nostr/social-notifications-service.ts`
- `src/nostr/social-notifications-runtime-service.ts`
- `src/nostr-overlay/hooks/useSocialNotifications.ts`
- `src/nostr-overlay/hooks/useSocialNotifications.test.ts`
- `src/nostr-overlay/components/NotificationsIconButton.tsx`
- `src/nostr-overlay/components/NotificationsDialog.tsx`
- `src/nostr-overlay/components/NotificationsDialog.test.tsx`

**Modify**
- `src/nostr-overlay/App.tsx`
- `src/nostr-overlay/App.test.tsx`
- `src/nostr-overlay/styles.css`
- `src/nostr-overlay/hooks/useNostrOverlay.ts`

## Chunk 1: Social Domain + Runtime Feed

### Task 1: Definir contrato tipado para notificaciones sociales

**Files:**
- Create: `src/nostr/social-notifications-service.ts`

- [x] **Step 1: Escribir tipos core**
Agregar tipos:
- `SocialNotificationKind = 1 | 6 | 7 | 9735`
- `SocialNotificationEvent` con forma NIP-01 (`id`, `pubkey`, `kind`, `created_at`, `tags`, `content`)
- `SocialNotificationItem` normalizado para UI

- [x] **Step 2: Escribir contrato de servicio**
Agregar interfaz:
- `subscribeSocial(input, onEvent): () => void`
- `loadInitialSocial(input): Promise<SocialNotificationEvent[]>`

- [x] **Step 3: Helper de parseo tags**
Agregar helpers puros para lectura robusta de tags (`p`, `e`, `k`, `a`) con tolerancia a eventos incompletos.

- [x] **Step 4: Verificar typecheck local del archivo** (ejecutado; hay errores TS preexistentes fuera de chunk 1/2)
Run: `pnpm typecheck`
Expected: sin errores nuevos.

### Task 2: Implementar runtime social service (bootstrap + stream)

**Files:**
- Create: `src/nostr/social-notifications-runtime-service.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [x] **Step 1: Crear runtime service sobre transporte NDK existente**
Implementar `createRuntimeSocialNotificationsService` reutilizando:
- `createLazyNdkDmTransport` para `subscribe` y `fetchBackfill`
- resolucion de relays con `loadRelaySettings` y fallback `getBootstrapRelays`

- [x] **Step 2: Definir filtros Nostr**
Usar filtros con `#p: [ownerPubkey]` y `kinds: [1, 6, 7, 9735]`.

- [x] **Step 3: Carga inicial ordenada y limitada**
Para `loadInitialSocial`, ordenar por `created_at desc`, dedupe por `id`, limite inicial recomendado `120`.

- [x] **Step 4: Exponer inyeccion opcional para tests**
Extender `NostrOverlayServices` con `socialNotificationsService?: SocialNotificationsService` (solo wiring, sin romper APIs actuales).

- [x] **Step 5: Verificar compilacion de cambios de dominio** (ejecutado; hay errores TS preexistentes fuera de chunk 1/2)
Run: `pnpm typecheck`
Expected: PASS.

## Chunk 2: Store + Unread Logic + Snapshot Behavior

### Task 3: Implementar store/hook `useSocialNotifications`

**Files:**
- Create: `src/nostr-overlay/hooks/useSocialNotifications.ts`

- [x] **Step 1: Crear estado y acciones del store**
Estado minimo:
- `items: SocialNotificationItem[]`
- `hasUnread: boolean`
- `lastReadAt: number`
- `isDialogOpen: boolean`
- `snapshotPendingIds: string[]`
- `bootstrapError: string | null`

Acciones minimas:
- `openDialog()`
- `closeDialog()`
- `retry()`
- `dispose()`

- [x] **Step 2: Persistencia local robusta**
Storage key: `nostr-overlay:social:v1:last-read:<ownerPubkey>`
Parse seguro con fallback a `0`.

- [x] **Step 3: Regla unread estilo Snort/Primal**
`hasUnread = items.some((item) => item.createdAt > lastReadAt)`.

- [x] **Step 4: Implementar mark-as-read al abrir + snapshot**
En `openDialog()`:
1. Capturar IDs pendientes actuales como snapshot.
2. Setear `lastReadAt = now`.
3. Recalcular `hasUnread` a `false` (si no entra nada nuevo).

- [x] **Step 5: Reglas de inclusion y exclusiones**
Incluir solo sociales para owner:
- `kind 1` con `p` al owner (menciones/replies)
- `kind 6` repost a contenido del owner
- `kind 7` reaccion a contenido del owner
- `kind 9735` zap receipt al owner

Excluir:
- eventos del propio owner (`event.pubkey === ownerPubkey`)
- eventos malformados/duplicados

- [x] **Step 6: Limite de memoria**
Conservar maximo `200` notificaciones en memoria.

### Task 4: Tests del hook/store (TDD)

**Files:**
- Create: `src/nostr-overlay/hooks/useSocialNotifications.test.ts`

- [x] **Step 1: Red test - unread on ingest**
Verificar que llega evento social nuevo y `hasUnread` pasa a `true`.

- [x] **Step 2: Red test - openDialog marks read**
Verificar que `openDialog()` limpia badge y actualiza `lastReadAt`.

- [x] **Step 3: Red test - snapshot se mantiene visible**
Verificar que el listado del dialog usa snapshot de pendientes aunque `hasUnread` se limpie.

- [x] **Step 4: Red test - dedupe por id**
Mismo `event.id` no duplica item.

- [x] **Step 5: Red test - aislamiento por owner storage**
`lastReadAt` de owner A no afecta owner B.

- [x] **Step 6: Implementar minimo para verde**
Completar hook/store hasta hacer pasar los tests.

- [x] **Step 7: Ejecutar tests del hook**
Run: `pnpm test:unit -- src/nostr-overlay/hooks/useSocialNotifications.test.ts`
Expected: PASS.

## Chunk 3: UI Components + App Integration

### Task 5: Crear `NotificationsIconButton` y `NotificationsDialog`

**Files:**
- Create: `src/nostr-overlay/components/NotificationsIconButton.tsx`
- Create: `src/nostr-overlay/components/NotificationsDialog.tsx`
- Create: `src/nostr-overlay/components/NotificationsDialog.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [x] **Step 1: Implementar icon button**
- campana SVG
- `aria-label="Abrir notificaciones"`
- `title="Notificaciones"`
- dot rojo sin numero cuando `hasUnread`

- [x] **Step 2: Implementar dialog**
- `Dialog` con titulo `Notificaciones`
- lista de snapshot pendientes
- empty state: `No tienes notificaciones pendientes`
- boton cerrar consistente con estilo overlay

- [x] **Step 3: Estilos**
Agregar clases nuevas siguiendo estilo actual (`nostr-*`) y reutilizar patrones visuales ya existentes (chat/settings).

- [x] **Step 4: Tests del dialog**
Cubrir:
- render empty
- render lista
- close callback

- [x] **Step 5: Ejecutar tests del dialog**
Run: `pnpm test:unit -- src/nostr-overlay/components/NotificationsDialog.test.tsx`
Expected: PASS.

### Task 6: Integrar notificaciones en `App.tsx` (toolbar normal y compacta)

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Wire del hook**
Inicializar `useSocialNotifications` con:
- `ownerPubkey`
- `socialNotificationsService` runtime o inyectado desde `services`

- [x] **Step 2: Agregar icono en toolbar expandida**
Ubicar junto al grupo de acciones (settings/regenerar/chats/stats), respetando orden existente del layout.

- [x] **Step 3: Agregar icono en toolbar compacta**
Insertar boton equivalente en modo panel colapsado.

- [x] **Step 4: Abrir dialog y aplicar mark-as-read al abrir**
Click icono -> `openDialog()` -> render `NotificationsDialog`.

- [x] **Step 5: Actualizar tests de App**
Agregar/ajustar asserts para:
- presencia del boton en ambos modos
- dot visible con pendientes
- al abrir dialog desaparece dot y lista snapshot se muestra

- [x] **Step 6: Ejecutar tests de App**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx`
Expected: PASS.

## Chunk 4: Verification + Manual Review + Single Commit

### Task 7: Verificacion tecnica final

**Files:**
- Verify: `src/nostr/**`
- Verify: `src/nostr-overlay/**`

- [x] **Step 1: Ejecutar suites foco**
Run:
- `pnpm test:unit -- src/nostr-overlay/hooks/useSocialNotifications.test.ts`
- `pnpm test:unit -- src/nostr-overlay/components/NotificationsDialog.test.tsx`
- `pnpm test:unit -- src/nostr-overlay/App.test.tsx`

- [x] **Step 2: Ejecutar typecheck** (falla por errores TS preexistentes fuera de este scope)
Run: `pnpm typecheck`
Expected: PASS.

- [x] **Step 3: Ejecutar build**
Run: `pnpm build`
Expected: PASS.

### Task 8: Revision manual y commit unico

**Files:**
- Modify: all touched files from tasks anteriores

- [x] **Step 1: Preparar resumen para revision manual del usuario**
Incluir: cambios funcionales, comportamiento badge, flujo abrir dialog => mark read.

- [ ] **Step 2: Esperar aprobacion manual explicita**
No commitear hasta confirmacion del usuario.

- [ ] **Step 3: Crear commit unico final**
Run:
```bash
git add src/nostr/social-notifications-service.ts src/nostr/social-notifications-runtime-service.ts src/nostr-overlay/hooks/useSocialNotifications.ts src/nostr-overlay/hooks/useSocialNotifications.test.ts src/nostr-overlay/components/NotificationsIconButton.tsx src/nostr-overlay/components/NotificationsDialog.tsx src/nostr-overlay/components/NotificationsDialog.test.tsx src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/styles.css src/nostr-overlay/hooks/useNostrOverlay.ts
git add src/main.ts src/ts/ui/main_gui.ts src/nostr-overlay/map-bridge.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/selection-focus.test.tsx src/nostr-overlay/components/ChatDialog.tsx src/nostr-overlay/components/ChatDialog.test.tsx src/nostr-overlay/components/ChatConversationList.tsx src/nostr-overlay/components/ChatConversationDetail.tsx src/nostr-overlay/components/MapSettingsDialog.tsx src/nostr-overlay/components/MapSettingsDialog.test.tsx src/nostr-overlay/components/CityStatsDialog.tsx src/nostr-overlay/components/EasterEggDialog.tsx src/nostr-overlay/components/EasterEggDialog.test.tsx src/nostr-overlay/components/OccupantProfileDialog.tsx src/nostr-overlay/components/MapPresenceLayer.test.tsx
git commit -m "feat: add social notifications bell with unread dot and pending dialog"
```

- [ ] **Step 4: Validar working tree limpio post-commit**
Run: `git status`
Expected: clean (o solo cambios no relacionados preexistentes).
