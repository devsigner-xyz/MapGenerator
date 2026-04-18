# Auth Flow Consistency Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar el flujo de auth para que la seleccion de metodos, los footers y los labels tengan una presentacion consistente y mas clara.

**Architecture:** `LoginGateScreen` sigue siendo el shell del dialogo. `CreateAccountMethodSelector` pasa a usar `Item` de shadcn para las dos elecciones principales. `CreateAccountDialog` mantiene la estructura `CardHeader`/`CardContent`/`CardFooter`, pero elimina wrappers decorativos y unifica la navegacion secundaria en el footer.

**Tech Stack:** React, TypeScript, shadcn/ui, Tailwind utilities, Vitest, overlay CSS minima

---

## Chunk 1: Auth Flow UI Consistency

### Task 1: Rehacer el selector de metodo de creacion con `Item`

**Files:**
- Modify: `src/nostr-overlay/components/CreateAccountMethodSelector.tsx`
- Test: `src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx`

- [ ] **Step 1: Escribir tests que fallen por copy y estructura nueva**

Cubrir:

- dos items visibles con estos textos exactos:
  - `Usar app o extension`
  - `Conecta una extension o un signer externo.`
  - `Crear cuenta local`
  - `Crea una cuenta nueva en este dispositivo.`
- ausencia del titulo `Crear cuenta` y del subtitulo viejo
- callback correcto al elegir `external` o `local`
- activacion por teclado equivalente a boton (`Enter` o `Space`) y elemento focusable

- [ ] **Step 2: Ejecutar el test enfocado y confirmar fallo**

Run: `pnpm exec vitest run src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx`

Expected: FAIL por copy o estructura desactualizada.

- [ ] **Step 3: Implementar el selector con `ItemGroup` + `Item`**

Usar `Item`, `ItemContent`, `ItemTitle`, `ItemDescription` y `ItemActions`.

- [ ] **Step 4: Ejecutar el test enfocado y confirmar PASS**

Run: `pnpm exec vitest run src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx`

Expected: PASS.

### Task 2: Unificar footer y wrappers del flujo create-account

**Files:**
- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
- Modify: `src/nostr-overlay/components/CreateAccountDialog.tsx`
- Test: `src/nostr-overlay/components/LoginGateScreen.test.tsx`
- Test: `src/nostr-overlay/components/CreateAccountDialog.test.tsx`

- [ ] **Step 1: Escribir tests que describan la navegacion en footer**

Cubrir:

- `Volver al login` en footer del selector
- `Volver` en footer del flujo `external`
- `Volver` en footer del flujo `local`
- la accion principal del paso sigue en el lado derecho del `CardFooter` en `external` y `local`
- ausencia del `Card` interno del selector de metodo y de wrappers internos equivalentes usados solo para agrupar acciones
- el login principal sigue sin accion de vuelta en footer

- [ ] **Step 2: Ejecutar tests enfocados y confirmar fallo**

Run: `pnpm exec vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/CreateAccountDialog.test.tsx`

Expected: FAIL por estructura anterior.

- [ ] **Step 3: Implementar el footer consistente y simplificar wrappers**

Mantener la shell existente y mover solo la navegacion secundaria al footer correcto.

- [ ] **Step 4: Ejecutar tests enfocados y confirmar PASS**

Run: `pnpm exec vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/CreateAccountDialog.test.tsx`

Expected: PASS.

### Task 3: Ajustar labels negros y copy del auth flow

**Files:**
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Modify: `src/nostr-overlay/components/CreateAccountDialog.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Escribir tests que fallen por copy y hooks de estilo del auth flow**

Cubrir:

- copy exacto actualizado en auth flow:
  - selector: `Usar app o extension`, `Conecta una extension o un signer externo.`, `Crear cuenta local`, `Crea una cuenta nueva en este dispositivo.`
  - external: `Usar app o extension`, `Elige como conectar una cuenta que ya controlas.`
  - local: `Crear cuenta local`, `Genera una cuenta nueva y guarda tu clave antes de continuar.`
- hook de estilo explicito para labels del auth flow usando `text-foreground` o una clase auth-only equivalente en los labels de:
  - `LoginMethodSelector.tsx`
  - `CreateAccountDialog.tsx`
- cualquier CSS nuevo para labels queda scoped al auth flow y no a usos globales de `.nostr-label`

- [ ] **Step 2: Ejecutar tests enfocados y confirmar fallo**

Run: `pnpm exec vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx`

Expected: FAIL por copy o clases faltantes.

- [ ] **Step 3: Implementar el ajuste minimo de estilo y copy**

Preferir Tailwind/composicion de shadcn. Si hace falta CSS custom, que quede acotado al auth flow.

- [ ] **Step 4: Ejecutar tests enfocados y confirmar PASS**

Run: `pnpm exec vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/App.test.tsx`

Expected: PASS.

### Task 4: Verificacion integrada

**Files:**
- No new files required.

- [ ] **Step 1: Ejecutar bateria enfocada del auth flow**

Run: `pnpm exec vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx src/nostr-overlay/components/CreateAccountDialog.test.tsx src/nostr-overlay/App.test.tsx`

Expected: PASS.

- [ ] **Step 2: Ejecutar suite completa**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Verificacion manual en browser**

Comprobar desktop y mobile en:

- login principal
- selector de creacion de cuenta
- flujo external
- flujo local

- [ ] **Step 4: Commit solo si el usuario lo pide**

No crear commit automaticamente.
