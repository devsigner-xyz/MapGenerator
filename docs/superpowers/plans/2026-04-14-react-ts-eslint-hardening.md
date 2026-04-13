# React/TS ESLint Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer TypeScript + ESLint de forma incremental para reducir deuda tecnica sin romper el flujo diario de desarrollo.

**Architecture:** Aplicar cambios en fases pequenas: primero baseline reproducible, luego reglas utiles con overrides por contexto (app vs tests), despues limpieza de deuda existente, y finalmente endurecimiento de gates en CI. Cada fase termina con comandos de verificacion y commit pequeno.

**Tech Stack:** TypeScript 6, React 19, ESLint Flat Config, typescript-eslint, pnpm, GitHub Actions.

---

## Chunk 1: Baseline y cimientos

### Task 1: Corregir bloqueo actual de typecheck y capturar baseline

**Files:**
- Modify: `src/nostr-overlay/hooks/useNip05Verification.test.ts`
- Create: `docs/superpowers/specs/2026-04-14-quality-baseline.md`

- [ ] **Step 1: Reproducir errores actuales (baseline inicial)**

Run: `pnpm typecheck`
Expected: FAIL con `TS7010` en `useNip05Verification.test.ts`.

- [ ] **Step 2: Capturar baseline de lint con reglas objetivo**

Run: `pnpm exec eslint src tests --ext .ts,.tsx --rule "@typescript-eslint/no-unused-vars:error"`
Expected: lista grande de errores actuales (guardar conteo y categorias en el baseline doc).

- [ ] **Step 3: Aplicar fix minimo para TS7010**

Agregar anotacion explicita de retorno a `VerificationProbe` (sin refactor adicional).

- [ ] **Step 4: Verificar typecheck limpio**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit pequeno**

```bash
git add src/nostr-overlay/hooks/useNip05Verification.test.ts docs/superpowers/specs/2026-04-14-quality-baseline.md
git commit -m "fix(types): resolve blocking test return-type error and record quality baseline"
```

### Task 2: Ampliar cobertura de lint a TSX y tests

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Actualizar script lint para cubrir TS y TSX**

Cambiar script `lint` para incluir `src` y `tests` con `--ext .ts,.tsx`.

- [ ] **Step 2: Ejecutar lint con nueva cobertura**

Run: `pnpm lint`
Expected: puede fallar (esto confirma que ahora inspecciona React/TSX y tests).

- [ ] **Step 3: Commit pequeno**

```bash
git add package.json
git commit -m "build(lint): include tsx and test files in lint scope"
```

## Chunk 2: Reglas mantenibles + pago de deuda

### Task 3: Configurar perfil ESLint incremental y mantenible

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Activar `no-unused-vars` con convencion `_`**

Aplicar configuracion de `@typescript-eslint/no-unused-vars` con `argsIgnorePattern`, `varsIgnorePattern`, `caughtErrorsIgnorePattern` y `destructuredArrayIgnorePattern` usando `^_`.

- [ ] **Step 2: Endurecer comentarios TS sin bloquear migracion**

Poner `@typescript-eslint/ban-ts-comment` en `warn` con `ts-expect-error` permitido solo con descripcion minima.

- [ ] **Step 3: Tratar `any` como deuda visible**

Poner `@typescript-eslint/no-explicit-any` en `warn`.

- [ ] **Step 4: Limitar excepciones a tests**

Crear override para `**/*.test.{ts,tsx}` y `**/__tests__/**` con reglas mas flexibles solo donde haga falta.

- [ ] **Step 5: Verificar comportamiento esperado**

Run: `pnpm lint`
Expected: errores accionables + warnings de deuda, sin ruido irrelevante.

- [ ] **Step 6: Commit pequeno**

```bash
git add eslint.config.mjs
git commit -m "chore(eslint): enable maintainable ts rules with scoped test overrides"
```

### Task 4: Limpiar deuda `no-unused-vars` en codigo de app

**Files:**
- Modify: `src/nostr-overlay/**/*.{ts,tsx}`
- Modify: `src/nostr/**/*.{ts,tsx}`

- [ ] **Step 1: Ejecutar chequeo focalizado**

Run: `pnpm exec eslint src --ext .ts,.tsx --rule "@typescript-eslint/no-unused-vars:error"`
Expected: listado de errores vigente.

- [ ] **Step 2: Corregir por lote pequeno (10-15 errores max por commit)**

Regla: borrar codigo muerto real; si el parametro es intencionalmente no usado, prefijar `_`.

- [ ] **Step 3: Repetir hasta cero en app code**

Run: mismo comando de Step 1 hasta PASS.

- [ ] **Step 4: Commits frecuentes por lote**

```bash
git add <files-del-lote>
git commit -m "refactor(lint): remove unused vars in <area>"
```

### Task 5: Limpiar deuda `no-unused-vars` en tests y modulos legacy

**Files:**
- Modify: `src/**/*.test.{ts,tsx}`
- Modify: `tests/**/*.ts`
- Modify: `src/ts/**/*.{ts,tsx}`

- [ ] **Step 1: Ejecutar chequeo completo con cobertura actual**

Run: `pnpm lint`
Expected: remanentes mayormente en tests/legacy.

- [ ] **Step 2: Resolver remanentes con criterio DRY/YAGNI**

Evitar `eslint-disable` globales; usar renombre a `_` o eliminar codigo no usado.

- [ ] **Step 3: Confirmar lint en verde**

Run: `pnpm lint`
Expected: PASS (o solo warnings permitidos temporalmente).

- [ ] **Step 4: Commit pequeno**

```bash
git add src tests
git commit -m "test/chore(lint): finish unused-vars cleanup in tests and legacy modules"
```

## Chunk 3: Endurecimiento final y guardrails

### Task 6: Subir reglas de deuda de `warn` a `error`

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Escalar `no-explicit-any` a `error`**

Mantener excepciones unicamente por override puntual (si son estrictamente necesarias).

- [ ] **Step 2: Escalar `ban-ts-comment` a `error`**

Permitir solo `@ts-expect-error` con descripcion obligatoria; prohibir uso indiscriminado de `@ts-ignore`.

- [ ] **Step 3: Verificar lint estricto**

Run: `pnpm lint`
Expected: PASS sin warnings de deuda estructural.

- [ ] **Step 4: Commit pequeno**

```bash
git add eslint.config.mjs
git commit -m "chore(eslint): enforce explicit-any and ts-comment rules as errors"
```

### Task 7: Consolidar gates de calidad en CI + verificacion final

**Files:**
- Modify: `.github/workflows/ci.yml` (solo si falta algun gate)
- Create: `docs/superpowers/specs/2026-04-14-quality-guardrails.md`

- [ ] **Step 1: Verificar que CI ejecute gates obligatorios**

Checklist minimo: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` (o suite acordada).

- [ ] **Step 2: Ajustar workflow si hay huecos**

No agregar jobs redundantes; mantener pipeline rapido y determinista.

- [ ] **Step 3: Ejecutar verificacion local final**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 4: Documentar guardrails operativos**

En `quality-guardrails.md`: criterios de PR, uso permitido de overrides, y politica "no deuda nueva".

- [ ] **Step 5: Commit final de hardening**

```bash
git add .github/workflows/ci.yml docs/superpowers/specs/2026-04-14-quality-guardrails.md
git commit -m "ci/docs: lock quality gates and document no-new-debt policy"
```

## Definition of Done

- [ ] `pnpm lint` pasa con reglas endurecidas (sin deuda nueva en `any` ni ts-comments).
- [ ] `pnpm typecheck` pasa sin errores.
- [ ] `pnpm test` y `pnpm build` pasan.
- [ ] CI ejecuta los mismos gates obligatorios.
- [ ] Documentacion de baseline + guardrails creada y versionada.

## Notas de ejecucion

- Mantener PRs pequenas y tematicas (una fase = una PR).
- Evitar refactors oportunistas fuera del scope de cada tarea.
- Si una regla rompe demasiadas areas, degradar temporalmente a `warn`, limpiar, y volver a `error` en la siguiente PR.
