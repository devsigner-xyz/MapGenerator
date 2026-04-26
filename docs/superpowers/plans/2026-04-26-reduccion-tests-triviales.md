# Reduccion De Tests Triviales Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir tests redundantes o demasiado acoplados a detalles internos sin perder cobertura de comportamiento critico.

**Architecture:** Ejecutar la reduccion por fases, de menor a mayor riesgo. Primero eliminar tests claramente redundantes, despues consolidar smoke tests y pass-through tests, y dejar `src/nostr-overlay/App.test.tsx` para una fase controlada con matriz de riesgo caso por caso.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright, pnpm.

---

## Contexto

La suite activa actual esta repartida entre Vitest frontend, Vitest backend y Playwright smoke. El foco de reduccion no debe ser una bajada global indiscriminada, sino retirar tests que no protegen contratos reales.

Baseline observado el 2026-04-26:

- `src/nostr-overlay`: 97 archivos, 739 tests, 32937 lineas.
- `src/nostr`: 49 archivos, 283 tests, 6905 lineas.
- `server`: 30 archivos, 192 tests, 6237 lineas.
- `src/ts`: 26 archivos, 111 tests, 2861 lineas.
- `tests/smoke`: 4 archivos, 11 tests, 210 lineas.
- Total aproximado: 219 archivos, 1376 tests, 50366 lineas.

El mayor retorno esta en `src/nostr-overlay`, especialmente tests de estructura, pass-through, clases internas y parte de `App.test.tsx`.

## Skills Recomendadas

- `refactor`: para reducir tests sin cambiar comportamiento productivo.
- `vitest`: para ejecutar tests unitarios focalizados y frontend completo.
- `playwright-best-practices`: para consolidar smoke tests sin perder senales E2E utiles.
- `verification-before-completion`: antes de declarar terminada cualquier fase.
- `requesting-code-review`: tras fases 1-3 y antes de tocar `App.test.tsx` en profundidad.

## Reglas De Seguridad

- No modificar codigo productivo salvo que un test dependa de una API eliminada o import inexistente por limpieza de tests.
- No tocar tests de Nostr protocolar, auth, wallet, NWC/WebLN, zaps, DMs, relays, backend security ni storage persistido salvo para refactors mecanicos de test.
- No hacer commits salvo peticion explicita del usuario.
- Ejecutar cada fase en cambios pequenos. Si una fase falla, aislar el borrado concreto y revertir solo ese cambio.
- Evitar reemplazar tests borrados por nuevos tests triviales equivalentes.

## Criterios De Decision

Mantener tests que cubran:

- Compatibilidad Nostr/NIP, NWC, WebLN, zaps, DMs y relays.
- Auth, storage persistido, migraciones y seguridad backend.
- Contratos API Fastify y validacion de errores.
- Determinismo de mapa, generacion, ocupacion, zoom, geometria y comportamiento visual dificil de inspeccionar manualmente.
- Flujos integrados reales entre App, router, services, storage, wallet, DM, zaps y map bridge.

Eliminar o consolidar tests que cubran:

- Imports, estructura interna o que un helper ya no esta inline.
- Props pasadas 1:1 sin transformacion ni condicion.
- Clases internas de shadcn/Tailwind que no son contrato publico.
- Tests de que un modulo importa correctamente.
- Smoke tests que repiten el mismo `page.goto('/app/')` y los mismos asserts basicos.

## Archivos Por Fase

### Fase 0: Baseline

**Files:** ninguno.

Responsabilidad: capturar estado inicial y confirmar que la suite esta verde antes de borrar cobertura.

### Fase 1: Bajas Claras Y Smoke Redundante

**Files:**

- Delete: `src/nostr-overlay/scaffold.test.ts`
- Modify: `tests/smoke/map-load.spec.ts`
- Modify: `tests/smoke/landing.spec.ts`

Responsabilidad: retirar tests que no aportan informacion nueva o fusionar smoke tests solapados.

### Fase 2: Guardas De Estructura

**Files:**

- Delete: `src/nostr-overlay/App.structure.test.ts`
- Delete: `src/nostr-overlay/i18n-cleanup.structure.test.ts`
- Delete: `src/nostr-overlay/no-legacy-guards.test.ts`

Responsabilidad: retirar guardas temporales de refactor/migracion que validan estructura interna.

### Fase 3: Pass-Through Y Tests Mecanicos

**Files:**

- Modify: `src/nostr-overlay/services/overlay-services.test.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`
- Modify: `src/nostr-overlay/routes/WalletRouteContainer.test.tsx`
- Modify: `src/nostr-overlay/routes/AgoraRouteContainer.test.tsx`
- Review only: `src/nostr-overlay/routes/ChatsRouteContainer.test.tsx`

Responsabilidad: conservar transformaciones y condiciones reales, eliminar comprobaciones exhaustivas de reenvio 1:1.

### Fase 4: Tests UI De Bajo Valor

**Files:**

- Delete or modify: `src/components/ui/control-sizing.test.tsx`
- Modify: `src/nostr-overlay/components/MapDisplayToggleControls.test.tsx`
- Review only: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

Responsabilidad: retirar asserts sobre clases internas cuando no representan un contrato de usuario.

### Fase 5: Reduccion Controlada De App.test.tsx

**Files:**

- Modify: `src/nostr-overlay/App.test.tsx`
- Reference: `src/nostr-overlay/App.safety-net.test.tsx`
- Reference: `src/nostr-overlay/routes/*.test.tsx`
- Reference: `src/nostr-overlay/components/*.test.tsx`
- Reference: `src/nostr-overlay/controllers/*.test.tsx`

Responsabilidad: reducir duplicados de `App.test.tsx` con matriz KEEP/DELETE/MOVE/DEFER y tandas pequenas.

---

## Chunk 1: Baseline Y Cambios De Menor Riesgo

Recommended skills: `vitest`, `playwright-best-practices`, `verification-before-completion`.

### Task 1: Capturar Baseline De La Suite

**Files:**

- Modify: ninguno.

- [ ] **Step 1: Ejecutar unit frontend baseline**

Run:

```bash
pnpm test:unit:frontend
```

Expected: PASS.

- [ ] **Step 2: Ejecutar smoke baseline si el entorno lo permite**

Run:

```bash
pnpm test:smoke
```

Expected: PASS. Si falla por entorno local o browsers no instalados, registrar el fallo y no mezclarlo con esta limpieza.

- [ ] **Step 3: Guardar conteo inicial**

Run:

```bash
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter((file) => /(^src\/.*\.test\.tsx?$)|(^server\/src\/.*\.test\.ts$)|(^tests\/smoke\/.*\.spec\.ts$)/.test(file));
let tests = 0;
let lines = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  tests += (text.match(/^\s*(?:it|test)\s*\(/gm) || []).length;
  lines += text.split('\n').length;
}
console.log({ files: files.length, tests, lines });
NODE
```

Expected: numero cercano al baseline observado: `files: 219`, `tests: 1376`, `lines: 50366`.

### Task 2: Borrar Scaffold Trivial

**Files:**

- Delete: `src/nostr-overlay/scaffold.test.ts`

- [ ] **Step 1: Confirmar contenido trivial**

Verificar que el archivo solo importa `./App` y hace `expect(mod).toBeDefined()`.

- [ ] **Step 2: Eliminar archivo**

Borrar `src/nostr-overlay/scaffold.test.ts`.

- [ ] **Step 3: Ejecutar test focalizado de App**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx
```

Expected: PASS.

### Task 3: Fusionar Smoke Tests De App Anonima

**Files:**

- Modify: `tests/smoke/map-load.spec.ts`

- [ ] **Step 1: Fusionar tests solapados**

Reemplazar estos tests:

- `loads map canvases and gui panel`
- `runs generate action without fatal runtime errors`
- `keeps sidebar hidden while login overlay is active`

por este test unico:

```ts
test('anonymous app load shows map and login overlay without app controls', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/app/');

  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#map-svg')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root [data-testid="login-gate-screen"]')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root input[name="npub"]')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root .nostr-login-screen-dialog')).toBeVisible();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.locator('button[aria-label="Regenerar mapa"]').first()).toHaveCount(0);
  await expect(page.locator('button[aria-label="Abrir ajustes"]').first()).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});
```

- [ ] **Step 2: Mantener npub smoke separado**

Mantener `npub submit shows progressive status without runtime errors`. No cambiar su semantica en esta tarea.

- [ ] **Step 3: Ejecutar smoke focalizado**

Run:

```bash
pnpm build:app && pnpm exec playwright test tests/smoke/map-load.spec.ts
```

Expected: PASS.

### Task 4: Fusionar Smoke Tests De Landing Espanol

**Files:**

- Modify: `tests/smoke/landing.spec.ts`

- [ ] **Step 1: Fusionar contenido principal en espanol**

Reemplazar estos tests:

- `landing muestra manifiesto y CTA principal`
- `landing incluye seccion para usuarios nostr y filosofia no comercial`

por este test unico:

```ts
test('landing muestra contenido principal, CTAs y filosofia nostr', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /Nostr City/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Para quienes ya usan Nostr/i })).toBeVisible();
  await expect(page.getByText(/sin animo de lucro/i).first()).toBeVisible();

  const primaryCta = page.getByRole('link', { name: 'Entrar a la aplicacion' }).first();
  await expect(primaryCta).toBeVisible();
  await expect(primaryCta).toHaveAttribute('href', '/app/');
  await expect(page.getByRole('link', { name: 'Documentacion' }).first()).toHaveAttribute('href', '/docs/');
});
```

- [ ] **Step 2: Mantener test de ingles separado**

Mantener `landing renders english copy when ui language is en` porque cubre preferencia persistida de idioma.

- [ ] **Step 3: Ejecutar smoke focalizado**

Run:

```bash
pnpm build:app && pnpm exec playwright test tests/smoke/landing.spec.ts
```

Expected: PASS.

---

## Chunk 2: Retirar Guardas Temporales De Estructura

Recommended skills: `refactor`, `vitest`, `verification-before-completion`.

### Task 5: Eliminar Tests De Estructura Interna

**Files:**

- Delete: `src/nostr-overlay/App.structure.test.ts`
- Delete: `src/nostr-overlay/i18n-cleanup.structure.test.ts`
- Delete: `src/nostr-overlay/no-legacy-guards.test.ts`

- [ ] **Step 1: Confirmar que no hay migracion activa dependiente**

Revisar cambios actuales y confirmar que estas guardas no forman parte de un refactor en curso.

- [ ] **Step 2: Borrar `App.structure.test.ts`**

Este archivo valida imports, ausencia de helpers inline y delegacion estructural. Es una guarda de arquitectura, no un contrato de usuario.

- [ ] **Step 3: Borrar `i18n-cleanup.structure.test.ts`**

Este archivo busca fragmentos concretos de texto. La regla real debe vivir en convenciones, lint o revisiones, no en una lista estrecha de strings historicos.

- [ ] **Step 4: Borrar `no-legacy-guards.test.ts`**

Este archivo protege contra simbolos legacy de migraciones ya cerradas. Mantenerlo solo si hay una migracion activa.

- [ ] **Step 5: Ejecutar overlay frontend focalizado**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay
```

Expected: PASS.

- [ ] **Step 6: Ejecutar lint de tests**

Run:

```bash
pnpm lint:tests
```

Expected: PASS.

---

## Chunk 3: Consolidar Pass-Through Y Tests Mecanicos

Recommended skills: `refactor`, `vitest`, `verification-before-completion`.

### Task 6: Reducir `overlay-services.test.ts`

**Files:**

- Modify: `src/nostr-overlay/services/overlay-services.test.ts`

- [ ] **Step 1: Borrar test de identidad pura**

Borrar `returns the already-built overlay services unchanged`.

Razon: `createOverlayServices` en `src/nostr-overlay/services/overlay-services.ts` devuelve `input` sin logica.

- [ ] **Step 2: Borrar test type-only**

Borrar `exposes the service interfaces consumed by the overlay boundary`.

Razon: TypeScript ya valida el contrato de `OverlayServices`; el test no ejerce runtime behavior.

- [ ] **Step 3: Mantener smoke de bootstrap**

Mantener `bootstrap builds the runtime and API services before registering them` porque valida que `createBootstrapOverlayServices` monta servicios reales.

- [ ] **Step 4: Limpiar imports**

Eliminar `expectTypeOf` y imports de tipos que ya no se usen.

- [ ] **Step 5: Ejecutar test focalizado**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/services/overlay-services.test.ts
```

Expected: PASS.

### Task 7: Consolidar `map-bridge.test.ts`

**Files:**

- Modify: `src/nostr-overlay/map-bridge.test.ts`

- [ ] **Step 1: Mantener comportamiento no trivial**

Conservar cobertura para:

- `ensureGenerated` solo genera si `roadsEmpty()` es true.
- `regenerateMap` reenvia opciones.
- `listBuildings` transforma centroides en slots con indice.
- `listEasterEggBuildings` y `listSpecialBuildings` filtran indices invalidos y ordenan.
- `applyOccupancy` actualiza ocupacion y seleccion.
- `on*` subscriptions devuelven unsubscribe o noop.

- [ ] **Step 2: Fusionar delegaciones triviales con tabla**

Reemplazar tests individuales de setters/getters por `test.each` cuando el valor sea solo delegacion.

Ejemplo de patron:

```ts
test.each([
  ['setViewportInsetLeft', 'setViewportInsetLeft', [120]],
  ['setDialogBuildingHighlight', 'setDialogHighlightedBuildingIndex', [3]],
  ['setVerifiedBuildingIndexes', 'setVerifiedBuildingIndexes', [[1, 2]]],
  ['setStreetLabelsEnabled', 'setStreetLabelsEnabled', [true]],
  ['setStreetLabelsZoomLevel', 'setStreetLabelsZoomLevel', [2]],
  ['setStreetLabelUsernames', 'setStreetLabelUsernames', [['alice']]],
  ['setTrafficParticlesCount', 'setTrafficParticlesCount', [25]],
  ['setTrafficParticlesSpeed', 'setTrafficParticlesSpeed', [1.5]],
  ['setColourScheme', 'setColourScheme', ['dark']],
])('%s delegates to map api', (bridgeMethod, apiMethod, args) => {
  const api = buildMapApi();
  const bridge = createMapBridge(api);

  bridge[bridgeMethod](...args);

  expect(api[apiMethod]).toHaveBeenCalledWith(...args);
});
```

Adaptar tipos segun los helpers existentes del archivo; no introducir `any` salvo que el test ya lo use y no haya una alternativa limpia.

- [ ] **Step 3: Mantener getters relevantes si tienen fallback**

Mantener tests para `listColourSchemes` y `getColourScheme` solo si cubren fallback opcional. No mantener un test por getter que solo llama una funcion requerida del API.

- [ ] **Step 4: Ejecutar test focalizado**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/map-bridge.test.ts
```

Expected: PASS.

### Task 8: Reducir Route Containers Sin Borrar Logica

**Files:**

- Modify: `src/nostr-overlay/routes/WalletRouteContainer.test.tsx`
- Modify: `src/nostr-overlay/routes/AgoraRouteContainer.test.tsx`
- Review only: `src/nostr-overlay/routes/ChatsRouteContainer.test.tsx`

- [ ] **Step 1: Reducir `WalletRouteContainer.test.tsx`**

Mantener el test que verifica que `onConnectNwc`, `onConnectWebLn` y `onRefresh` no devuelven promesas a `WalletPage`.

Eliminar o fusionar tests que solo verifican:

- `walletState` es `walletSettings`.
- `walletActivity` es `walletActivity`.
- `nwcUriInput` es `walletNwcUriInput`.
- `onDisconnect` es `disconnectWallet`.

- [ ] **Step 2: Reducir `AgoraRouteContainer.test.tsx`**

Mantener:

- `passes clear hashtag only when an active hashtag exists`.
- `maps zap callback to requestZapPayment with target pubkey fallback`.

Reducir o borrar asserts exhaustivos de pass-through en:

- `passes feed state and active hashtag into FollowingFeedSurface`.
- `passes quote composer, reaction, repost, event reference, and profile callbacks through`.

Si se deja un test de pass-through, que compruebe solo un subconjunto representativo y los callbacks con transformacion.

- [ ] **Step 3: Mantener `ChatsRouteContainer.test.tsx` casi intacto**

No reducir por defecto. Sus tres tests cubren logica real:

- disabled reason por falta de login.
- disabled reason por falta de NIP-44.
- bloqueo de envio si no hay conversacion activa o permisos.

- [ ] **Step 4: Ejecutar tests focalizados**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/routes/WalletRouteContainer.test.tsx src/nostr-overlay/routes/AgoraRouteContainer.test.tsx src/nostr-overlay/routes/ChatsRouteContainer.test.tsx
```

Expected: PASS.

---

## Chunk 4: Tests UI De Bajo Valor

Recommended skills: `refactor`, `vitest`, `verification-before-completion`.

### Task 9: Retirar Contratos De Clase Interna

**Files:**

- Delete or modify: `src/components/ui/control-sizing.test.tsx`
- Modify: `src/nostr-overlay/components/MapDisplayToggleControls.test.tsx`
- Review only: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`

- [ ] **Step 1: Decidir sobre `control-sizing.test.tsx`**

Recomendacion: borrar `src/components/ui/control-sizing.test.tsx` salvo que exista una regresion reciente concreta de altura de controles.

Razon: comprueba `h-10` y `data-[size=default]:h-10`, detalles internos del estilo shadcn/Tailwind.

- [ ] **Step 2: Reducir `MapDisplayToggleControls.test.tsx`**

Borrar `separates toggle group items with shadcn spacing` porque valida `data-spacing="1"`, no comportamiento de usuario.

Mantener `renders english toggle labels when ui language is en`, porque cubre accesibilidad/i18n visible.

- [ ] **Step 3: Revisar `FollowingFeedSurface.test.tsx` conservadoramente**

No borrar en bloque. Revisar primero tests que solo miran clases internas, empezando por:

- `wraps feed notes in a dedicated list-layout container`.
- `keeps the loading footer outside the masonry items wrapper`.

Solo borrar si no son contratos visuales recientes que hayan corregido una regresion concreta.

- [ ] **Step 4: Ejecutar tests focalizados**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/MapDisplayToggleControls.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Ejecutar frontend completo**

Run:

```bash
pnpm test:unit:frontend
```

Expected: PASS.

---

## Chunk 5: Reduccion Controlada De `App.test.tsx`

Recommended skills: `refactor`, `vitest`, `requesting-code-review`, `verification-before-completion`.

### Task 10: Crear Matriz De Riesgo Antes De Borrar

**Files:**

- Modify: `src/nostr-overlay/App.test.tsx`
- Reference: `src/nostr-overlay/App.safety-net.test.tsx`
- Reference: `src/nostr-overlay/routes/*.test.tsx`
- Reference: `src/nostr-overlay/components/*.test.tsx`
- Reference: `src/nostr-overlay/controllers/*.test.tsx`

- [ ] **Step 1: Listar tests actuales de App**

Run:

```bash
node - <<'NODE'
const { readFileSync } = require('node:fs');
const source = readFileSync('src/nostr-overlay/App.test.tsx', 'utf8');
const matches = [...source.matchAll(/^\s*(?:it|test)\s*\(\s*['"]([^'"]+)/gm)];
for (const [index, match] of matches.entries()) {
  console.log(`${index + 1}. ${match[1]}`);
}
NODE
```

Expected: lista de aproximadamente 126 tests.

- [ ] **Step 2: Clasificar cada test**

Usar estas categorias:

- `KEEP`: integracion real entre App, routing, services, storage, wallet, DM, zaps o map bridge.
- `DELETE`: comportamiento ya cubierto por componente/controlador/ruta.
- `MOVE`: comportamiento valioso, pero debe vivir en test focalizado.
- `DEFER`: dudoso; no tocar en esta iteracion.

- [ ] **Step 3: Empezar por candidatos de bajo riesgo**

Revisar primero estos bloques:

- `src/nostr-overlay/App.test.tsx` lineas aproximadas `4768-4927`: controles zoom/display duplicados por `MapZoomControls.test.tsx` y `MapDisplayToggleControls.test.tsx`.
- `src/nostr-overlay/App.test.tsx` lineas aproximadas `6929-7031`: settings/theme/language parcialmente duplicado por settings routes/hooks.
- `src/nostr-overlay/App.test.tsx` lineas aproximadas `2274-2680`: routing/feed/agora parcialmente duplicado por `OverlayRoutes.test.tsx`, route containers y feed surface.
- Tests de copy de login si ya estan cubiertos por `LoginGateScreen.test.tsx`, `LoginMethodSelector.test.tsx`, `CreateAccountDialog.test.tsx` o `CreateAccountMethodSelector.test.tsx`.

- [ ] **Step 4: Mantener inicialmente flujos criticos**

No borrar en la primera tanda:

- Restauracion de sesion.
- Redirecciones sin sesion.
- Wallet/WebLN/NWC/zaps.
- DMs y unread state.
- Flujos donde App coordina services, router, storage y map bridge.

### Task 11: Borrar En Tandas Pequenas

**Files:**

- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Borrar primera tanda de 10-20 tests `DELETE`**

No tocar tests `KEEP`, `MOVE` ni `DEFER`.

- [ ] **Step 2: Ejecutar App focalizado**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx src/nostr-overlay/App.safety-net.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Si falla, aislar y corregir**

Si falla por perdida de cobertura real, restaurar solo el test o subset causante. No revertir toda la fase si el resto es valido.

- [ ] **Step 4: Repetir maximo una tanda adicional por sesion**

Evitar borrar demasiado de `App.test.tsx` en una unica sesion. El archivo es grande y de alto riesgo.

- [ ] **Step 5: Pedir code review antes de seguir**

Usar `requesting-code-review` o `code-reviewer` con foco en perdida de cobertura accidental.

---

## Verificacion Final

Recommended skills: `verification-before-completion`.

- [ ] **Step 1: Ejecutar unit frontend completo**

Run:

```bash
pnpm test:unit:frontend
```

Expected: PASS.

- [ ] **Step 2: Ejecutar lint de tests**

Run:

```bash
pnpm lint:tests
```

Expected: PASS.

- [ ] **Step 3: Ejecutar typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Ejecutar smoke si se tocaron Playwright**

Run:

```bash
pnpm test:smoke
```

Expected: PASS.

- [ ] **Step 5: Comparar reduccion final**

Run:

```bash
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter((file) => /(^src\/.*\.test\.tsx?$)|(^server\/src\/.*\.test\.ts$)|(^tests\/smoke\/.*\.spec\.ts$)/.test(file));
let tests = 0;
let lines = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  tests += (text.match(/^\s*(?:it|test)\s*\(/gm) || []).length;
  lines += text.split('\n').length;
}
console.log({ files: files.length, tests, lines });
NODE
```

Expected target inicial despues de fases 1-4: eliminar 5-8 archivos/guardas y reducir 40-80 tests sin tocar comportamiento productivo.

Expected target posterior tras fase 5: reduccion adicional controlada en `App.test.tsx`, solo si la matriz justifica cada borrado.

## Orden Recomendado De Ejecucion

- Ejecutar primero chunks 1-3. Tienen el mejor ratio riesgo/beneficio.
- Ejecutar chunk 4 solo si se acepta retirar contratos de clase interna.
- Ejecutar chunk 5 en sesion separada, con code review antes de continuar mas alla de la primera tanda.

## Fuera De Alcance

- No reducir tests de `src/nostr/auth/**`, `src/nostr/nwc.test.ts`, `src/nostr/webln.test.ts`, `src/nostr/zaps.test.ts`, `src/nostr/dm-*.test.ts`, `src/nostr/relay-*.test.ts`.
- No reducir tests backend de seguridad o contrato como `server/src/plugins/owner-auth.test.ts`, `server/src/plugins/rate-limit.test.ts`, `server/src/modules/*/*.routes.test.ts`.
- No convertir esta limpieza en refactor productivo.
- No anadir herramientas nuevas de cobertura o lint i18n en esta iteracion.
