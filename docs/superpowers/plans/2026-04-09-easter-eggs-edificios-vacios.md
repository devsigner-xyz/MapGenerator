# Easter Eggs en Edificios Vacios Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar 3 easter eggs (whitepaper de Bitcoin, manifiesto criptoanarquista y declaracion de independencia del ciberespacio) al clickar edificios vacios aleatorios, con prioridad total para edificios ocupados, contenido local, y resaltado morado temporal de desarrollo.

**Architecture:** El motor del mapa selecciona y mantiene hasta 3 edificios vacios elegibles por mapa, los pinta con estado visual de debug y expone un evento especifico cuando se clicka uno. El flujo de click mantiene prioridad en edificios ocupados (si hay ocupado, nunca se procesa easter egg). El overlay React escucha el nuevo evento y abre un modal dedicado con render de PDF embebido (descarga + abrir para zoom) o texto plano scrollable segun el documento.

**Tech Stack:** TypeScript, Vite, React 19, Radix/shadcn dialog, Vitest, CSS existente del overlay.

---

## Chunk 1: Catalogo local y logica pura de seleccion

### Task 1: Definir catalogo tipado de easter eggs y rutas locales

**Files:**
- Create: `src/nostr-overlay/easter-eggs/catalog.ts`
- Create: `src/nostr-overlay/easter-eggs/catalog.test.ts`
- Create: `src/nostr-overlay/easter-eggs/content/crypto-anarchist-manifesto.txt`
- Create: `src/nostr-overlay/easter-eggs/content/declaration-of-independence-of-cyberspace.txt`
- Create: `public/easter-eggs/bitcoin.pdf`

- [ ] **Step 1: Write failing tests** en `catalog.test.ts` para validar ids requeridos y que cada id tenga metadatos completos.
- [ ] **Step 2: Run test to verify fail**

```bash
pnpm vitest run src/nostr-overlay/easter-eggs/catalog.test.ts
```

- [ ] Expected: `FAIL` porque aun no existe `catalog.ts` o no exporta el catalogo final.
- [ ] **Step 3: Implement minimal catalog** (`EasterEggId`, metadatos, helpers y rutas locales).
- [ ] **Step 4: Copiar contenido local** en ambos `.txt` y agregar `bitcoin.pdf` a `public/easter-eggs/`.
- [ ] **Step 5: Run test to verify pass**

```bash
pnpm vitest run src/nostr-overlay/easter-eggs/catalog.test.ts
```

- [ ] Expected: `PASS` con los 3 easter eggs resueltos localmente.
- [ ] Commit:

```bash
git add src/nostr-overlay/easter-eggs/catalog.ts src/nostr-overlay/easter-eggs/catalog.test.ts src/nostr-overlay/easter-eggs/content/crypto-anarchist-manifesto.txt src/nostr-overlay/easter-eggs/content/declaration-of-independence-of-cyberspace.txt public/easter-eggs/bitcoin.pdf
git commit -m "feat: add local easter egg catalog and static sources"
```

### Task 2: Implementar seleccion aleatoria pura de edificios vacios

**Files:**
- Create: `src/ts/ui/easter_eggs.ts`
- Create: `src/ts/ui/easter_eggs.test.ts`

- [ ] **Step 1: Write failing tests** en `src/ts/ui/easter_eggs.test.ts` para:
  - selecciona maximo 3 indices,
  - nunca selecciona edificios ocupados,
  - devuelve 0 cuando no hay vacios,
  - asigna ids unicos sin repetir.
- [ ] **Step 2: Run test to verify fail**

```bash
pnpm vitest run src/ts/ui/easter_eggs.test.ts
```

- [ ] Expected: `FAIL` por funciones no implementadas o resultados incorrectos.

- [ ] **Step 3: Implement minimal logic** en `src/ts/ui/easter_eggs.ts` con funciones puras:
  - `pickEmptyBuildingIndices(...)`
  - `buildEasterEggAssignment(...)`.
- [ ] **Step 4: Run test to verify pass**

```bash
pnpm vitest run src/ts/ui/easter_eggs.test.ts
```

- [ ] Expected: `PASS` cubriendo maximo 3, no ocupados, y caso sin vacios.

- [ ] Commit:

```bash
git add src/ts/ui/easter_eggs.ts src/ts/ui/easter_eggs.test.ts
git commit -m "test+feat: add deterministic selection for empty-building easter eggs"
```

## Chunk 2: Integracion en motor del mapa con prioridad de ocupados

### Task 3: Agregar hit-test generico para edificios (ocupados o vacios)

**Files:**
- Modify: `src/ts/ui/occupied_building_hit.ts`
- Modify: `src/ts/ui/occupied_building_hit.test.ts`

- [ ] **Step 1: Write failing tests** para `findBuildingHit` (devuelve indice cuando el punto cae en cualquier lote, o `null`).
- [ ] **Step 2: Run failing tests**

```bash
pnpm vitest run src/ts/ui/occupied_building_hit.test.ts
```

- [ ] Expected: `FAIL` por ausencia de `findBuildingHit`.

- [ ] **Step 3: Implement minimal code** reutilizando la logica de point-in-polygon existente.
- [ ] **Step 4: Run passing tests**

```bash
pnpm vitest run src/ts/ui/occupied_building_hit.test.ts
```

- [ ] Expected: `PASS` en casos hit/no-hit.

### Task 4: Estado visual morado temporal para debug en edificios easter egg

**Files:**
- Modify: `src/ts/ui/style.ts`
- Modify: `src/ts/ui/style-occupancy.test.ts`

- [ ] **Step 1: Write failing test** para un nuevo estado visual (ej. `easter_egg_debug`) con fill/stroke morado.
- [ ] **Step 2: Run failing test**

```bash
pnpm vitest run src/ts/ui/style-occupancy.test.ts
```

- [ ] Expected: `FAIL` por estado morado no definido.

- [ ] **Step 3: Implement minimal styling** en `resolveBuildingRenderColours` y union de tipos.
- [ ] **Step 4: Assert precedence**: `selected`, `hovered` y `occupied` ganan sobre morado cuando aplique.
- [ ] **Step 5: Run passing tests**

```bash
pnpm vitest run src/ts/ui/style-occupancy.test.ts
```

- [ ] Expected: `PASS` con precedencia correcta de estados.

### Task 5: Integrar seleccion/estado easter egg en `MainGUI`

**Files:**
- Modify: `src/ts/ui/main_gui.ts`
- Modify: `src/ts/ui/style.ts`
- Create: `src/ts/ui/main_gui.easter-eggs.test.ts`

- [ ] **Step 1: Write failing tests** en `main_gui.easter-eggs.test.ts` para:
  - recalculo al cambiar ocupacion,
  - cero vacios => cero asignaciones,
  - highlight morado solo en `import.meta.env.DEV`.
- [ ] **Step 2: Run failing tests**

```bash
pnpm vitest run src/ts/ui/main_gui.easter-eggs.test.ts
```

- [ ] Expected: `FAIL` por estado/metodos aun no implementados.
- [ ] **Step 3: Implement minimal integration** en `MainGUI` (`easterEggByBuildingIndex`, recalc, getters y render state de debug).
- [ ] **Step 4: Guardrail de tamano**: si `main_gui.ts` supera ~1200 lineas tras cambios, extraer helpers internos a `src/ts/ui/easter_eggs.ts` para mantener responsabilidades.
- [ ] **Step 5: Run passing tests**

```bash
pnpm vitest run src/ts/ui/main_gui.easter-eggs.test.ts
```

- [ ] Expected: `PASS` en escenarios de recalc/prioridad visual.

### Task 6: Pipeline de click con prioridad ocupados > easter eggs

**Files:**
- Modify: `src/main.ts`
- Create: `src/main.easter-eggs.test.ts`

- [ ] **Step 1: Write failing tests** en `main.easter-eggs.test.ts` para:
  - click en ocupado dispara solo evento ocupado,
  - click en vacio easter egg dispara evento easter egg,
  - sin vacios elegibles no dispara evento easter egg.
- [ ] **Step 2: Run failing tests**

```bash
pnpm vitest run src/main.easter-eggs.test.ts
```

- [ ] Expected: `FAIL` porque el pipeline aun no publica evento easter egg.
- [ ] **Step 3: Implement minimal event pipeline** en `src/main.ts` con short-circuit de ocupados.
- [ ] **Step 4: Run passing tests**

```bash
pnpm vitest run src/main.easter-eggs.test.ts
```

- [ ] Expected: `PASS` confirmando prioridad ocupados > easter eggs.
- [ ] Commit de chunk 2:

```bash
git add src/ts/ui/occupied_building_hit.ts src/ts/ui/occupied_building_hit.test.ts src/ts/ui/style.ts src/ts/ui/style-occupancy.test.ts src/ts/ui/main_gui.ts src/ts/ui/main_gui.easter-eggs.test.ts src/main.ts src/main.easter-eggs.test.ts
git commit -m "feat: add empty-building easter egg selection and click priority rules"
```

## Chunk 3: Bridge + modal de overlay para PDF/texto

### Task 7: Exponer evento easter egg en map bridge

**Files:**
- Modify: `src/nostr-overlay/map-bridge.ts`
- Modify: `src/nostr-overlay/map-bridge.test.ts`

- [ ] **Step 1: Write failing test** para `onEasterEggBuildingClick` (subscribe/unsubscribe).
- [ ] **Step 2: Run failing test**

```bash
pnpm vitest run src/nostr-overlay/map-bridge.test.ts
```

- [ ] Expected: `FAIL` porque `onEasterEggBuildingClick` aun no existe en el bridge.

- [ ] **Step 3: Implement bridge mapping** `MainApi.subscribeEasterEggBuildingClick` -> `MapBridge.onEasterEggBuildingClick`.
- [ ] **Step 4: Run passing test**

```bash
pnpm vitest run src/nostr-overlay/map-bridge.test.ts
```

- [ ] Expected: `PASS` con suscripcion/desuscripcion correctas y callback invocado solo cuando corresponde.

### Task 8: Crear componente `EasterEggModal` con PDF embebido y textos

**Files:**
- Create: `src/nostr-overlay/components/EasterEggModal.tsx`
- Create: `src/nostr-overlay/components/EasterEggModal.test.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] **Step 1: Write failing tests** en `EasterEggModal.test.tsx` para:
  - modo PDF (iframe + enlace descargar + enlace abrir),
  - modo texto (contenido local con saltos de linea),
  - modal cerrable.
- [ ] **Step 2: Run failing tests**

```bash
pnpm vitest run src/nostr-overlay/components/EasterEggModal.test.tsx
```

- [ ] Expected: `FAIL` por componente aun no implementado.
- [ ] **Step 3: Implement minimal modal** con `Dialog`, branching por `kind`, y controles PDF.
- [ ] **Step 4: Ajustar estilos responsive** (`max-height`, scroll interno, acciones sticky si hace falta).
- [ ] **Step 5: Run passing tests**

```bash
pnpm vitest run src/nostr-overlay/components/EasterEggModal.test.tsx
```

- [ ] Expected: `PASS` para PDF y texto.

### Task 9: Conectar modal en `App` y cubrir pruebas

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing test** que dispare evento easter egg y verifique apertura de modal correcto.
- [ ] **Step 2: Run failing test**

```bash
pnpm vitest run src/nostr-overlay/App.test.tsx
```

- [ ] Expected: `FAIL` hasta conectar suscripcion y estado del modal.

- [ ] **Step 3: Implement minimal wiring**: estado `activeEasterEgg`, suscripcion bridge y cierre modal.
- [ ] **Step 4: Add regression tests**:
  - click ocupado sigue abriendo perfil social y no el modal easter egg,
  - si no se emite evento easter egg, modal permanece cerrado.
- [ ] **Step 5: Run passing tests**

```bash
pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/map-bridge.test.ts
```

- [ ] Expected: `PASS` con camino positivo y negativo.

- [ ] Commit de chunk 3:

```bash
git add src/nostr-overlay/map-bridge.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/components/EasterEggModal.tsx src/nostr-overlay/components/EasterEggModal.test.tsx src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx src/nostr-overlay/styles.css
git commit -m "feat: add easter egg modal for empty buildings with local PDF/text sources"
```

## Chunk 4: Verificacion integral y criterios de aceptacion

### Task 10: Verificacion tecnica final

**Files:**
- Test: `src/ts/ui/easter_eggs.test.ts`
- Test: `src/ts/ui/occupied_building_hit.test.ts`
- Test: `src/ts/ui/style-occupancy.test.ts`
- Test: `src/nostr-overlay/map-bridge.test.ts`
- Test: `src/nostr-overlay/components/EasterEggModal.test.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Run targeted tests:

```bash
pnpm vitest run src/ts/ui/easter_eggs.test.ts src/ts/ui/occupied_building_hit.test.ts src/ts/ui/style-occupancy.test.ts src/ts/ui/main_gui.easter-eggs.test.ts src/main.easter-eggs.test.ts src/nostr-overlay/map-bridge.test.ts src/nostr-overlay/components/EasterEggModal.test.tsx src/nostr-overlay/App.test.tsx
```

- [ ] Expected: PASS, sin regresiones del flujo de ocupados.
- [ ] Run type check:

```bash
pnpm typecheck
```

- [ ] Expected: 0 errores TypeScript.
- [ ] Run build:

```bash
pnpm build
```

- [ ] Expected: build exitoso.

### Task 11: Verificacion manual UX (sign-off)

**Files:**
- Verify: `src/main.ts`
- Verify: `src/ts/ui/main_gui.ts`
- Verify: `src/nostr-overlay/components/EasterEggModal.tsx`

- [ ] Iniciar app en modo dev (`pnpm dev`) y confirmar que los edificios easter egg aparecen morados temporalmente.
- [ ] Forzar escenario sin vacios elegibles y confirmar que no hay highlight morado ni apertura de modal easter egg.
- [ ] Clickar edificio ocupado y confirmar que se mantiene el flujo social existente (sin modal easter egg).
- [ ] Clickar edificio vacio easter egg y confirmar modal correspondiente.
- [ ] En whitepaper: confirmar iframe visible, descarga funcional y boton abrir/ampliar en nueva pestana.
- [ ] En mobile viewport: confirmar que el modal mantiene scroll interno y botones accesibles.

## Riesgos y mitigaciones

- **Riesgo:** el random cambie en momentos no deseados. **Mitigacion:** recalcular solo en puntos controlados (generacion de mapa y cambios de ocupacion).
- **Riesgo:** conflicto visual entre estado morado y estados funcionales. **Mitigacion:** reglas de precedencia explicitas con test.
- **Riesgo:** modal pesado por PDF. **Mitigacion:** usar `iframe` nativo y controles simples (descargar/abrir).
- **Riesgo:** no existan vacios. **Mitigacion:** asignacion vacia y no mostrar nada.

## Criterios de aceptacion

- Se seleccionan hasta 3 edificios vacios aleatorios por mapa, uno por easter egg.
- Si hay menos de 3 vacios, se muestran solo los disponibles; si hay 0, no aparece ninguno.
- Los edificios ocupados tienen prioridad absoluta al click.
- En desarrollo, los edificios easter egg se ven morados temporalmente.
- El whitepaper se puede ver embebido, descargar y abrir para ampliacion.
- Manifiesto y declaracion se muestran como texto local en modal.
