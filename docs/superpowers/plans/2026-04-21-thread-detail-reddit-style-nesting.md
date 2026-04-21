# Thread Detail Reddit Style Nesting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el detalle de una nota renderice replies con rail visual tipo Reddit, ancho completo del hilo y tope visual de 4 niveles sin cambiar la semántica real del árbol.

**Architecture:** El cambio queda aislado al detalle de hilo de `FollowingFeedContent`: se añade un wrapper estable `thread-node > thread-row > thread-indent + thread-body`, se calcula una profundidad visual capada a 4 y se scopean los estilos al detalle con una clase explícita del contenedor. La `NoteCard` sigue siendo una caja negra y el feed principal no cambia.

**Tech Stack:** React 19, TypeScript, CSS, Vitest.

---

## File Structure (locked before tasks)

### Modify

- `src/nostr-overlay/components/FollowingFeedContent.tsx`
  - Añadir helper local `getVisualThreadDepth(depth)`.
  - Cambiar el markup del detalle para root/replies con wrappers y rails explícitos.
  - Aplicar clase `nostr-following-feed-thread-list-detail` al contenedor del hilo en todos sus estados.
- `src/nostr-overlay/styles.css`
  - Mantener `max-width: 600px` en feed.
  - Quitar ese límite en `.nostr-following-feed-thread-list-detail`.
  - Implementar layout de rail y responsive del hilo.
- `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - Añadir pruebas RED/GREEN del contrato DOM, ownership de anidación, cap visual, estados del detalle y regresión funcional.

---

## Chunk 1: Thread detail DOM contract + styles (TDD)

### Task 1: RED para root wrapper

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 1: Escribir tests RED de root wrapper**

Casos:
- root con `data-depth="0"` y `data-visual-depth="0"`
- root con `.nostr-following-feed-thread-indent` y 0 rails
- root sin replies sigue renderizando wrapper raíz estable

- [ ] **Step 2: Ejecutar RED de root wrapper**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: FAIL por los nuevos tests de root wrapper.

### Task 2: RED para ownership de anidación real

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 3: Escribir tests RED de jerarquía real**

Casos:
- hijo directo con 1 rail
- reply hijo de otro reply queda dentro de la rama correcta
- replies hermanas de la raíz no se anidan falsamente entre sí

- [ ] **Step 4: Ejecutar RED de jerarquía real**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: FAIL por los nuevos tests de jerarquía real.

### Task 3: RED para cap visual y estados del detalle

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 5: Escribir tests RED de cap visual y detalle across states**

Casos:
- profundidad real > 4 con `data-visual-depth="4"` y 4 rails
- `nostr-following-feed-thread-list-detail` existe en loading, empty, error y loaded
- `activeThread.root === null` mantiene loading/empty state actual sin wrapper raíz placeholder

- [ ] **Step 6: Ejecutar RED de cap visual y estados**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: FAIL por los nuevos tests de cap visual y estados.

### Task 4: RED para regresión funcional

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 7: Escribir tests RED de acciones y aislamiento del feed**

Casos:
- replies de hilo siguen exponiendo botones/handlers de reply, reaction, repost y zap
- feed principal no hereda la clase de detalle

- [ ] **Step 8: Ejecutar RED de regresión funcional**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: FAIL o cobertura faltante en las nuevas comprobaciones funcionales.

### Task 5: Implementar contrato DOM del hilo

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`

- [ ] **Step 9: Añadir helper local de profundidad visual**

```ts
const MAX_THREAD_VISUAL_DEPTH = 4;

function getVisualThreadDepth(depth: number): number {
  return Math.min(depth, MAX_THREAD_VISUAL_DEPTH);
}
```

- [ ] **Step 10: Cambiar el root del hilo al wrapper estable**

Estructura objetivo cuando `activeThread.root` exista:

```tsx
<div className="nostr-following-feed-thread-node" data-depth={0} data-visual-depth={0}>
  <div className="nostr-following-feed-thread-row">
    <div className="nostr-following-feed-thread-indent" aria-hidden="true" />
    <div className="nostr-following-feed-thread-body">
      <NoteCard ... />
    </div>
  </div>
</div>
```

- [ ] **Step 11: Cambiar el render recursivo de replies al wrapper con rails**

Estructura objetivo por reply:

```tsx
const visualDepth = getVisualThreadDepth(depth);

<div className="nostr-following-feed-thread-node" data-depth={depth} data-visual-depth={visualDepth}>
  <div className="nostr-following-feed-thread-row">
    <div className="nostr-following-feed-thread-indent" aria-hidden="true">
      {Array.from({ length: visualDepth }).map((_, index) => (
        <span key={index} className="nostr-following-feed-thread-rail" data-rail-index={index + 1} />
      ))}
    </div>
    <div className="nostr-following-feed-thread-body">
      <NoteCard ... />
    </div>
  </div>
  {childReplies.length > 0 ? <div className="nostr-following-feed-thread-children">...</div> : null}
</div>
```

- [ ] **Step 12: Aplicar `nostr-following-feed-thread-list-detail` al contenedor del detalle en todos sus estados**

El `div` del thread list debe quedar con ambas clases:

```tsx
className="nostr-following-feed-thread-list nostr-following-feed-thread-list-detail ..."
```

- [ ] **Step 13: Ejecutar GREEN del contrato DOM**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS en las comprobaciones DOM añadidas; si aún fallan expectativas de layout fino, registrar exactamente cuáles quedan para la fase CSS.

### Task 6: Implementar CSS del detalle de hilo

**Files:**
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 14: Separar ancho de feed vs detalle de hilo**

```css
.nostr-following-feed-list {
  max-width: 600px;
}

.nostr-following-feed-thread-list.nostr-following-feed-thread-list-detail {
  width: 100%;
  max-width: none;
}
```

- [ ] **Step 15: Implementar `thread-row` y `thread-body`**

Ownership:
- `thread-row`: `display: grid`, columnas `auto minmax(0, 1fr)`
- `thread-body`: `min-width: 0`

- [ ] **Step 16: Implementar `thread-indent` y `thread-rail`**

Ownership:
- `thread-indent`: layout horizontal de rails y gap con el body
- `thread-rail`: línea vertical visible y ancho fijo por rail
- desktop/tablet > 640px: ancho por rail `14px`, gap rail-contenido `10px`

- [ ] **Step 17: Implementar `thread-node` y `thread-children`**

Ownership:
- `thread-node`: espaciado vertical por nodo
- `thread-children`: cuelga la rama sin falsa indentación extra fuera del sistema de rails

- [ ] **Step 18: Añadir responsive <= 640px**

Contrato:
- móvil <= 640px: ancho por rail `10px`, gap rail-contenido `6px`
- el cap visual de 4 niveles se mantiene

- [ ] **Step 19: Ejecutar verificación del archivo target tras CSS**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS.

- [ ] **Step 20: Ejecutar verificación manual del contrato de ancho/layout**

Validar manualmente en la UI o mediante snapshot/browser que:
- el detalle usa ancho completo y no queda limitado a 600px
- el feed principal no cambia de ancho por efecto colateral del CSS scopeado

### Task 7: Verificación final

**Files:**
- No file changes required

- [ ] **Step 21: Ejecutar verificación final relacionada con Agora thread UI**

Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS con 0 failures tras todo el cambio.

- [ ] **Step 22: Verificación manual de layout responsive y profundidad**

Validar manualmente en la UI o mediante snapshot/browser que:
- el detalle usa ancho completo y no queda limitado a 600px
- en desktop los rails son legibles hasta nivel 4
- en viewport <= 640px la rama sigue siendo legible con rails más estrechos
- profundidad > 4 deja de crecer visualmente
