# Agora Feed Layout Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una preferencia persistida para ver el feed principal de Agora en `Lista` o `Masonry`, con selector rápido en la cabecera y control equivalente en `Configuración > Interfaz`, sin afectar al detalle de nota.

**Architecture:** El cambio reutiliza `ui-settings` como fuente de verdad persistida y propaga `agoraFeedLayout` desde `App.tsx` hacia `FollowingFeedSurface` y `SettingsUiPage`. El feed principal mantiene su contenedor scrollable actual y solo cambia sus clases/layout cuando el usuario elige `masonry`, usando CSS scopeado al listado principal de Agora.

**Tech Stack:** React 19, TypeScript, CSS, shadcn/ui ToggleGroup, Vitest.

---

## File Structure (locked before tasks)

### Modify

- `src/nostr/ui-settings.ts`
  - Añadir tipo y normalización de `agoraFeedLayout`.
  - Persistir la nueva preferencia en `loadUiSettings` y `saveUiSettings`.
- `src/nostr/ui-settings.test.ts`
  - Cubrir default, persistencia y normalización del nuevo campo.
- `src/nostr-overlay/App.tsx`
  - Propagar el layout de Agora y añadir callback persistido para cambios rápidos.
- `src/nostr-overlay/components/FollowingFeedSurface.tsx`
  - Añadir `ToggleGroup` en la cabecera del feed principal.
  - Ocultarlo cuando haya detalle activo.
- `src/nostr-overlay/components/FollowingFeedContent.tsx`
  - Recibir el layout activo.
  - Separar wrapper interno de notas y footer/estado de carga.
  - Añadir clases del modo `list` / `masonry` solo al feed principal.
- `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Mantener o tocar solo helpers/props compartidos si hace falta.
- `src/nostr-overlay/components/FollowingFeedLayout.test.tsx`
  - Añadir coverage focalizada del selector, clases `list`/`masonry`, hashtag, estados y scroll/paginación.
- `src/nostr-overlay/components/settings-pages/SettingsUiPage.tsx`
  - Añadir el control equivalente en `Configuración > Interfaz`.
- `src/nostr-overlay/components/settings-pages/SettingsUiPage.test.tsx`
  - Añadir test del control y persistencia del valor enviado.
- `src/nostr-overlay/App.test.tsx`
  - Mantener o tocar solo helpers compartidos si hace falta.
- `src/nostr-overlay/App.agora-layout.test.tsx`
  - Añadir integración focalizada de sincronización entre cabecera de Agora, `Configuración > Interfaz` y persistencia.
- `src/nostr-overlay/styles.css`
  - Añadir estilos scopeados para `list` y `masonry`, con 2 columnas máximo.

---

## Chunk 1: Persisted setting + Agora header selector

### Task 1: RED para `ui-settings`

**Files:**
- Modify: `src/nostr/ui-settings.test.ts`

- [ ] **Step 1: Escribir tests RED del nuevo campo `agoraFeedLayout`**

Casos:
- `getDefaultUiSettings()` devuelve `agoraFeedLayout: 'list'`
- `saveUiSettings()` persiste `list`
- `saveUiSettings()` persiste `masonry`
- `loadUiSettings()` normaliza un valor inválido a `list`

- [ ] **Step 2: Ejecutar tests RED de `ui-settings`**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts`
Expected: FAIL porque el campo `agoraFeedLayout` aún no existe.

### Task 2: Implementar persistencia de `agoraFeedLayout`

**Files:**
- Modify: `src/nostr/ui-settings.ts`

- [ ] **Step 3: Añadir el tipo del layout de Agora**

Objetivo:

```ts
export type AgoraFeedLayout = 'list' | 'masonry';
```

- [ ] **Step 4: Añadir el campo al payload y al estado**

Objetivo:

```ts
interface UiSettingsPayload {
  agoraFeedLayout?: AgoraFeedLayout;
}

export interface UiSettingsState {
  agoraFeedLayout: AgoraFeedLayout;
}
```

- [ ] **Step 5: Añadir default y normalizador mínimo**

Objetivo:

```ts
const DEFAULT_AGORA_FEED_LAYOUT: AgoraFeedLayout = 'list';

function normalizeAgoraFeedLayout(value: unknown): AgoraFeedLayout {
  return value === 'masonry' ? 'masonry' : 'list';
}
```

- [ ] **Step 6: Conectar `loadUiSettings()` y `saveUiSettings()`**

Expected behavior:
- `loadUiSettings()` devuelve el valor normalizado
- `saveUiSettings()` lo escribe en el payload persistido

- [ ] **Step 7: Ejecutar GREEN de `ui-settings`**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts`
Expected: PASS.

### Task 3: RED para el selector rápido de Agora

**Files:**
- Create: `src/nostr-overlay/components/FollowingFeedLayout.test.tsx`

- [ ] **Step 8: Escribir tests RED del selector de layout en cabecera**

Casos:
- aparece un selector con `Lista` y `Masonry` cuando `activeThread` es `null`
- el valor activo refleja el prop recibido
- al cambiar a `masonry` se llama al callback esperado
- no aparece cuando hay detalle activo
- sigue visible cuando hay filtro por hashtag en el feed principal

- [ ] **Step 9: Ejecutar RED del selector rápido**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedLayout.test.tsx`
Expected: FAIL porque el selector aún no existe.

### Task 4: Implementar wiring y selector rápido

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Create: `src/nostr-overlay/App.agora-layout.test.tsx`

- [ ] **Step 10: Escribir test RED en `App.agora-layout.test.tsx` para el wiring real del selector superior**

Casos:
- cambiar el selector de cabecera actualiza `uiSettings.agoraFeedLayout`
- el valor queda persistido en `localStorage`

- [ ] **Step 11: Ejecutar RED del wiring real del selector superior**

Run: `pnpm vitest run src/nostr-overlay/App.agora-layout.test.tsx`
Expected: FAIL por la cobertura nueva del wiring real del selector superior.

- [ ] **Step 12: Añadir callback persistido en `App.tsx`**

Objetivo:
- reutilizar `setUiSettings((current) => saveUiSettings({...current, agoraFeedLayout: nextLayout }))`
- pasar `uiSettings.agoraFeedLayout` a `FollowingFeedSurface`

- [ ] **Step 13: Añadir props nuevas en `FollowingFeedSurface`**

Objetivo:

```ts
agoraFeedLayout: AgoraFeedLayout;
onAgoraFeedLayoutChange: (layout: AgoraFeedLayout) => void;
```

- [ ] **Step 14: Renderizar `ToggleGroup` en la cabecera del feed principal**

Objetivo:
- usar `ToggleGroup` de selección exclusiva
- `type="single"` y `required`
- opciones `Lista` y `Masonry`
- mantenerlo junto a `Actualizar` y CTA de nuevas publicaciones
- ocultarlo cuando `activeThread` esté abierto
- mantenerlo visible si el feed principal está filtrado por hashtag

- [ ] **Step 15: Ejecutar GREEN de Chunk 1**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts src/nostr-overlay/components/FollowingFeedLayout.test.tsx src/nostr-overlay/App.agora-layout.test.tsx`
Expected: PASS en los tests añadidos de persistencia y selector rápido para este chunk.

## Chunk 2: Feed layout classes + settings page + CSS

### Task 5: RED para clases de layout del feed principal

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedLayout.test.tsx`

- [ ] **Step 16: Escribir tests RED del contenedor del feed**

Casos:
- modo `list` expone la clase de layout `list`
- modo `masonry` expone la clase de layout `masonry`
- el detalle de nota no hereda ninguna clase específica del layout principal
- el footer de carga queda fuera del wrapper masonry
- el scroll del feed sigue pudiendo disparar `onLoadMoreFeed` en `masonry`
- `loading`, `empty` y `error` conservan el layout actual fuera del flujo masonry
- el layout elegido sigue aplicando cuando el feed principal está filtrado por hashtag

- [ ] **Step 17: Ejecutar RED del layout del feed**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedLayout.test.tsx`
Expected: FAIL porque las clases del layout aún no existen.

### Task 6: Implementar clases y CSS del feed principal

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 18: Añadir prop de layout a `FollowingFeedContent`**

Objetivo:

```ts
agoraFeedLayout?: AgoraFeedLayout;
```

- [ ] **Step 19: Pasar `agoraFeedLayout` desde `FollowingFeedSurface` a `FollowingFeedContent`**

Objetivo:
- propagar sin transformar el valor recibido desde `App.tsx`
- mantener el detalle de nota sin depender de esta prop

- [ ] **Step 20: Aplicar clase de layout solo al feed principal**

Objetivo:
- añadir al `div[data-testid="following-feed-list"]` una clase derivada del layout activo
- no tocar el contenedor del detalle

- [ ] **Step 21: Separar wrapper de notas y footer/estado de carga**

Objetivo:
- crear un nodo interno para las notas del feed principal
- aplicar masonry solo a ese wrapper
- dejar `ListLoadingFooter` como hermano fuera del flujo de columnas

- [ ] **Step 22: Implementar CSS de `list` sin cambiar el comportamiento actual**

Contrato:
- `list` sigue siendo una sola columna
- `nostr-following-feed-note-shell` conserva el ancho actual

- [ ] **Step 23: Implementar CSS de `masonry` con máximo 2 columnas**

Contrato:
- móvil: 1 columna
- `min-width: 900px`: 2 columnas
- usar CSS columns sobre el listado principal
- cada `.nostr-following-feed-note-shell` usa `break-inside: avoid`
- `ListLoadingFooter` mantiene ancho completo fuera del masonry
- no introducir una tercera columna

- [ ] **Step 24: Ejecutar GREEN del layout del feed**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedLayout.test.tsx`
Expected: PASS en las comprobaciones del layout principal.

### Task 7: RED para `Configuración > Interfaz`

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsUiPage.test.tsx`

- [ ] **Step 25: Escribir tests RED del control de layout de Agora en settings**

Casos:
- aparece el control con `Lista` y `Masonry`
- al cambiarlo emite `onPersistUiSettings` con `agoraFeedLayout` actualizado

- [ ] **Step 26: Ejecutar RED de settings UI**

Run: `pnpm vitest run src/nostr-overlay/components/settings-pages/SettingsUiPage.test.tsx`
Expected: FAIL porque el control aún no existe.

### Task 8: Implementar control en `Configuración > Interfaz`

**Files:**
- Modify: `src/nostr-overlay/components/settings-pages/SettingsUiPage.tsx`

- [ ] **Step 27: Añadir el control exclusivo del layout de Agora**

Contrato:
- visible dentro de `Interfaz`
- usa `ToggleGroup` con `type="single"` y `required`
- valores `list` y `masonry`
- actualiza `onPersistUiSettings({ ...uiSettings, agoraFeedLayout: nextLayout })`

- [ ] **Step 28: Ejecutar GREEN de settings UI**

Run: `pnpm vitest run src/nostr-overlay/components/settings-pages/SettingsUiPage.test.tsx`
Expected: PASS.

### Task 9: RED y GREEN de sincronización de fuente de verdad

**Files:**
- Modify: `src/nostr-overlay/App.agora-layout.test.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsUiPage.tsx`

- [ ] **Step 29: Escribir test RED de sincronización App -> Agora/settings**

Casos:
- cambiar el selector de la cabecera actualiza la preferencia visible al abrir `Configuración > Interfaz`
- cambiar el control en settings deja el feed principal de Agora con el layout esperado al volver

- [ ] **Step 30: Ejecutar RED de sincronización**

Run: `pnpm vitest run src/nostr-overlay/App.agora-layout.test.tsx`
Expected: FAIL porque la sincronización aún no está cubierta o implementada del todo.

- [ ] **Step 31: Ajustar el wiring compartido para que settings y cabecera usen exactamente la misma fuente de verdad**

Objetivo:
- verificar que ambos controles reciben `uiSettings.agoraFeedLayout` desde `App.tsx`
- verificar que ambos callbacks acaban en `saveUiSettings({...current, agoraFeedLayout: nextLayout })`
- eliminar cualquier estado duplicado local que impida la sincronización

- [ ] **Step 32: Ejecutar GREEN de sincronización App -> Agora/settings**

Run: `pnpm vitest run src/nostr-overlay/App.agora-layout.test.tsx`
Expected: PASS.

### Task 10: Verificación final

**Files:**
- No file changes required

- [ ] **Step 33: Ejecutar la batería enfocada del cambio**

Run: `pnpm vitest run src/nostr/ui-settings.test.ts src/nostr-overlay/components/FollowingFeedLayout.test.tsx src/nostr-overlay/components/settings-pages/SettingsUiPage.test.tsx src/nostr-overlay/App.agora-layout.test.tsx`
Expected: PASS con 0 failures.

- [ ] **Step 34: Ejecutar comprobación manual rápida del layout**

Run: `pnpm dev` y abrir la ruta de Agora en navegador local.
Expected checklist:
- `Lista` sigue mostrando una nota por fila
- `Masonry` muestra 1 columna en móvil y 2 columnas máximo en desktop
- cambiar el selector superior persiste el ajuste
- el control en `Configuración > Interfaz` refleja y persiste el mismo valor
- el detalle de nota no cambia
