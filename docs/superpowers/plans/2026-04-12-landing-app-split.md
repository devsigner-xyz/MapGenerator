# Landing + App Split (/ y /app) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una landing en `/` para explicar el proyecto (incluyendo seccion dedicada a usuarios Nostr) y mover la app actual a `/app/`, manteniendo DX simple en el mismo repositorio.

**Architecture:** Vite multipage: `index.html` sera la landing estatica (ligera), y `app/index.html` cargara el shell actual del mapa con `src/main.ts`. La landing usara un script minimo para centralizar la URL del CTA (`/app/` por defecto, configurable para futuro `app.loquesea.com`).

**Tech Stack:** Vite 8 multipage, TypeScript, CSS, Playwright smoke tests, Vitest unit tests.

---

## File Structure

- Modify: `vite.config.mts` -- habilitar multiples entradas (`index.html` y `app/index.html`).
- Modify: `index.html` -- pasar de shell de mapa a landing.
- Create: `app/index.html` -- nuevo shell de la app del mapa.
- Create: `src/landing/main.ts` -- wiring de CTAs y UX ligera (scroll/anchors).
- Create: `src/landing/style.css` -- estilos de landing.
- Create: `src/landing/app-url.ts` -- resolver URL de app (`VITE_LANDING_APP_URL` fallback `/app/`).
- Create: `src/landing/app-url.test.ts` -- tests unitarios del resolver.
- Modify: `tests/smoke/map-load.spec.ts` -- apuntar a `/app/`.
- Create: `tests/smoke/landing.spec.ts` -- smoke de landing y seccion Nostr-native.
- Modify: `README.md` -- documentar nueva estructura de rutas.
- Create: `docs/landing-routing.md` -- guia de deploy (`/app` hoy, subdominio manana).
- Create: `docs/superpowers/specs/2026-04-12-landing-nostr-visualizacion-design.md` -- spec de diseno aprobado.

## Chunk 1: Spec Gate (brainstorming closure)

### Task 1: Persistir spec de diseno aprobado

**Files:**
- Create: `docs/superpowers/specs/2026-04-12-landing-nostr-visualizacion-design.md`

- [ ] **Step 1: Escribir spec con secciones validadas**
  - Contexto, objetivos/no-objetivos, arquitectura UX, seccion Nostr-native, tono no comercial, CTA unico a app.
- [ ] **Step 2: Revisar spec internamente**
  - Verificar consistencia con decisiones ya cerradas (usuarios nuevos + bloque pro-Nostr + proyecto personal).
- [ ] **Step 3: Commit**
  ```bash
  git add docs/superpowers/specs/2026-04-12-landing-nostr-visualizacion-design.md
  git commit -m "docs(spec): define landing + section for nostr-native users"
  ```

## Chunk 2: Foundation (/app route + multipage build)

### Task 2: Redirigir smoke actual a `/app/` (failing first)

**Files:**
- Modify: `tests/smoke/map-load.spec.ts`

- [ ] **Step 1: Cambiar `page.goto('/')` por `page.goto('/app/')` en todos los tests**
- [ ] **Step 2: Ejecutar smoke especifico para confirmar fallo inicial**
  Run:
  ```bash
  pnpm build && pnpm exec playwright test tests/smoke/map-load.spec.ts
  ```
  Expected: FAIL (ruta `/app/` aun no existe).
- [ ] **Step 3: Commit del test rojo**
  ```bash
  git add tests/smoke/map-load.spec.ts
  git commit -m "test(smoke): target map app at /app/"
  ```

### Task 3: Implementar multipage y mover shell app a `/app/`

**Files:**
- Create: `app/index.html`
- Modify: `vite.config.mts`

- [ ] **Step 1: Crear `app/index.html` con el contenido actual del shell de mapa**
- [ ] **Step 2: Ajustar `vite.config.mts`**
  - `optimizeDeps.entries`: incluir `index.html` y `app/index.html`.
  - `build.rollupOptions.input`: objeto con ambas entradas.
- [ ] **Step 3: Ejecutar smoke de app**
  Run:
  ```bash
  pnpm build && pnpm exec playwright test tests/smoke/map-load.spec.ts
  ```
  Expected: PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add app/index.html vite.config.mts
  git commit -m "feat(build): serve map application from /app/ via vite multipage"
  ```

## Chunk 3: Landing content + Nostr-native section

### Task 4: Crear smoke test de landing (failing first)

**Files:**
- Create: `tests/smoke/landing.spec.ts`

- [ ] **Step 1: Escribir test con asserts clave**
  - Hero visible.
  - CTA `Entrar a la aplicacion` apuntando a `/app/`.
  - Seccion "para quienes ya usan Nostr".
  - Mensaje de proyecto personal sin animo de lucro.
- [ ] **Step 2: Ejecutar test**
  Run:
  ```bash
  pnpm build && pnpm exec playwright test tests/smoke/landing.spec.ts
  ```
  Expected: FAIL (landing aun no implementada).
- [ ] **Step 3: Commit del test rojo**
  ```bash
  git add tests/smoke/landing.spec.ts
  git commit -m "test(smoke): add landing expectations including nostr-native section"
  ```

### Task 5: Implementar landing en `/`

**Files:**
- Modify: `index.html`
- Create: `src/landing/style.css`
- Create: `src/landing/main.ts`

- [ ] **Step 1: Reemplazar `index.html` por estructura landing**
  - Header, hero-manifiesto, "que es", "como funciona", features, bloque Nostr-native, filosofia, CTA final.
- [ ] **Step 2: Implementar estilo de landing en `src/landing/style.css`**
  - Diseno editorial/cartografico, responsive mobile+desktop.
- [ ] **Step 3: Conectar `src/landing/main.ts`**
  - Scroll suave a secciones.
  - Normalizar CTAs con selector `[data-app-link]`.
- [ ] **Step 4: Ejecutar smoke landing**
  Run:
  ```bash
  pnpm build && pnpm exec playwright test tests/smoke/landing.spec.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add index.html src/landing/style.css src/landing/main.ts
  git commit -m "feat(landing): add non-profit project landing with nostr-native section"
  ```

## Chunk 4: App URL configurability + docs + full verification

### Task 6: Resolver URL de app configurable (TDD)

**Files:**
- Create: `src/landing/app-url.ts`
- Create: `src/landing/app-url.test.ts`
- Modify: `src/landing/main.ts`

- [ ] **Step 1: Escribir test rojo para resolver URL**
  - Sin env -> `/app/`.
  - Con `VITE_LANDING_APP_URL` -> usar valor explicito.
- [ ] **Step 2: Ejecutar unit test**
  Run:
  ```bash
  pnpm test:unit -- src/landing/app-url.test.ts
  ```
  Expected: FAIL (modulo no existe).
- [ ] **Step 3: Implementar `resolveLandingAppUrl()` y usarlo en `main.ts`**
- [ ] **Step 4: Re-ejecutar test**
  Run:
  ```bash
  pnpm test:unit -- src/landing/app-url.test.ts
  ```
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/landing/app-url.ts src/landing/app-url.test.ts src/landing/main.ts
  git commit -m "feat(landing): support configurable app URL with safe default"
  ```

### Task 7: Documentacion tecnica de rutas y deploy

**Files:**
- Modify: `README.md`
- Create: `docs/landing-routing.md`

- [ ] **Step 1: Actualizar README**
  - `/` = landing, `/app/` = aplicacion.
  - variable `VITE_LANDING_APP_URL`.
- [ ] **Step 2: Anadir guia de deploy**
  - Estrategia recomendada ahora: mismo dominio + `/app`.
  - Migracion futura: `app.loquesea.com`.
- [ ] **Step 3: Commit**
  ```bash
  git add README.md docs/landing-routing.md
  git commit -m "docs: explain landing/app routing and future subdomain migration"
  ```

### Task 8: Verificacion completa

**Files:**
- N/A (validacion)

- [ ] **Step 1: Typecheck**
  Run:
  ```bash
  pnpm typecheck
  ```
  Expected: PASS.
- [ ] **Step 2: Unit tests**
  Run:
  ```bash
  pnpm test
  ```
  Expected: PASS.
- [ ] **Step 3: Smoke tests**
  Run:
  ```bash
  pnpm test:smoke
  ```
  Expected: PASS.
- [ ] **Step 4: Build final**
  Run:
  ```bash
  pnpm build
  ```
  Expected: PASS.
- [ ] **Step 5: Commit final de cierre (si hubo ajustes menores)**
  ```bash
  git add -A
  git commit -m "chore: finalize landing + /app split verification"
  ```
