# TypeScript + ESLint Legacy Debt Reduction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir deuda tecnica de tipado/lint sin romper el flujo diario, hasta dejar el proyecto listo para activar `strict` de forma global y sostenible.

**Architecture:** El plan divide el trabajo en chunks pequeños: primero observabilidad real (scripts y baseline), luego endurecimiento incremental de ESLint/TypeScript, despues pago de deuda por hotspots de mayor impacto y, al final, endurecimiento de CI y activacion de `strict` global. Se prioriza codigo de produccion antes que tests y se usan budgets de "no regresion" para evitar deuda nueva durante la migracion.

**Tech Stack:** TypeScript 6, ESLint Flat Config, typescript-eslint, React 19, Fastify, Vitest, Playwright, pnpm, GitHub Actions.

---

## File Map (antes de ejecutar tasks)

- `package.json`: scripts de calidad (`lint`, `typecheck`, `strict report`, budgets).
- `eslint.config.mjs`: reglas lint por contexto (prod/test) y type-aware lint.
- `tsconfig.json`: configuracion base del frontend actual (transicion).
- `tsconfig.frontend.json` (nuevo): proyecto de typecheck frontend estable.
- `tsconfig.strict.json` (nuevo): proyecto frontend en strict para medir deuda restante.
- `server/tsconfig.json`: proyecto backend (ya strict).
- `scripts/quality/strict-report.mjs` (nuevo): genera resumen de errores strict por area.
- `scripts/quality/check-budget.mjs` (nuevo): falla si crece la deuda por encima del budget.
- `docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.md` (nuevo): baseline inicial.
- `docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.json` (nuevo): baseline machine-readable para budget gate.
- `docs/superpowers/specs/2026-04-17-typescript-eslint-guardrails.md` (nuevo): politicas de no-deuda-nueva.
- `.github/workflows/ci.yml`: gates de calidad en CI.

## Chunk 1: Baseline y cobertura real (sin romper nada)

### Task 1: Expandir scripts de verificacion sin cambiar gates por defecto

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Ejecutar baseline actual y confirmar cobertura parcial**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS (estado actual).

- [ ] **Step 2: Confirmar deuda oculta fuera de scripts por defecto**

Run: `pnpm exec eslint "server/src/**/*.ts"; pnpm exec tsc -p server/tsconfig.json --noEmit`
Expected: FAIL con errores reales en backend.

- [ ] **Step 3: Agregar scripts de cobertura completa no bloqueantes**

```json
{
  "scripts": {
    "lint:frontend": "eslint \"src/**/*.{ts,tsx}\"",
    "lint:server": "eslint \"server/src/**/*.ts\"",
    "lint:tests": "eslint \"tests/**/*.ts\" \"src/**/*.test.ts\" \"src/**/*.test.tsx\"",
    "lint:full": "eslint \"src/**/*.{ts,tsx}\" \"server/src/**/*.ts\" \"tests/**/*.ts\" \"*.config.{ts,mts,mjs}\"",
    "typecheck:frontend": "tsc -p tsconfig.frontend.json --noEmit",
    "typecheck:server": "tsc -p server/tsconfig.json --noEmit",
    "typecheck:all": "pnpm typecheck:frontend && pnpm typecheck:server",
    "typecheck:strict-report": "tsc -p tsconfig.strict.json --noEmit --strict --pretty false"
  }
}
```

- [ ] **Step 4: Ejecutar scripts nuevos para verificar que reportan deuda real**

Run: `pnpm lint:full; pnpm typecheck:all`
Expected: FAIL con errores accionables (sin bloquear scripts legacy todavia).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "build(quality): add full lint and split typecheck scripts"
```

### Task 2: Registrar baseline numerico de deuda tecnica

**Files:**
- Create: `docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.md`
- Create: `docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.json`

- [ ] **Step 1: Medir errores strict actuales**

Run: `pnpm exec tsc -p tsconfig.strict.json --noEmit --strict --pretty false 2>&1 | rg -c "error TS"`
Expected: numero > 0 (baseline).

- [ ] **Step 2: Medir deuda any/as-any en produccion**

Run: `rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' '\\bany\\b' src | wc -l && rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' 'as any' src | wc -l`
Expected: conteos base para definir budget.

- [ ] **Step 3: Escribir baseline doble (humano + machine-readable)**

Contenido minimo en `.md`: strict errors total, strict errors por area, any prod, as-any prod, lint errors full.

Contenido minimo en `.json`:

```json
{
  "strictErrorsTotal": 0,
  "strictErrorsByArea": {
    "src/ts": 0,
    "src/nostr-overlay": 0,
    "src/nostr": 0,
    "src/nostr-api": 0,
    "src/main.ts": 0
  },
  "productionAnyCount": 0,
  "productionAsAnyCount": 0,
  "lintErrorsFull": 0
}
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.md docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.json
git commit -m "docs(quality): capture typescript-eslint debt baseline"
```

## Chunk 2: ESLint incremental y mantenible

### Task 3: Migrar a flat config type-aware con projectService

**Files:**
- Modify: `package.json`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Agregar dependencia oficial para flat config moderna**

Run: `pnpm add -D typescript-eslint`
Expected: lockfile actualizado sin conflictos.

- [ ] **Step 2: Reemplazar `eslint.config.mjs` por configuracion incremental**

```js
// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "test-results/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 3,
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
```

- [ ] **Step 3: Ejecutar lint completo y revisar ruido**

Run: `pnpm lint:full`
Expected: errores accionables, sin ruido por parametros `_` intencionales.

- [ ] **Step 4: Commit**

```bash
git add package.json eslint.config.mjs pnpm-lock.yaml
git commit -m "chore(eslint): adopt type-aware flat config with incremental rules"
```

### Task 4: Resolver bloqueos inmediatos de lint y alinear script por defecto

**Files:**
- Modify: `src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx`
- Modify: `package.json`

- [ ] **Step 1: Corregir `no-empty-object-type` en layout settings**

```tsx
type OverlaySettingsLayoutProps = SettingsRouteContextValue;

export function OverlaySettingsLayout(contextValue: OverlaySettingsLayoutProps) {
  // ...
}
```

- [ ] **Step 2: Hacer que `pnpm lint` use cobertura completa**

```json
{
  "scripts": {
    "lint": "pnpm lint:full"
  }
}
```

- [ ] **Step 3: Verificar lint por defecto**

Run: `pnpm lint`
Expected: PASS o solo warnings de deuda planificada.

- [ ] **Step 4: Commit**

```bash
git add src/nostr-overlay/components/settings-routes/OverlaySettingsLayout.tsx package.json
git commit -m "fix(lint): remove empty object type and set lint full as default"
```

## Chunk 3: TypeScript strict progresivo con reporte por area

### Task 5: Introducir proyectos TS dedicados para frontend y strict report

**Files:**
- Create: `tsconfig.frontend.json`
- Create: `tsconfig.strict.json`

- [ ] **Step 1: Crear `tsconfig.frontend.json` como proyecto estable**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": false
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "src/**/*.d.ts"
  ]
}
```

- [ ] **Step 2: Crear `tsconfig.strict.json` para medir deuda strict**

```json
{
  "extends": "./tsconfig.frontend.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- [ ] **Step 3: Verificar ambos checks**

Run: `pnpm typecheck:frontend && pnpm typecheck:strict-report`
Expected: frontend PASS y strict-report FAIL (deuda existente visible).

- [ ] **Step 4: Commit**

```bash
git add tsconfig.frontend.json tsconfig.strict.json
git commit -m "build(ts): split stable frontend check from strict debt report"
```

### Task 6: Automatizar reporte de deuda strict por area

**Files:**
- Create: `scripts/quality/strict-report.mjs`
- Modify: `package.json`

- [ ] **Step 1: Crear script que ejecute strict report y agrupe por area**

```js
// scripts/quality/strict-report.mjs
import { spawnSync } from "node:child_process";

const proc = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.strict.json", "--noEmit", "--strict", "--pretty", "false"], {
  encoding: "utf8",
});

const output = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`;
const lines = output.split("\n").filter((line) => line.includes("error TS"));

const bucket = {
  "src/ts (legacy engine)": 0,
  "src/nostr-overlay": 0,
  "src/nostr": 0,
  "src/nostr-api": 0,
  "src/main.ts": 0,
  other: 0,
};

for (const line of lines) {
  if (line.startsWith("src/ts/")) bucket["src/ts (legacy engine)"] += 1;
  else if (line.startsWith("src/nostr-overlay/")) bucket["src/nostr-overlay"] += 1;
  else if (line.startsWith("src/nostr/")) bucket["src/nostr"] += 1;
  else if (line.startsWith("src/nostr-api/")) bucket["src/nostr-api"] += 1;
  else if (line.startsWith("src/main.ts")) bucket["src/main.ts"] += 1;
  else bucket.other += 1;
}

console.log(JSON.stringify({ total: lines.length, bucket }, null, 2));
process.exit(0);
```

- [ ] **Step 2: Agregar script npm para reporte JSON**

```json
{
  "scripts": {
    "quality:strict-report": "node scripts/quality/strict-report.mjs"
  }
}
```

- [ ] **Step 3: Ejecutar reporte y guardar output en artefacto local**

Run: `mkdir -p docs/superpowers/reports && pnpm quality:strict-report > docs/superpowers/reports/strict-report.json`
Expected: JSON con `total` y `bucket`.

- [ ] **Step 4: Commit**

```bash
git add scripts/quality/strict-report.mjs package.json
git commit -m "chore(quality): add strict debt report script grouped by area"
```

## Chunk 4: Pago de deuda en produccion (hotspots primero)

### Task 7: Reducir deuda strict en `src/ts/ui/style.ts` y `src/main.ts`

**Files:**
- Modify: `src/ts/ui/style.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Ejecutar reporte y fijar objetivo del batch**

Run: `pnpm quality:strict-report`
Expected: identificar conteo actual de errores en ambos archivos.

- [ ] **Step 2: Aplicar fixes minimos de nullability/inicializacion**

Patrones permitidos en este batch: inicializacion explicita, guard clauses, narrowing local, reemplazo de index access inseguro.

- [ ] **Step 3: Verificar que no rompe comportamiento**

Run: `pnpm test:unit:frontend`
Expected: PASS.

- [ ] **Step 4: Verificar reduccion strict del hotspot**

Run: `pnpm quality:strict-report`
Expected: bucket `src/ts (legacy engine)` reduce al menos 30% para este batch.

- [ ] **Step 5: Commit**

```bash
git add src/ts/ui/style.ts src/main.ts
git commit -m "refactor(types): reduce strict nullability debt in style and main"
```

### Task 8: Reducir deuda strict en `src/nostr-overlay/hooks/useFollowingFeedController.ts`

**Files:**
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Test: `src/nostr-overlay/**/*.test.tsx`

- [ ] **Step 1: Confirmar errores actuales del archivo objetivo**

Run: `pnpm exec tsc -p tsconfig.strict.json --noEmit --strict --pretty false 2>&1 | rg "useFollowingFeedController.ts"`
Expected: listado de errores del archivo.

- [ ] **Step 2: Corregir tipos de context/query key/pages sin ampliar scope**

Aplicar typing explicito de context values, guards de undefined, y tipos de callback (`reply`) para eliminar `implicit any`.

- [ ] **Step 3: Validar tests relacionados**

Run: `pnpm test:unit:frontend -- src/nostr-overlay`
Expected: PASS.

- [ ] **Step 4: Re-medir deuda strict global**

Run: `pnpm quality:strict-report`
Expected: bucket `src/nostr-overlay` baja de forma visible.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/hooks/useFollowingFeedController.ts
git commit -m "refactor(types): harden following feed controller strict typing"
```

### Task 9: Reducir `any`/`as any` en produccion con budget de no-regresion

**Files:**
- Modify: `src/**/*.ts`
- Modify: `src/**/*.tsx`

- [ ] **Step 1: Medir contador base de any en prod**

Run: `rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' '\\bany\\b|as any' src | wc -l`
Expected: numero base del batch.

- [ ] **Step 2: Limpiar un lote pequeno (max 10 reemplazos por commit)**

Reemplazar por `unknown` + narrowing o tipos de dominio; prohibido agregar nuevos `any` en prod.

- [ ] **Step 3: Verificar lint + typecheck frontend**

Run: `pnpm lint && pnpm typecheck:frontend`
Expected: PASS.

- [ ] **Step 4: Commit por lote**

```bash
git add src
git commit -m "refactor(types): reduce production any usage batch <n>"
```

## Chunk 5: Backend/tests + enforcement final

### Task 10: Dejar backend strict en verde y promover `typecheck` default

**Files:**
- Modify: `server/src/nostr/event-verify.ts`
- Modify: `server/src/modules/dm/dm.routes.test.ts`
- Modify: `server/src/modules/notifications/notifications.routes.test.ts`
- Modify: `server/src/modules/notifications/notifications.service.test.ts`
- Modify: `server/src/modules/users/users.service.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Reproducir estado backend strict actual**

Run: `pnpm typecheck:server`
Expected: FAIL con errores tipados en tests + 2 en prod.

- [ ] **Step 2: Corregir 2 errores de prod primero**

Ajustar validaciones de `event.kind` y `event.created_at` para eliminar posiblemente `undefined`.

- [ ] **Step 3: Corregir typing de tests backend sin `as any` nuevo**

Normalizar mocks para evitar tuplas vacias/`never` y casts inseguros.

- [ ] **Step 4: Promover typecheck por defecto a frontend+backend**

```json
{
  "scripts": {
    "typecheck": "pnpm typecheck:all"
  }
}
```

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src package.json
git commit -m "fix(types): make backend strict green and promote full typecheck"
```

### Task 11: Agregar budget gate y guardrails de calidad en CI

**Files:**
- Create: `scripts/quality/check-budget.mjs`
- Create: `docs/superpowers/specs/2026-04-17-typescript-eslint-guardrails.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Crear script de budget de no-regresion**

Reglas minimas iniciales:
- strict errors <= baseline de `docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.json`.
- any/as-any en prod <= baseline.

- [ ] **Step 2: Exponer script npm**

```json
{
  "scripts": {
    "quality:budget": "node scripts/quality/check-budget.mjs"
  }
}
```

- [ ] **Step 3: Enlazar gate en CI despues de lint y typecheck**

Agregar step en `.github/workflows/ci.yml`:

```yaml
- name: Quality budget
  run: pnpm quality:budget
```

- [ ] **Step 4: Documentar politica operativa**

En guardrails incluir:
- no deuda nueva en prod (`any`, `as any`, `@ts-ignore`),
- excepciones solo en tests y con razon,
- si strict sube, PR no mergea.

- [ ] **Step 5: Verificacion final**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/quality/check-budget.mjs docs/superpowers/specs/2026-04-17-typescript-eslint-guardrails.md .github/workflows/ci.yml package.json
git commit -m "ci(quality): enforce typescript-eslint no-regression budget"
```

## Chunk 6: Activacion de strict global (cuando budget llegue a cero)

### Task 12: Flip final de strict en frontend

**Files:**
- Modify: `tsconfig.json`
- Modify: `tsconfig.frontend.json`
- Modify: `tsconfig.strict.json`

- [ ] **Step 1: Confirmar deuda strict en cero en frontend (prod + tests)**

Run: `pnpm typecheck:strict-report`
Expected: PASS sin errores.

- [ ] **Step 2: Activar strict global en config principal**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

- [ ] **Step 3: Ajustar overrides temporales de test si quedan remanentes**

Mantener deuda de test acotada y explicitada; no reabrir deuda en prod.

- [ ] **Step 4: Verificar suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.frontend.json tsconfig.strict.json
git commit -m "build(ts): enable strict mode globally in frontend"
```

## Definition of Done

- [ ] `pnpm lint` cubre frontend + backend + tests + configs y pasa.
- [ ] `pnpm typecheck` cubre frontend + backend y pasa.
- [ ] `strict` report no crece (budget) durante toda la migracion.
- [ ] `any/as any` en produccion baja sprint a sprint hasta objetivo acordado.
- [ ] CI bloquea regresiones de calidad.
- [ ] `strict` global activado al cerrar deuda de produccion.

## Notas de ejecucion

- Ejecutar chunks en orden estricto: `1 -> 6`.
- Lotes pequenos: max 1 hotspot por PR para facilitar review y rollback.
- Si una regla nueva bloquea demasiado, bajar temporalmente a `warn`, pagar deuda, luego subir a `error` en el siguiente chunk.
- Este plan usa `rg` (ripgrep) para metricas; si no esta instalado, instalarlo o reemplazar esos comandos por script Node equivalente antes de ejecutar el chunk.
