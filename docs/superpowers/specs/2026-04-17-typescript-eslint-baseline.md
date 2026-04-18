# TypeScript + ESLint Quality Baseline (2026-04-17)

Este baseline captura el estado real al ejecutar los chunks 1-3 del plan de deuda tecnica TS/ESLint.

## Commands usados

- `pnpm lint`
- `pnpm typecheck`
- `pnpm lint:full`
- `pnpm typecheck:all`
- `pnpm typecheck:frontend`
- `pnpm typecheck:strict-report`
- `pnpm --silent quality:strict-report`
- `pnpm exec tsc -p server/tsconfig.json --noEmit --pretty false 2>&1 | rg -c "error TS"`
- `rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' '\\bany\\b' src | wc -l`
- `rg -n --glob '*.ts' --glob '*.tsx' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' 'as any' src | wc -l`

## Estado de pipelines

- `pnpm lint`: PASS con warnings (usa `lint:full` y expone deuda existente en frontend/legacy).
- `pnpm typecheck`: PASS (sigue siendo el check frontend no-strict actual).
- `pnpm typecheck:frontend`: PASS.
- `pnpm typecheck:server`: FAIL (15 errores).
- `pnpm typecheck:all`: FAIL (por backend).
- `pnpm typecheck:strict-report`: FAIL (deuda strict esperada).

## Baseline numerico

| Metric | Current | Target fase siguiente |
| --- | ---: | ---: |
| strict errors total (`tsconfig.strict.json`) | 681 | <= 650 |
| strict errors `src/ts` | 295 | <= 260 |
| strict errors `src/nostr-overlay` | 240 | <= 210 |
| strict errors `src/nostr` | 114 | <= 100 |
| strict errors `src/nostr-api` | 24 | <= 20 |
| strict errors `src/main.ts` | 4 | 0 |
| strict errors `other` | 4 | 0 |
| lint errors full | 0 | 0 |
| lint warnings full | 105 | <= 90 |
| backend typecheck errors | 15 | <= 10 |
| `any` en produccion | 50 | <= 40 |
| `as any` en produccion | 16 | <= 12 |

## Observaciones

- La activacion de `projectService` con `allowDefaultProject` ya permite lint de `*.config.*` sin error de parser.
- `lint:full` queda sin errores bloqueantes y con warnings visibles para remediacion incremental.
- El crecimiento de strict errors (vs chequeo `strict` simple previo) refleja el endurecimiento con `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess` en `tsconfig.strict.json`.
- El hotspot principal permanece en `src/ts` (legacy engine), seguido por `src/nostr-overlay`.
