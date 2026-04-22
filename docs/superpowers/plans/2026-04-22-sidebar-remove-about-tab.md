# Remove About Tab From Main Sidebar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el tab `Sobre mi` del sidebar principal y dejar solo `Sigues` y `Seguidores` sin código legado asociado.

**Architecture:** `SocialSidebar` perderá por completo la variante `profile` y quedará con dos tabs visibles en orden fijo. Como `ProfileTab` no tiene más consumidores fuera del sidebar y su suite, se eliminarán el componente y sus tests, y se ajustarán los tests de `App` a la nueva estructura.

**Tech Stack:** React 19, TypeScript, Vitest

---

## Chunk 1: Sidebar sin tab profile

### Task 1: Actualizar `SocialSidebar`

**Files:**
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Step 1: Ejecutar `pnpm test:unit:frontend -- --run src/nostr-overlay/App.test.tsx` y confirmar que la suite todavía depende del tab `Sobre mi`.
- [ ] Step 2: Ajustar `App.test.tsx` para que verifique que el sidebar expandido ya no muestra `Sobre mi`, que muestra exactamente `Sigues` primero y `Seguidores` segundo, que el panel activo por defecto es `following`, y que el sidebar colapsado sigue ocultando ambos tabs.
- [ ] Step 3: Eliminar `profile` de `SocialTab`.
- [ ] Step 4: Quitar `TabsTrigger` y `TabsContent` de `Sobre mi` en `SocialSidebar`.
- [ ] Step 5: Cambiar el tab inicial a `following` y ajustar `TabsList` a `grid-cols-2`.
- [ ] Step 6: Borrar imports, props y estado muertos que solo servían al panel eliminado.
- [ ] Step 7: Buscar solo en el flujo del sidebar social principal y sus tests referencias a `profile` en `SocialTab`, `value="profile"`, `defaultValue="profile"`, setters/defaults equivalentes, y eliminarlas.
- [ ] Step 8: Reejecutar `pnpm test:unit:frontend -- --run src/nostr-overlay/App.test.tsx` y confirmar que el cambio estructural queda cubierto.

## Chunk 2: Eliminar componente huérfano

### Task 2: Borrar `ProfileTab`

**Files:**
- Delete: `src/nostr-overlay/components/ProfileTab.tsx`
- Delete: `src/nostr-overlay/components/ProfileTab.test.tsx`

- [ ] Step 1: Confirmar por búsqueda global que `ProfileTab` solo se usa en `SocialSidebar` y en su propia suite.
- [ ] Step 2: Eliminar `ProfileTab.tsx`.
- [ ] Step 3: Eliminar `ProfileTab.test.tsx`.
- [ ] Step 4: Si la búsqueda de referencias descubre otra suite de overlay social afectada además de `App.test.tsx`, ejecutarla también; si no aparece ninguna, dejar constancia de que `App.test.tsx` es la única suite impactada.

## Chunk 3: Verificación final

### Task 3: Limpiar tests y validar

**Files:**
- Verify: `src/nostr-overlay/App.test.tsx`

- [ ] Step 1: Verificar por búsqueda repo-wide limitada a archivos del sidebar social principal y sus tests que no queden referencias a `ProfileTab`, `SocialTab` con `profile`, `value="profile"`, `defaultValue="profile"`, `setActiveTab('profile')`, ni al texto `Sobre mi`; incluir cualquier suite adicional detectada en Task 2.
- [ ] Step 2: Verificar que el escenario existente de logout en `src/nostr-overlay/App.test.tsx` sigue cubriendo que el contenido del sidebar social desaparece sin depender de `Sobre mi`.
- [ ] Step 3: Verificar que `src/nostr-overlay/components/ProfileTab.test.tsx` ya no existe y que no queda ninguna suite apuntando a `ProfileTab`.
- [ ] Step 4: Ejecutar `pnpm test:unit:frontend -- --run src/nostr-overlay/App.test.tsx`.
- [ ] Step 5: Ejecutar `pnpm typecheck:frontend`.
