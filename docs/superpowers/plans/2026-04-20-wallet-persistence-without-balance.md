# Wallet Persistence Without Balance Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mantener la wallet recordada tras recargar, restaurar automaticamente WebLN cuando sea posible y eliminar completamente el concepto de balance de la aplicacion, junto con el flujo de recibir.

**Architecture:** La persistencia de wallet seguira apoyandose en `wallet-settings`, pero la app dejara de modelar balance como capacidad, accion o UI. La restauracion automatica se centrara en revalidar la conexion recordada, especialmente en WebLN, sin pedir ni mostrar balance. Eliminar balance del modelo compartido evita codigo muerto y reduce ambiguedad en futuras features.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, WebLN, NWC.

---

**Alcance confirmado**
- Quitar balance de toda la app.
- Quitar el flujo de recibir de `/wallet`.
- Mantener pagos y zaps.
- Mantener persistencia/restauracion de wallet.
- No anadir cache de balance ni UI sustitutiva.

**Mapa de archivos**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/WalletPage.tsx`
- Modify: `src/nostr/wallet-types.ts`
- Modify: `src/nostr/wallet-settings.ts`
- Modify: `src/nostr/webln.ts`
- Modify: `src/nostr/nwc.ts`
- Modify: `src/nostr-overlay/components/WalletPage.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr/webln.test.ts`
- Modify: `src/nostr/nwc.test.ts`
- Modify: `src/nostr/wallet-settings.test.ts`

### Task 1: Eliminar balance del modelo compartido

**Files:**
- Modify: `src/nostr/wallet-types.ts`
- Modify: `src/nostr/wallet-settings.ts`
- Modify: `src/nostr/webln.ts`
- Modify: `src/nostr/nwc.ts`
- Test: `src/nostr/webln.test.ts`
- Test: `src/nostr/nwc.test.ts`
- Test: `src/nostr/wallet-settings.test.ts`

- [ ] Eliminar `getBalance` de `WalletCapabilities`.
- [ ] Eliminar la normalizacion de `getBalance` en `wallet-settings.ts`.
- [ ] Eliminar `getBalance` del tipo `WebLnLikeProvider` y de `resolveWebLnCapabilities`.
- [ ] Eliminar el soporte `get_balance` del parser de capacidades NWC.
- [ ] Eliminar `getBalance()` del cliente NWC si no queda ningun consumidor.
- [ ] Ajustar tests de `webln`, `nwc` y `wallet-settings` para reflejar el nuevo shape de capacidades.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project frontend src/nostr/webln.test.ts src/nostr/nwc.test.ts src/nostr/wallet-settings.test.ts`

**Resultado esperado**
- La app ya no modela balance como capability interna.
- No quedan metodos o tests de balance en las capas NWC/WebLN propias.

### Task 2: Simplificar `/wallet` a conexion + actividad

**Files:**
- Modify: `src/nostr-overlay/components/WalletPage.tsx`
- Test: `src/nostr-overlay/components/WalletPage.test.tsx`

- [ ] Anadir un test para una wallet recordada con `restoreState: 'reconnect-required'` que siga mostrandose como wallet conocida.
- [ ] Eliminar props de `WalletPage` ligadas a balance y recibir.
- [ ] Eliminar la card de `Balance`.
- [ ] Eliminar la card de `Recibir`.
- [ ] Mantener en la pagina solo: conexion actual, acciones de conectar/reconectar/desconectar/refrescar y actividad reciente.
- [ ] Cambiar el comportamiento visual para que `activeConnection !== null` no renderice el empty state de `Sin wallet conectada`.
- [ ] Actualizar tests existentes que hoy esperan `Consultar balance`, `Generar invoice`, `Copiar invoice` o texto de balance.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/WalletPage.test.tsx`

**Resultado esperado**
- `/wallet` queda centrada en conexion y actividad.
- Una wallet recordada no `desaparece` tras reload.

### Task 3: Restauracion automatica de WebLN sin balance

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Anadir un test de integracion que conecte WebLN, remonte la app y verifique intento de restauracion automatica.
- [ ] Eliminar estado local ya innecesario: `walletReceiveAmountInput`, `walletReceiveAmountError`, `walletBalanceDisplay`, `walletGeneratedInvoice`.
- [ ] Eliminar handlers ya sin uso: `requestWalletBalance` y `generateWalletInvoice`.
- [ ] Ajustar `refreshWallet` para que solo revalide conexion/capacidades.
- [ ] Anadir un efecto de restauracion: si la conexion persistida es `webln` y existe provider, intentar `enable()` al hidratar.
- [ ] Si `enable()` funciona, persistir `restoreState: 'connected'`.
- [ ] Si falla o no hay provider, mantener la wallet recordada en `reconnect-required`.
- [ ] Mantener `NWC` con su persistencia actual.
- [ ] Ajustar el render de `/wallet` para pasar solo props vigentes.
- [ ] Reemplazar o reescribir el test actual `connects WebLN wallet and requests balance from the wallet page` por uno orientado a conexion/restauracion, ya sin balance.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx`

**Resultado esperado**
- WebLN se intenta revalidar automaticamente tras reload.
- La app deja de hacer cualquier consulta de balance.

### Task 4: Limpiar regresiones de zaps y fixtures WebLN/NWC

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] Revisar tests de zaps que stubbean `window.webln.getBalance` aunque ya no sea necesario.
- [ ] Eliminar de esos fixtures cualquier dependencia de `getBalance`.
- [ ] Confirmar que zaps por WebLN siguen pasando sin balance ni recibir.
- [ ] Confirmar que conexion NWC sigue pasando aunque la app ignore `get_balance` en capabilities.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx`

**Resultado esperado**
- Los tests de pago no arrastran restos del feature de balance.
- La eliminacion del balance no afecta al flujo de zaps.

### Task 5: Verificacion final

**Files:**
- Modify: si hiciera falta por fallos detectados

- [ ] Ejecutar:
`pnpm test:unit:frontend`
- [ ] Ejecutar:
`pnpm typecheck:frontend`
- [ ] Ejecutar:
`pnpm lint:frontend`
- [ ] Buscar referencias residuales con:
`grep` para `getBalance`, `Consultar balance`, `walletBalanceDisplay`, `makeInvoice`, `Recibir`, `Balance`
- [ ] Confirmar que cualquier referencia restante a `balance` fuera de wallet pertenece solo a clases CSS como `text-balance`, no a logica funcional.

**Resultado esperado**
- Sin balance funcional en la app.
- Sin flujo de recibir en `/wallet`.
- Conexion persistida/restaurada con mejor UX.

**Recomendacion**
Haria la eliminacion de balance completa, no solo visual. Es mas limpia y el alcance esta bien contenido.

**Interpretacion de producto cerrada**
- `olvidate del balance` significa: no mostrarlo, no consultarlo, no modelarlo y no testearlo como feature de la app.
