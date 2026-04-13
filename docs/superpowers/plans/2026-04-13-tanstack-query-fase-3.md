# TanStack Query Fase 3 (Recortado) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aplicar solo mejoras de alto impacto y bajo riesgo en TanStack Query: estandarizacion de contratos y estabilizacion de `useQueries`.

**Architecture:** consolidar configuracion de queries en factories compartidas y eliminar drift de `staleTime/retry` entre hooks. luego estabilizar agregaciones multi-query con `combine` para reducir recomputacion y mantener salida deterministica.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Vitest, Vite.

---

## Reglas de ejecucion

- Sin worktrees.
- Ejecutar chunks en secuencia estricta: `1 -> 3`.
- TDD estricto por task: **test rojo -> implementacion minima -> test verde**.
- Commit en cada step de commit.
- No ampliar alcance fuera de los archivos listados por task.
- Si hay bloqueo repetido: detenerse y reportar causa raiz + propuesta de fix minimo.

---

## Chunk 1: Contratos Query estandarizados

### Task 1.1: Crear factories compartidas de `queryOptions`

**Files:**
- Create: `src/nostr-overlay/query/options.ts`
- Modify: `src/nostr-overlay/query/query-standards.test.ts`

- [ ] **Step 1: Escribir test rojo de contratos por dominio**

Agregar tests para validar que existen factories y contratos base por dominio:
- `social`: retry conservador + staleTime corto/moderado.
- `metadata`: staleTime mayor + retry breve.
- `identity`: retry 0 en errores no recuperables.
- `realtime`: staleTime minimo.

- [ ] **Step 2: Ejecutar test focal (debe fallar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/query-standards.test.ts -t "options|domain|timing"
```

Expected: FAIL por factories ausentes o contratos incumplidos.

- [ ] **Step 3: Implementar minima version en `options.ts`**

Crear funciones tipadas:
- `createSocialQueryOptions`
- `createMetadataQueryOptions`
- `createIdentityQueryOptions`
- `createRealtimeQueryOptions`

Con defaults explicitos de `staleTime`, `gcTime`, `retry`, `retryDelay`.

- [ ] **Step 4: Re-ejecutar test focal (debe pasar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/query-standards.test.ts -t "options|domain|timing"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/query/options.ts src/nostr-overlay/query/query-standards.test.ts
git commit -m "refactor(query): centralize option factories by domain"
```

### Task 1.2: Adoptar factories en queries existentes

**Files:**
- Modify: `src/nostr-overlay/query/following-feed.query.ts`
- Modify: `src/nostr-overlay/query/active-profile.query.ts`
- Modify: `src/nostr-overlay/query/direct-messages.query.ts`
- Modify: `src/nostr-overlay/query/social-notifications.query.ts`
- Modify: `src/nostr-overlay/query/relay-metadata.query.ts`
- Modify: `src/nostr-overlay/query/nip05.query.ts`
- Test: `src/nostr-overlay/query/query-standards.test.ts`

- [ ] **Step 1: Test rojo para detectar drift de configuraciones inline**

Agregar asserts de consistencia de `retry/staleTime` por dominio.

- [ ] **Step 2: Ejecutar test focal (debe fallar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/query-standards.test.ts -t "contract|consistency"
```

Expected: FAIL por configuraciones inline o inconsistencia.

- [ ] **Step 3: Implementacion minima**

Migrar hooks para reutilizar factories de `options.ts` sin cambiar funcionalidad no relacionada.

- [ ] **Step 4: Re-ejecutar standards (debe pasar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/query-standards.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/query/following-feed.query.ts src/nostr-overlay/query/active-profile.query.ts src/nostr-overlay/query/direct-messages.query.ts src/nostr-overlay/query/social-notifications.query.ts src/nostr-overlay/query/relay-metadata.query.ts src/nostr-overlay/query/nip05.query.ts src/nostr-overlay/query/query-standards.test.ts
git commit -m "refactor(query): apply shared option factories across overlay queries"
```

---

## Chunk 3: `useQueries` estable con `combine`

### Task 3.1: Estabilizar `relay-metadata` con `combine`

**Files:**
- Modify: `src/nostr-overlay/query/relay-metadata.query.ts`
- Modify: `src/nostr-overlay/query/relay-metadata.query.test.ts`

- [ ] **Step 1: Test rojo para estabilidad/dedupe**

Casos minimos:
- URLs equivalentes normalizadas no duplican requests.
- salida estable para mismo input.
- mapping consistente de estados `loading/ready/error`.

- [ ] **Step 2: Ejecutar test (debe fallar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/relay-metadata.query.test.ts
```

Expected: FAIL inicial.

- [ ] **Step 3: Implementacion minima**

Aplicar `useQueries({ queries, combine })` manteniendo contrato actual de retorno.

- [ ] **Step 4: Re-ejecutar test (debe pasar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/relay-metadata.query.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/query/relay-metadata.query.ts src/nostr-overlay/query/relay-metadata.query.test.ts
git commit -m "perf(query): stabilize relay metadata aggregation with combine"
```

### Task 3.2: Estabilizar `nip05` con `combine`

**Files:**
- Modify: `src/nostr-overlay/query/nip05.query.ts`
- Create or Modify: `src/nostr-overlay/query/nip05.query.test.ts`

- [ ] **Step 1: Test rojo para keying/dedupe/salida estable**

Casos minimos:
- dedupe por identidad normalizada.
- output deterministico con mismo set de entrada.
- manejo de error/retry alineado a factories del chunk 1.

- [ ] **Step 2: Ejecutar test (debe fallar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/nip05.query.test.ts
```

Expected: FAIL inicial.

- [ ] **Step 3: Implementacion minima**

Migrar a `useQueries(...combine)` con normalizacion estable.

- [ ] **Step 4: Re-ejecutar test (debe pasar)**

Run:
```bash
pnpm vitest run src/nostr-overlay/query/nip05.query.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/query/nip05.query.ts src/nostr-overlay/query/nip05.query.test.ts
git commit -m "perf(query): improve nip05 stability with useQueries combine"
```

### Task 3.3: Validacion final y evidencia del recorte

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-tanstack-query-fase-3.md`

- [ ] **Step 1: Ejecutar typecheck**

Run:
```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Ejecutar unit tests**

Run:
```bash
pnpm test:unit
```

Expected: PASS.

- [ ] **Step 3: Ejecutar build**

Run:
```bash
pnpm build
```

Expected: PASS (warnings no bloqueantes documentados).

- [ ] **Step 4: Registrar evidencia de ejecucion en este plan**

Anotar:
- resumen por task,
- resultados de comandos,
- commits generados,
- estado final de `git status`.

- [ ] **Step 5: Commit de evidencia**

```bash
git add docs/superpowers/plans/2026-04-13-tanstack-query-fase-3.md
git commit -m "docs(plan): record execution evidence for tanstack phase 3 (chunks 1 and 3)"
```

---

## Command Pack (solo alcance de este plan)

```bash
pnpm vitest run src/nostr-overlay/query/query-standards.test.ts
pnpm vitest run src/nostr-overlay/query/relay-metadata.query.test.ts
pnpm vitest run src/nostr-overlay/query/nip05.query.test.ts
pnpm typecheck
pnpm test:unit
pnpm build
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-13-tanstack-query-fase-3.md`. Ready to execute.

---

## Execution Evidence (2026-04-13)

### Chunk 1 summary

- **Task 1.1**
  - Added domain option-factory tests in `query-standards.test.ts` (red).
  - Implemented `src/nostr-overlay/query/options.ts` with shared factories:
    - `createSocialQueryOptions`
    - `createMetadataQueryOptions`
    - `createIdentityQueryOptions`
    - `createRealtimeQueryOptions`
  - Focused standards run for `options|domain|timing` passed after implementation.

- **Task 1.2**
  - Added contract consistency test for shared factories usage (red).
  - Migrated queries to shared factories in:
    - `following-feed.query.ts`
    - `active-profile.query.ts`
    - `direct-messages.query.ts`
    - `social-notifications.query.ts`
    - `relay-metadata.query.ts`
    - `nip05.query.ts`
  - Full `query-standards.test.ts` run passed after migration.

### Chunk 3 summary

- **Task 3.1**
  - Added failing stability test for equivalent relay URL input.
  - Migrated `relay-metadata.query.ts` to `useQueries({ queries, combine })`.
  - Stabilized relay key normalization (canonical key without trailing slash root).
  - `relay-metadata.query.test.ts` passed after implementation.

- **Task 3.2**
  - Created `nip05.query.test.ts` with red tests for:
    - dedupe by normalized identity,
    - deterministic output for equivalent target sets,
    - identity retry behavior (no retries on failure).
  - Migrated `nip05.query.ts` to `useQueries({ queries, combine })` with:
    - normalized pubkey indexing,
    - deterministic sorted normalized targets,
    - dedupe by normalized identity key.
  - `nip05.query.test.ts` passed after implementation.

- **Task 3.3**
  - `pnpm typecheck`: **PASS** (after type-safety compatibility adjustments in query wrappers/options factories).
  - `pnpm test:unit`: **FAIL** (18 tests failed; broad suite timeouts + UI/auth failures outside query plan scope).
  - `pnpm build`: **PASS** (non-blocking warnings for chunk size and direct eval in dependency code).

### Validation command results

- `pnpm vitest run src/nostr-overlay/query/query-standards.test.ts`: **PASS** (7 passed)
- `pnpm vitest run src/nostr-overlay/query/relay-metadata.query.test.ts`: **PASS** (4 passed)
- `pnpm vitest run src/nostr-overlay/query/nip05.query.test.ts`: **PASS** (3 passed)
- `pnpm typecheck`: **PASS**
- `pnpm test:unit`: **FAIL** (18 failed / 487 passed)
- `pnpm build`: **PASS**

### Commits generated during execution

1. `f4039b0` - `refactor(query): centralize option factories by domain`
2. `f1d4781` - `refactor(query): apply shared option factories across overlay queries`
3. `0c26770` - `perf(query): stabilize relay metadata aggregation with combine`
4. `c281b8b` - `perf(query): improve nip05 stability with useQueries combine`
5. `e5f4efb` - `fix(query): resolve typing regressions in shared option factories`

### Git status snapshot before evidence commit

```bash
 M src/nostr/relay-policy.ts
?? docs/superpowers/plans/2026-04-13-tanstack-query-fase-3.md
```
