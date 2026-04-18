# VitePress Docs Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la documentacion publica basada en Docsify por un centro de ayuda en VitePress servido en `/docs/`, manteniendo el contenido en Markdown y sin exponer `docs/superpowers/**`.

**Architecture:** Vite seguira construyendo la landing (`/`) y la app (`/app/`), mientras que VitePress construira un sitio separado cuyo output se escribira en `dist/docs`. El contenido publico vivira dentro de `docs/`, pero la configuracion de VitePress excluira `docs/superpowers/**` para no mezclar documentacion de usuario con specs, planes y reportes internos.

**Tech Stack:** Vite, VitePress, TypeScript, Markdown, Playwright, pnpm.

---

## Chunk 1: Pipeline y configuracion base

### Task 1: Guardar baseline y preparar scripts

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml` (solo si hace falta reflejar nuevos scripts)

- [ ] **Step 1: Comprobar baseline actual**

Run: `pnpm test`
Expected: baseline verde en el worktree antes de cambiar el pipeline.

- [ ] **Step 2: Anadir VitePress y scripts de docs**

Actualizar `package.json` para incluir:

```json
{
  "scripts": {
    "build:app": "vite build",
    "build": "pnpm build:app && pnpm docs:build",
    "docs:dev": "vitepress dev docs --port 5174",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs --port 4174"
  },
  "devDependencies": {
    "vitepress": "<version>"
  }
}
```

- [ ] **Step 3: Verificar instalacion y scripts**

Run: `pnpm install --frozen-lockfile && pnpm docs:build`
Expected: VitePress compila aunque aun falte contenido final.

## Chunk 2: Sitio VitePress y contenido v1

### Task 2: Crear configuracion de VitePress

**Files:**
- Create: `docs/.vitepress/config.ts`

- [ ] **Step 1: Escribir prueba smoke para `/docs/`**

Create: `tests/smoke/docs.spec.ts`

```ts
import { expect, test } from '@playwright/test';

test('docs home loads', async ({ page }) => {
  await page.goto('/docs/');
  await expect(page.getByRole('heading', { level: 1, name: /Documentacion/i })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar la prueba y confirmar rojo**

Run: `pnpm exec playwright test tests/smoke/docs.spec.ts`
Expected: FAIL porque `/docs/` aun no existe en el build nuevo.

- [ ] **Step 3: Implementar configuracion minima**

Crear `docs/.vitepress/config.ts` con:

```ts
import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'es-ES',
  title: 'Nostr City',
  description: 'Centro de ayuda de Nostr City',
  base: '/docs/',
  srcExclude: ['superpowers/**'],
  outDir: '../dist/docs',
});
```

- [ ] **Step 4: Verificar verde minimo**

Run: `pnpm docs:build`
Expected: output generado en `dist/docs`.

### Task 3: Crear estructura y navegacion

**Files:**
- Create: `docs/index.md`
- Create: `docs/empezar/index.md`
- Create: `docs/empezar/primeros-pasos.md`
- Create: `docs/conceptos/que-es-nostr-city.md`
- Create: `docs/conceptos/que-es-nostr.md`
- Create: `docs/cuenta-y-acceso/acceso-y-login.md`
- Create: `docs/cuenta-y-acceso/crear-cuenta.md`
- Create: `docs/cuenta-y-acceso/relays-y-configuracion.md`
- Create: `docs/protocolo/nips-usadas.md`
- Create: `docs/protocolo/aplicacion-en-nostr-city.md`
- Create: `docs/faq/index.md`
- Modify: `docs/.vitepress/config.ts`

- [ ] **Step 1: Escribir el contenido minimo por seccion**

Cada pagina debe incluir titulo, resumen corto y enlaces relacionados.

- [ ] **Step 2: Definir `nav`, `sidebar` y `search` en `themeConfig`**

Usar secciones:
- Empezar
- Conceptos basicos
- Cuenta y acceso
- Protocolo Nostr
- FAQ

- [ ] **Step 3: Verificar navegacion local**

Run: `pnpm docs:build`
Expected: no dead links y home accesible.

## Chunk 3: Limpieza Docsify y enlaces del producto

### Task 4: Retirar Docsify publico

**Files:**
- Delete: `docs/index.html`
- Delete: `docs/_sidebar.md`
- Delete: `docs/_coverpage.md`
- Delete: `docs/.nojekyll`
- Delete or replace: paginas publicas antiguas de `docs/` que ya no se reutilicen

- [ ] **Step 1: Eliminar bootstrap de Docsify**
- [ ] **Step 2: Mantener solo contenido util para la nueva docs o reescribirlo**
- [ ] **Step 3: Ejecutar `pnpm docs:build` para confirmar que ya no depende de Docsify**

### Task 5: Actualizar enlaces a la documentacion

**Files:**
- Modify: `index.html`
- Modify: `README.md`
- Modify: `src/ts/model_generator.ts`

- [ ] **Step 1: Redirigir la landing a `/docs/`**
- [ ] **Step 2: Actualizar referencias en README a la nueva docs**
- [ ] **Step 3: Sustituir el tutorial STL hardcoded por la nueva ruta de docs**

Run: `pnpm test tests/smoke/landing.spec.ts`
Expected: landing sigue verde y conserva CTA principal.

## Chunk 4: Verificacion final

### Task 6: Completar smoke tests y verificar artefactos

**Files:**
- Modify: `tests/smoke/docs.spec.ts`

- [ ] **Step 1: Anadir un test de navegacion a un articulo clave**

```ts
test('docs navega a la guia de login', async ({ page }) => {
  await page.goto('/docs/');
  await page.getByRole('link', { name: /Acceso y login/i }).click();
  await expect(page.getByRole('heading', { name: /Acceso y login/i })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar smoke docs**

Run: `pnpm exec playwright test tests/smoke/docs.spec.ts`
Expected: PASS.

- [ ] **Step 3: Ejecutar verificacion completa**

Run: `pnpm build && pnpm test:smoke`
Expected: `dist/index.html`, `dist/app/index.html` y `dist/docs/index.html` presentes; smoke verde.

- [ ] **Step 4: Revisar estado final**

Run: `git status --short`
Expected: solo cambios de la migracion a VitePress.

Plan complete and saved to `docs/superpowers/plans/2026-04-18-vitepress-docs-migration.md`. Ready to execute.
