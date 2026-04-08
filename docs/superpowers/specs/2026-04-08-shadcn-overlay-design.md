# Shadcn Overlay UI Design

## Context

El overlay Nostr vive en `src/nostr-overlay/**` y hoy usa markup HTML + CSS propio para panel lateral, tabs, formularios, controles de zoom y modales. El objetivo es migrar la capa visual a componentes shadcn manteniendo estructura, copy y comportamiento.

## Goals

- Reemplazar la UI del overlay por equivalentes basados en shadcn.
- Mantener misma estructura de navegación, textos y flujos.
- No modificar el motor de mapa (`src/main.ts`, `src/ts/**`).
- Mantener compatibilidad con tests existentes ajustando solo por cambios de markup.

## Non-Goals

- No rediseñar UX.
- No cambiar la lógica de dominio Nostr.
- No tocar generación/render de mapa fuera del overlay.

## Component Mapping

- `button`/acciones -> `Button`
- `input`/form npub -> `Input` + `Label`
- tabs sociales -> botones estilo tab con `Button` (misma semántica y orden)
- modales -> `Dialog`/`DialogContent`
- listas scrolleables -> `ScrollArea` donde aplique
- separadores -> `Separator`
- avatar de perfil -> `Avatar`
- toast de copiado -> `sonner`

## Integration Strategy

1. Inicializar shadcn + Tailwind en Vite, limitado al overlay CSS.
2. Migrar componentes visuales del overlay sin alterar contratos de props/estado.
3. Preservar labels/aria/title usados por tests.
4. Verificar con `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Acceptance Criteria

- Overlay completo funcionando con componentes shadcn equivalentes.
- Textos y comportamiento sin regresiones funcionales.
- Test suite unitaria en verde.
- Build y typecheck en verde.
