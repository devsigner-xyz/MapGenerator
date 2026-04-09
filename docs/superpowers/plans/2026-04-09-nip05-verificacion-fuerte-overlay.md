# Nostr Overlay: NIP-05 Verificacion Fuerte + npub + Overlay Verde Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar verificacion fuerte NIP-05 (DNS `/.well-known/nostr.json`) con cache y fallback robusto, mostrar `npub` en listados, mostrar identificador/estado de verificacion junto al username (sidebar, perfil propio y modal), habilitar busqueda por `npub`, y agregar opcion para pintar en verde edificios ocupados por usuarios NIP-05 verificados.

**Architecture:** Separar la verificacion NIP-05 en un modulo de dominio (`src/nostr/nip05.ts`) reutilizable, con resultado tipado (`verified`, `unverified`, `error`) y cache TTL con dedupe de requests en vuelo. Consumir ese estado desde un hook de overlay para decorar UI y derivar indices de edificios verificados. Extender el bridge mapa para enviar indices verificados al renderer canvas, manteniendo prioridad visual de estados (`selected/hovered` por encima de `verified`).

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `nostr-tools` (existente), cache TTL interna (`createTtlCache`), shadcn/ui.

---

## Chunk 1: Dominio NIP-05 (verificacion fuerte)

### Task 1: Extender tipos de perfil para transportar `nip05`

**Files:**
- Modify: `src/nostr/types.ts`
- Modify: `src/nostr/profiles.ts`

- [ ] Agregar `nip05?: string` a `NostrProfile`.
- [ ] Extender `MetadataContent` con `nip05?: string` y mapearlo en `parseProfileMetadata`.
- [ ] Mantener compatibilidad con metadata invalida (`try/catch` existente).

### Task 2: Crear modulo de verificacion NIP-05 con timeout y cache

**Files:**
- Create: `src/nostr/nip05.ts`
- Modify: `src/nostr/cache.ts` (solo si hace falta helper para TTL diferenciada)
- Test: `src/nostr/nip05.test.ts`

- [ ] Definir tipos: `Nip05ValidationStatus = 'verified' | 'unverified' | 'error'` y `Nip05ValidationResult` con `identifier`, `status`, `resolvedPubkey?`, `error?`, `checkedAt`.
- [ ] Implementar parser estricto para `name@domain` y caso `_@domain`.
- [ ] Implementar fetch a `https://<domain>/.well-known/nostr.json?name=<name>` con `AbortController` (timeout 3500ms).
- [ ] Validar respuesta JSON (`names` object) y comparar pubkey case-insensitive en hex.
- [ ] Implementar cache en memoria con TTL: `verified/unverified` 15 min, `error` 3 min.
- [ ] Implementar dedupe por clave para evitar requests duplicados concurrentes.
- [ ] Cubrir tests: match valido, mismatch, formato invalido, JSON invalido, timeout/error de red, dedupe.

### Task 3: Verificacion del chunk 1

**Files:**
- Test: `src/nostr/nip05.test.ts`
- Test: `src/nostr/cache.test.ts`

- [ ] Run: `pnpm vitest run src/nostr/nip05.test.ts src/nostr/cache.test.ts`
- [ ] Expected: PASS en validacion fuerte, fallback y cache.

## Chunk 2: Integracion overlay (estado de verificacion + UI identidad)

### Task 4: Crear hook de verificacion para pubkeys visibles

**Files:**
- Create: `src/nostr-overlay/hooks/useNip05Verification.ts`
- Modify: `src/nostr-overlay/App.tsx`

- [ ] Implementar hook que reciba `profiles` + lista de pubkeys relevantes y produzca `verificationByPubkey`.
- [ ] Incluir pubkeys relevantes: owner, follows, followers visibles, ocupantes de edificios y perfil activo del modal.
- [ ] Ejecutar validaciones en background con concurrencia limitada (4 simultaneas).
- [ ] No bloquear render principal; actualizar estado de forma incremental.

### Task 5: Mostrar `npub` y badge de verificacion en listados/perfil/modal

**Files:**
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/components/OccupantProfileModal.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] Reemplazar subtitulo con hash corto por `npub` truncada en `PeopleListTab`.
- [ ] Crear patron visual comun: texto `nip05` + check solo cuando `status === 'verified'`.
- [ ] Renderizar badge junto al username en:
- [ ] `PeopleListTab` (filas de seguidos/seguidores),
- [ ] `ProfileTab` (perfil propio),
- [ ] `OccupantProfileModal` (header de perfil).
- [ ] Si `status === 'error'`, mostrar solo identificador sin check (degradacion suave).
- [ ] Mantener sin cambios los usernames sobre el mapa (no agregar badge en `MapPresenceLayer`).

### Task 6: Habilitar busqueda por `npub` ademas de username/pubkey

**Files:**
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`

- [ ] Extender `filteredFollowingPeople` para comparar query contra `encodeHexToNpub(pubkey)`.
- [ ] Mantener busqueda actual por `displayName`, `name` y hex pubkey.
- [ ] Asegurar que entradas invalidas no rompan filtro (fallback a cadena vacia).

### Task 7: Verificacion del chunk 2

**Files:**
- Test: `src/nostr-overlay/components/PeopleListTab.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Escribir primero tests que fallen por ausencia de `npub` en listado y ausencia de filtro por `npub`.
- [ ] Escribir tests de render para estado `verified` (check visible) y `unverified/error` (sin check).
- [ ] Run: `pnpm vitest run src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/App.test.tsx`
- [ ] Expected: PASS con cobertura de busqueda `npub` y badges.

## Chunk 3: Overlay verde de edificios verificados (toggleable)

### Task 8: Agregar setting persistente para overlay de verificados

**Files:**
- Modify: `src/nostr/ui-settings.ts`
- Modify: `src/nostr/ui-settings.test.ts`
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsModal.test.tsx`

- [ ] Agregar `verifiedBuildingsOverlayEnabled: boolean` al estado UI (default `false`).
- [ ] Persistir/cargar en localStorage con normalizacion booleana.
- [ ] Agregar toggle en seccion UI de settings (`aria-label` estable para test).
- [ ] Emitir `onUiSettingsChange` cuando cambie el toggle.

### Task 9: Extender puente mapa para indices verificados

**Files:**
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`
- Modify: `src/main.ts`
- Modify: `src/ts/ui/main_gui.ts`

- [ ] Agregar API opcional `setVerifiedBuildingIndexes?(indexes: number[])` en `MapMainApi`.
- [ ] Exponer `setVerifiedBuildingIndexes(indexes: number[])` en `MapBridge` y delegar al main API.
- [ ] Implementar metodo en `Main` que delegue a `mainGui`.
- [ ] En `MainGui`, guardar set de indices verificados y disparar redraw al cambiar.

### Task 10: Pintar edificios verificados en verde con prioridad visual correcta

**Files:**
- Modify: `src/ts/ui/style.ts`
- Modify: `src/ts/ui/style-occupancy.test.ts`

- [ ] Extender `BuildingRenderState` con `verified`.
- [ ] Definir color verde para `verified` (fill + stroke) en `resolveBuildingRenderColours`.
- [ ] Ajustar resolucion de estado en `MainGui.getBuildingRenderStates`:
- [ ] Prioridad: `modalHighlighted/hovered` > `selected` > `verified` > `occupied` > `empty`.
- [ ] Mantener consistencia en modo 2D y pseudo-3D.
- [ ] Agregar tests de color y prioridad.

### Task 11: Conectar estado verificado desde App al mapa

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Derivar `verifiedBuildingIndexes` desde `overlay.occupancyByBuildingIndex` + `verificationByPubkey`.
- [ ] Aplicar al bridge solo cuando `uiSettings.verifiedBuildingsOverlayEnabled === true`.
- [ ] En caso contrario, enviar lista vacia para desactivar overlay.
- [ ] Verificar en test que el bridge recibe indices correctos segun toggle y estado de verificacion.

### Task 12: Verificacion del chunk 3

**Files:**
- Test: `src/nostr/ui-settings.test.ts`
- Test: `src/nostr-overlay/components/MapSettingsModal.test.tsx`
- Test: `src/nostr-overlay/map-bridge.test.ts`
- Test: `src/ts/ui/style-occupancy.test.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Run: `pnpm vitest run src/nostr/ui-settings.test.ts src/nostr-overlay/components/MapSettingsModal.test.tsx src/nostr-overlay/map-bridge.test.ts src/ts/ui/style-occupancy.test.ts src/nostr-overlay/App.test.tsx`
- [ ] Expected: PASS con cobertura de toggle + bridge + render verde.

## Chunk 4: Cierre, hardening y verificacion final

### Task 13: Hardening de errores y UX de fallback

**Files:**
- Modify: `src/nostr/nip05.ts`
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/components/OccupantProfileModal.tsx`

- [ ] Asegurar que fallos de red/CORS no rompen UI y no eliminan identificador `nip05` textual.
- [ ] Evitar retry loops agresivos (respetar TTL de error).
- [ ] Normalizar visualizacion de `_@domain` a `domain` para etiqueta visible.

### Task 14: Verificacion global

**Files:**
- Test: `src/nostr/**/*.test.ts`
- Test: `src/nostr-overlay/**/*.test.tsx`
- Test: `src/ts/ui/style-occupancy.test.ts`

- [ ] Run: `pnpm vitest run src/nostr/nip05.test.ts src/nostr/ui-settings.test.ts src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/components/MapSettingsModal.test.tsx src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/App.test.tsx src/ts/ui/style-occupancy.test.ts`
- [ ] Expected: PASS en todos los tests afectados.
- [ ] Run: `pnpm typecheck`
- [ ] Expected: sin errores TypeScript.
- [ ] Run: `pnpm build`
- [ ] Expected: build exitoso.

## Riesgos y mitigaciones

- [ ] **Riesgo:** falsos no-verificados por CORS/timeouts del dominio. **Mitigacion:** estado `error` separado de `unverified`, cache de error corta, UI degradada sin bloquear.
- [ ] **Riesgo:** costo de red al verificar listas grandes. **Mitigacion:** cache TTL + dedupe + concurrencia limitada + verificacion lazy de visibles.
- [ ] **Riesgo:** conflicto visual entre `selected/hovered` y `verified`. **Mitigacion:** prioridad explicita de estados + tests de precedencia.
- [ ] **Riesgo:** regresion en busqueda existente. **Mitigacion:** mantener condiciones actuales y agregar solo rama `npub` con tests.

## Criterios de aceptacion

- [ ] En lista de seguidores/seguidos se muestra `npub` (no hash corto hex) y, si aplica, identificador NIP-05 junto al username.
- [ ] Pegar `npub` en busqueda de seguidos devuelve resultados correctos.
- [ ] Perfil propio y modal de detalle muestran identificador NIP-05 junto al username, con check solo si validacion DNS da match.
- [ ] Usernames sobre el mapa no muestran badge NIP-05.
- [ ] Existe opcion de settings para activar/desactivar overlay verde de edificios con ocupantes verificados.
- [ ] Con toggle activo, edificios de usuarios verificados se pintan en verde; con toggle inactivo no.
