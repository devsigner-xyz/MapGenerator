# Login Spacing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar el ritmo vertical del login principal para acercar `Acceder` y `Crear cuenta`, y separar mejor las acciones del bloque de campos.

**Architecture:** El cambio se resuelve con una combinacion minima de marcado y CSS local del overlay. `LoginGateScreen` pasa a ser dueno del espaciado entre la accion principal y `Crear cuenta`, mientras `LoginMethodSelector` solo controla el espacio entre sus campos descriptivos y su boton primario.

**Tech Stack:** React, TypeScript, Vitest, CSS del overlay, shadcn/ui

---

## Chunk 1: Login Main View Spacing

### Task 1: Ajustar espaciado del login principal

**Files:**
- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Test: `src/nostr-overlay/components/LoginGateScreen.test.tsx`
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`

- [ ] **Step 1: Escribir tests que describan el layout esperado**

Agregar checks de clase/estructura para garantizar:

- `LoginGateScreen` envuelve `LoginMethodSelector` y `Crear cuenta` en un grupo de acciones del login principal.
- Ese grupo usa una clase dedicada propia del login principal.
- `LoginMethodSelector` marca su accion principal con una clase dedicada de espaciado en `npub`, `nip07` y `nip46`.
- En estados normales cubiertos no aparece ningun elemento nuevo por debajo de la accion principal dentro de `LoginMethodSelector`.

- [ ] **Step 2: Ejecutar tests enfocados y confirmar que fallen**

Run: `pnpm vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx`

Expected: FAIL por ausencia de las nuevas clases/estructura.

- [ ] **Step 3: Implementar el ajuste minimo en componentes**

Cambios esperados:

- En `LoginGateScreen.tsx`, crear un contenedor del login principal que agrupe `LoginMethodSelector` y el boton `Crear cuenta`.
- En `LoginMethodSelector.tsx`, agregar una clase reutilizable al boton primario en `npub`, `nip07` y `nip46`.
- Resultado contractual esperado:
  - `1rem` renderizado entre ultimo campo o texto descriptivo y accion principal.
  - `0.75rem` renderizado entre accion principal y `Crear cuenta`.
- No tocar la logica de autenticacion ni props.

- [ ] **Step 4: Implementar CSS local y acotado**

Agregar clases nuevas en `src/nostr-overlay/styles.css` para:

- fijar el gap del grupo de acciones del login principal
- fijar el margen superior de la accion principal dentro del selector

No modificar selectores compartidos globales como `.nostr-form` o `.nostr-login-selector`.

- [ ] **Step 5: Ejecutar tests enfocados y confirmar que pasen**

Run: `pnpm vitest run src/nostr-overlay/components/LoginGateScreen.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx`

Expected: PASS.

- [ ] **Step 6: Verificacion manual visual y de medidas**

Comprobar en browser:

- `npub`: selector, input, `Acceder`, `Crear cuenta`
- `nip07`: texto, `Continuar con extension`, `Crear cuenta`
- `nip46`: selector, input bunker, `Conectar bunker`, `Crear cuenta`
- vistas fuera de alcance: desbloqueo local y variantes guardadas siguen renderizando igual
- viewports: `390x844` y `1280x800`
- DevTools: confirmar `1rem` renderizado entre ultimo campo/texto y accion principal
- DevTools: confirmar `0.75rem` renderizado entre accion principal y `Crear cuenta`

- [ ] **Step 7: Commit solo si el usuario lo pide**

No crear commit automaticamente. Si el usuario lo solicita, usar un commit pequeno y enfocado.
