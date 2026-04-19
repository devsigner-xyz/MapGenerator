# Agora Thread Header And Compose Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar la vista de hilo de `Agora` para mover `Volver al Agora` al bloque derecho del header, mostrar la carga inicial del hilo con `Empty + Spinner` centrado, y rehacer ambos composers con una fila inferior de acciones que incluya un iconbutton de imagen a la izquierda y el CTA de envio a la derecha.

**Architecture:** El cambio queda acotado a `FollowingFeedContent.tsx`, que ya centraliza el header, el estado del hilo y los dos composers. La validacion se concentra en `FollowingFeedSurface.test.tsx`, cubriendo primero RED para los nuevos contratos visuales y luego GREEN tras la implementacion minima, sin extraer componentes nuevos ni tocar logica de publicacion.

**Tech Stack:** React, TypeScript, Vitest, shadcn/ui, lucide-react

---

## Chunk 1: Thread Header And Compose UI

### Task 1: Tests del header, loading inicial y acciones del composer

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Spec: `docs/superpowers/specs/2026-04-19-agora-thread-header-and-compose-design.md`

- [ ] **Step 1: Escribir primero los tests que fallen para el nuevo contrato visual**
  - anadir una asercion que exija `button` con texto `Volver al Agora` dentro de `.nostr-following-feed-header-actions`
  - anadir una asercion que confirme que el primer hijo con `data-slot="overlay-page-header"` sigue presente y que el boton no aparece antes del header
  - anadir un test para `activeThread.isLoading && !root && replies.length === 0` que espere un `Empty` con `Cargando hilo`, `Recuperando la conversacion.` y un spinner `[aria-label="Loading"]`, que ademas confirme la ausencia del footer `Cargando hilo...`, y que verifique un contenedor centrado estable en el area del hilo
  - anadir un test que confirme que ese `Empty` no aparece cuando `root` ya existe aunque `isLoading === true`
  - anadir un test que confirme que ese `Empty` tampoco aparece cuando `replies.length > 0` aunque `root === null` e `isLoading === true`
  - anadir un test que confirme que `ListLoadingFooter` sigue visible cuando `isLoadingMore === true` con contenido ya renderizado
  - anadir un test que confirme que `ListLoadingFooter` tambien sigue visible cuando `isLoading === true` pero ya existe `root` o `replies` visibles
  - anadir aserciones separadas para el composer principal y el composer de respuesta: ambos deben tener `textarea`, un `button[aria-label="Adjuntar imagen (proximamente)"]` deshabilitado y el CTA de envio dentro de una fila inferior dedicada a acciones
  - comprobar en ambas cajas que la fila inferior contiene exactamente dos extremos visibles: primer `button` igual al iconbutton de imagen deshabilitado y ultimo `button` igual al CTA de envio
  - confirmar que clicar el boton de imagen deshabilitado no dispara `onPublishPost` ni `onPublishReply`
- [ ] **Step 2: Ejecutar la suite enfocada del surface y confirmar RED**
Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: fallos por ausencia del contenedor derecho para `Volver al Agora`, del `Empty` centrado del hilo, o de la nueva fila de acciones con boton de imagen.

### Task 2: Implementacion minima en `FollowingFeedContent`

**Files:**
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`

- [ ] **Step 3: Reordenar el header para que `OverlayPageHeader` sea el bloque principal y `Volver al Agora` viva en `.nostr-following-feed-header-actions` cuando hay hilo activo**
- [ ] **Step 4: Implementar el estado bloqueante del hilo con `Empty + Spinner` cuando `activeThread.isLoading && !activeThread.root && activeThread.replies.length === 0`**
  - envolver ese `Empty` en un contenedor dedicado y estable para test, por ejemplo `.nostr-following-feed-thread-empty-state`, con clases de centrado para ocupar el area visible del hilo
- [ ] **Step 5: Mantener `ListLoadingFooter` solo para cargas incrementales con contenido ya visible**
  - cubrir tanto `activeThread.isLoadingMore` como `activeThread.isLoading` cuando ya existe `activeThread.root` o `activeThread.replies.length > 0`
- [ ] **Step 6: Rehacer ambos composers con `Textarea` arriba y fila inferior `justify-between`, usando un `Button` icon-only de imagen a la izquierda con `type="button"`, `variant="outline"`, `size="icon"`, `disabled` y `aria-label="Adjuntar imagen (proximamente)"`**
  - composer principal: mantener `.nostr-following-feed-compose`, dejar el `Textarea` como primer control dentro de `CardContent` y envolver el iconbutton + CTA `Publicar` en un contenedor nuevo `.nostr-following-feed-compose-actions` debajo
  - composer de respuesta: mantener `.nostr-following-feed-reply-box`, dejar la etiqueta de objetivo y el `Textarea`, y anadir la misma fila inferior en un contenedor `.nostr-following-feed-compose-actions` con iconbutton + CTA `Responder`
  - la fila inferior debe permitir asercion estable por DOM: primer boton de la fila = imagen deshabilitada, ultimo boton de la fila = CTA de envio
  - el iconbutton no debe tener `onClick`; al estar `disabled` no debe producir side effects
- [ ] **Step 7: Re-ejecutar la suite enfocada y confirmar GREEN**
Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS

## Chunk 2: Focused Verification

### Task 3: Verificacion final de la zona tocada

**Files:**
- No code changes expected

- [ ] **Step 8: Ejecutar la verificacion enfocada del surface**
Run: `pnpm vitest run src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: PASS para header derecho, loading inicial centrado, footer incremental y boton de imagen deshabilitado en ambos composers.

- [ ] **Step 9: Ejecutar tests adicionales del overlay que ya cubren abrir hilo y responder desde `Agora`**
Run: `pnpm vitest run src/nostr-overlay/App.test.tsx`
Expected: PASS sin regresiones en los flujos de `Agora` que abren hilo y publican respuestas.

- [ ] **Step 10: No hacer commit salvo que el usuario lo pida**
