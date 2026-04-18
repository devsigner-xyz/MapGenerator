# TypeScript + ESLint Guardrails (No-Regression Policy)

## Objetivo

Evitar deuda nueva mientras se paga deuda legacy de forma incremental.

## Reglas de PR

- `pnpm lint` debe pasar (errores en 0; warnings permitidos durante migracion).
- `pnpm typecheck` debe pasar (`typecheck:frontend` + `typecheck:server`).
- `pnpm quality:budget` debe pasar.

## Budget de no-regresion

Tomar como baseline `docs/superpowers/specs/2026-04-17-typescript-eslint-baseline.json`:

- `strictErrorsTotal` no puede subir.
- `productionAnyCount` no puede subir.
- `productionAsAnyCount` no puede subir.

## Excepciones permitidas

- Tests pueden usar flexibilidad puntual, pero deben evitar `as any` innecesario.
- `@ts-expect-error` solo con descripcion clara y justificada.
- No usar `@ts-ignore` salvo caso excepcional documentado en la PR.

## Politica operativa

- Si un cambio aumenta deuda de budget, la PR no se mergea.
- Si se requiere excepcion temporal, documentar motivo + ticket de remediacion.
- Cada PR que toque hotspots (`src/ts`, `src/nostr-overlay`) debe intentar reducir al menos una porcion de deuda existente.
