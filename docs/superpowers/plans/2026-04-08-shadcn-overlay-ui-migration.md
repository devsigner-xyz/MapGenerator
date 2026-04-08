# Shadcn Overlay UI Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la UI del overlay Nostr a componentes shadcn manteniendo estructura, textos y comportamiento.

**Architecture:** Inicializar shadcn/Tailwind en el proyecto Vite existente y sustituir progresivamente los elementos UI del overlay por primitives shadcn, conservando los contratos de estado/props existentes.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, shadcn/ui, Tailwind CSS, sonner.

---

## Task 1: Bootstrap de shadcn

**Files:** `components.json`, `tsconfig.json`, `vite.config.mts`, `vitest.config.mts`, `src/lib/utils.ts`, `src/nostr-overlay/styles.css`

- [ ] Instalar dependencias Tailwind/shadcn.
- [ ] Inicializar shadcn en Vite.
- [ ] Configurar alias `@/*`.

## Task 2: Migración de shell y controles

**Files:** `src/nostr-overlay/App.tsx`, `src/nostr-overlay/components/NpubForm.tsx`, `src/nostr-overlay/components/MapZoomControls.tsx`

- [ ] Reemplazar botones e inputs por componentes shadcn.
- [ ] Migrar toast de copiado a `sonner`.

## Task 3: Sidebar social y listas

**Files:** `src/nostr-overlay/components/SocialSidebar.tsx`, `src/nostr-overlay/components/PeopleListTab.tsx`, `src/nostr-overlay/components/ProfileTab.tsx`

- [ ] Migrar tabs/listas/acciones de perfil con primitives shadcn.
- [ ] Preservar orden, labels y selección actual.

## Task 4: Modales de overlay

**Files:** `src/nostr-overlay/components/MapSettingsModal.tsx`, `src/nostr-overlay/components/OccupantProfileModal.tsx`, `src/nostr-overlay/components/CityStatsModal.tsx`

- [ ] Migrar estructura modal a `Dialog`.
- [ ] Mantener formularios/settings y comportamiento actual.

## Task 5: Verificación

**Files:** tests existentes (`src/nostr-overlay/*.test.tsx`)

- [ ] Ajustar tests solo por cambios de markup si aplica.
- [ ] Ejecutar `pnpm test`.
- [ ] Ejecutar `pnpm typecheck`.
- [ ] Ejecutar `pnpm build`.
