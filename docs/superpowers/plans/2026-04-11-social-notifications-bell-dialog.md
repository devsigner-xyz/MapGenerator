# Social Notifications Bell And Dialog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un icono de notificaciones sociales junto a las acciones del overlay, mostrar punto rojo cuando haya pendientes, y abrir un dialog con el listado de pendientes que se marcan como leidas al abrir.

**Architecture:** Implementar una capa social dedicada separada de DMs: runtime service Nostr (bootstrap + stream), store/hook con persistencia de `lastReadSocialAt`, y componentes UI (`NotificationsIconButton` + `NotificationsModal`) integrados en toolbar normal y compacta. El comportamiento unread sigue modelo tipo Snort/Primal (`created_at > lastReadSocialAt`) y usa snapshot para preservar el listado visible al abrir.

**Tech Stack:** React 19, TypeScript, Vitest, NDK transport existente, componentes shadcn (`Dialog`, `Button`).

---

## Execution Constraints (obligatorio)

- [ ] **Sin worktrees**: ejecutar todo en el workspace actual (`/home/pablo/projects/MapGenerator`).
- [ ] **Checklist vivo**: marcar cada paso de este plan con `- [x]` justo al completarlo.
- [ ] **Unico commit al final**: no hacer commits intermedios.
- [ ] **Gate de revision manual**: antes del commit final, esperar y registrar aprobacion manual del usuario.

## File Structure

**Create**
- `src/nostr/social-notifications-service.ts`
- `src/nostr/social-notifications-runtime-service.ts`
- `src/nostr-overlay/hooks/useSocialNotifications.ts`
- `src/nostr-overlay/hooks/useSocialNotifications.test.ts`
- `src/nostr-overlay/components/NotificationsIconButton.tsx`
- `src/nostr-overlay/components/NotificationsModal.tsx`
- `src/nostr-overlay/components/NotificationsModal.test.tsx`

**Modify**
- `src/nostr-overlay/App.tsx`
- `src/nostr-overlay/App.test.tsx`
- `src/nostr-overlay/styles.css`
- `src/nostr-overlay/hooks/useNostrOverlay.ts`

## Chunk 1: Social Domain + Runtime Feed

### Task 1: Definir contrato tipado para notificaciones sociales

**Files:**
- Create: `src/nostr/social-notifications-service.ts`

- [ ] **Step 1: Escribir tipos core**
Agregar tipos:
- `SocialNotificationKind = 1 | 6 | 7 | 9735`
- `SocialNotificationEvent` con forma NIP-01 (`id`, `pubkey`, `kind`, `created_at`, `tags`, `content`)
- `SocialNotificationItem` normalizado para UI

- [ ] **Step 2: Escribir contrato de servicio**
Agregar interfaz:
- `subscribeSocial(input, onEvent): () => void`
- `loadInitialSocial(input): Promise<SocialNotificationEvent[]>`

- [ ] **Step 3: Helper de parseo tags**
Agregar helpers puros para lectura robusta de tags (`p`, `e`, `k`, `a`) con tolerancia a eventos incompletos.

- [ ] **Step 4: Verificar typecheck local del archivo**
Run: `pnpm typecheck`
Expected: sin errores nuevos.

### Task 2: Implementar runtime social service (bootstrap + stream)

**Files:**
- Create: `src/nostr/social-notifications-runtime-service.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [ ] **Step 1: Crear runtime service sobre transporte NDK existente**
Implementar `createRuntimeSocialNotificationsService` reutilizando:
- `createLazyNdkDmTransport` para `subscribe` y `fetchBackfill`
- resolucion de relays con `loadRelaySettings` y fallback `getBootstrapRelays`

- [ ] **Step 2: Definir filtros Nostr**
Usar filtros con `#p: [ownerPubkey]` y `kinds: [1, 6, 7, 9735]`.

- [ ] **Step 3: Carga inicial ordenada y limitada**
Para `loadInitialSocial`, ordenar por `created_at desc`, dedupe por `id`, limite inicial recomendado `120`.

- [ ] **Step 4: Exponer inyeccion opcional para tests**
Extender `NostrOverlayServices` con `socialNotificationsService?: SocialNotificationsService` (solo wiring, sin romper APIs actuales).

- [ ] **Step 5: Verificar compilacion de cambios de dominio**
Run: `pnpm typecheck`
Expected: PASS.

## Chunk 2: Store + Unread Logic + Snapshot Behavior

### Task 3: Implementar store/hook `useSocialNotifications`

**Files:**
- Create: `src/nostr-overlay/hooks/useSocialNotifications.ts`

- [ ] **Step 1: Crear estado y acciones del store**
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

- [ ] **Step 2: Persistencia local robusta**
Storage key: `nostr-overlay:social:v1:last-read:<ownerPubkey>`
Parse seguro con fallback a `0`.

- [ ] **Step 3: Regla unread estilo Snort/Primal**
`hasUnread = items.some((item) => item.createdAt > lastReadAt)`.

- [ ] **Step 4: Implementar mark-as-read al abrir + snapshot**
En `openDialog()`:
1. Capturar IDs pendientes actuales como snapshot.
2. Setear `lastReadAt = now`.
3. Recalcular `hasUnread` a `false` (si no entra nada nuevo).

- [ ] **Step 5: Reglas de inclusion y exclusiones**
Incluir solo sociales para owner:
- `kind 1` con `p` al owner (menciones/replies)
- `kind 6` repost a contenido del owner
- `kind 7` reaccion a contenido del owner
- `kind 9735` zap receipt al owner

Excluir:
- eventos del propio owner (`event.pubkey === ownerPubkey`)
- eventos malformados/duplicados

- [ ] **Step 6: Limite de memoria**
Conservar maximo `200` notificaciones en memoria.

### Task 4: Tests del hook/store (TDD)

**Files:**
- Create: `src/nostr-overlay/hooks/useSocialNotifications.test.ts`

- [ ] **Step 1: Red test - unread on ingest**
Verificar que llega evento social nuevo y `hasUnread` pasa a `true`.

- [ ] **Step 2: Red test - openDialog marks read**
Verificar que `openDialog()` limpia badge y actualiza `lastReadAt`.

- [ ] **Step 3: Red test - snapshot se mantiene visible**
Verificar que el listado del dialog usa snapshot de pendientes aunque `hasUnread` se limpie.

- [ ] **Step 4: Red test - dedupe por id**
Mismo `event.id` no duplica item.

- [ ] **Step 5: Red test - aislamiento por owner storage**
`lastReadAt` de owner A no afecta owner B.

- [ ] **Step 6: Implementar minimo para verde**
Completar hook/store hasta hacer pasar los tests.

- [ ] **Step 7: Ejecutar tests del hook**
Run: `pnpm test:unit -- src/nostr-overlay/hooks/useSocialNotifications.test.ts`
Expected: PASS.

## Chunk 3: UI Components + App Integration

### Task 5: Crear `NotificationsIconButton` y `NotificationsModal`

**Files:**
- Create: `src/nostr-overlay/components/NotificationsIconButton.tsx`
- Create: `src/nostr-overlay/components/NotificationsModal.tsx`
- Create: `src/nostr-overlay/components/NotificationsModal.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 1: Implementar icon button**
- campana SVG
- `aria-label="Abrir notificaciones"`
- `title="Notificaciones"`
- dot rojo sin numero cuando `hasUnread`

- [ ] **Step 2: Implementar modal**
- `Dialog` con titulo `Notificaciones`
- lista de snapshot pendientes
- empty state: `No tienes notificaciones pendientes`
- boton cerrar consistente con estilo overlay

- [ ] **Step 3: Estilos**
Agregar clases nuevas siguiendo estilo actual (`nostr-*`) y reutilizar patrones visuales ya existentes (chat/settings).

- [ ] **Step 4: Tests del modal**
Cubrir:
- render empty
- render lista
- close callback

- [ ] **Step 5: Ejecutar tests del modal**
Run: `pnpm test:unit -- src/nostr-overlay/components/NotificationsModal.test.tsx`
Expected: PASS.

### Task 6: Integrar notificaciones en `App.tsx` (toolbar normal y compacta)

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Wire del hook**
Inicializar `useSocialNotifications` con:
- `ownerPubkey`
- `socialNotificationsService` runtime o inyectado desde `services`

- [ ] **Step 2: Agregar icono en toolbar expandida**
Ubicar junto al grupo de acciones (settings/regenerar/chats/stats), respetando orden existente del layout.

- [ ] **Step 3: Agregar icono en toolbar compacta**
Insertar boton equivalente en modo panel colapsado.

- [ ] **Step 4: Abrir modal y aplicar mark-as-read al abrir**
Click icono -> `openDialog()` -> render `NotificationsModal`.

- [ ] **Step 5: Actualizar tests de App**
Agregar/ajustar asserts para:
- presencia del boton en ambos modos
- dot visible con pendientes
- al abrir modal desaparece dot y lista snapshot se muestra

- [ ] **Step 6: Ejecutar tests de App**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx`
Expected: PASS.

## Chunk 4: Verification + Manual Review + Single Commit

### Task 7: Verificacion tecnica final

**Files:**
- Verify: `src/nostr/**`
- Verify: `src/nostr-overlay/**`

- [ ] **Step 1: Ejecutar suites foco**
Run:
- `pnpm test:unit -- src/nostr-overlay/hooks/useSocialNotifications.test.ts`
- `pnpm test:unit -- src/nostr-overlay/components/NotificationsModal.test.tsx`
- `pnpm test:unit -- src/nostr-overlay/App.test.tsx`

- [ ] **Step 2: Ejecutar typecheck**
Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Ejecutar build**
Run: `pnpm build`
Expected: PASS.

### Task 8: Revision manual y commit unico

**Files:**
- Modify: all touched files from tasks anteriores

- [ ] **Step 1: Preparar resumen para revision manual del usuario**
Incluir: cambios funcionales, comportamiento badge, flujo abrir modal => mark read.

- [ ] **Step 2: Esperar aprobacion manual explicita**
No commitear hasta confirmacion del usuario.

- [ ] **Step 3: Crear commit unico final**
Run:
```bash
git add src/nostr/social-notifications-service.ts src/nostr/social-notifications-runtime-service.ts src/nostr-overlay/hooks/useSocialNotifications.ts src/nostr-overlay/hooks/useSocialNotifications.test.ts src/nostr-overlay/components/NotificationsIconButton.tsx src/nostr-overlay/components/NotificationsModal.tsx src/nostr-overlay/components/NotificationsModal.test.tsx src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/styles.css src/nostr-overlay/hooks/useNostrOverlay.ts
git commit -m "feat: add social notifications bell with unread dot and pending dialog"
```

- [ ] **Step 4: Validar working tree limpio post-commit**
Run: `git status`
Expected: clean (o solo cambios no relacionados preexistentes).
