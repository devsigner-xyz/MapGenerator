# Wallet And Functional Zaps Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una pagina top-level `Wallet`, persistencia de wallet por usuario, soporte inicial `NWC + WebLN`, preferencias ampliadas de `Zaps` y un flujo de zap real que use la wallet activa.

**Architecture:** La implementacion se divide en cuatro capas: dominio wallet persistido en `src/nostr`, adaptadores `NWC/WebLN`, UI/routing del overlay para `/wallet`, e integracion del flujo de zap con redireccion y reanudacion. La UI consume solo contratos de wallet y estado ya normalizado; los detalles NIP-47/NIP-57 quedan encapsulados en modulos de dominio y servicios del overlay.

**Tech Stack:** React, TypeScript, Vitest, shadcn/ui, Nostr (NIP-47/NIP-57), sonner

---

## Chunk 1: Wallet Domain

### Task 1: Persistencia y modelos de wallet

**Files:**
- Create: `src/nostr/wallet-settings.ts`
- Create: `src/nostr/wallet-settings.test.ts`
- Create: `src/nostr/wallet-activity.ts`
- Create: `src/nostr/wallet-activity.test.ts`

- [ ] **Step 1: Escribir tests que fallen primero**
- [ ] **Step 2: Ejecutar tests enfocados y confirmar fallo**
- [ ] **Step 3: Implementar estado persistido y schema minimo**
- [ ] **Step 4: Re-ejecutar tests y confirmar PASS**

### Task 2: Contrato y parsers base de adapters

**Files:**
- Create: `src/nostr/wallet-types.ts`
- Create: `src/nostr/nwc.ts`
- Create: `src/nostr/nwc.test.ts`
- Create: `src/nostr/webln.ts`
- Create: `src/nostr/webln.test.ts`

- [ ] **Step 5: Escribir tests de parsing/capabilities antes de implementar**
- [ ] **Step 6: Ejecutar tests y confirmar RED**
- [ ] **Step 7: Implementar contratos minimos `NWC/WebLN`**
- [ ] **Step 8: Re-ejecutar tests y confirmar GREEN**

## Chunk 2: Wallet UI And Routing

### Task 3: Routing `/wallet` y entrada top-level en sidebar

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Create: `src/nostr-overlay/components/WalletPage.tsx`
- Create: `src/nostr-overlay/components/WalletPage.test.tsx`

- [ ] **Step 9: Escribir tests de route y sidebar antes de implementar**
- [ ] **Step 10: Ejecutar tests y confirmar RED**
- [ ] **Step 11: Implementar `/wallet` y item `Wallet`**
- [ ] **Step 12: Re-ejecutar tests y confirmar GREEN**

### Task 4: UI de wallet conectada/desconectada

**Files:**
- Modify: `src/nostr-overlay/components/WalletPage.tsx`
- Modify: `src/nostr-overlay/components/WalletPage.test.tsx`

- [ ] **Step 13: Escribir tests de estados vacios, balance, recibir y actividad**
- [ ] **Step 14: Ejecutar tests y confirmar RED**
- [ ] **Step 15: Implementar UI minima con shadcn/ui**
- [ ] **Step 16: Re-ejecutar tests y confirmar GREEN**

## Chunk 3: Zaps Integration

### Task 5: Preferencias ampliadas y redireccion a wallet

**Files:**
- Modify: `src/nostr/zap-settings.ts`
- Modify: `src/nostr/zap-settings.test.ts`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsZapsPage.tsx`
- Modify: `src/nostr-overlay/components/settings-pages/SettingsZapsPage.test.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/SettingsZapsRoute.tsx`
- Modify: `src/nostr-overlay/components/settings-routes/controllers/useZapSettingsController.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 17: Escribir tests de defaults y redireccion sin wallet**
- [ ] **Step 18: Ejecutar tests y confirmar RED**
- [ ] **Step 19: Implementar defaults de zap y redirect a `/wallet`**
- [ ] **Step 20: Re-ejecutar tests y confirmar GREEN**

### Task 6: Ejecucion real del zap y actividad

**Files:**
- Create: `src/nostr/zaps.ts`
- Create: `src/nostr/zaps.test.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 21: Escribir tests de flujo `9734 + invoice + pay` antes de implementar**
- [ ] **Step 22: Ejecutar tests y confirmar RED**
- [ ] **Step 23: Implementar flujo real de zap con wallet activa**
- [ ] **Step 24: Re-ejecutar tests y confirmar GREEN**

## Chunk 4: Verification

### Task 7: Verificacion final de la zona tocada

**Files:**
- No code changes expected

- [ ] **Step 25: Ejecutar test suite enfocada de wallet/zaps/overlay**
Run: `pnpm vitest run src/nostr/wallet-settings.test.ts src/nostr/wallet-activity.test.ts src/nostr/nwc.test.ts src/nostr/webln.test.ts src/nostr/zap-settings.test.ts src/nostr/zaps.test.ts src/nostr-overlay/components/WalletPage.test.tsx src/nostr-overlay/components/settings-pages/SettingsZapsPage.test.tsx src/nostr-overlay/components/OverlaySidebar.test.tsx src/nostr-overlay/App.test.tsx`

- [ ] **Step 26: Ejecutar typecheck frontend**
Run: `pnpm typecheck:frontend`

- [ ] **Step 27: Ejecutar lint frontend si hace falta corregir regresiones**
Run: `pnpm lint:frontend`

- [ ] **Step 28: Commit solo si el usuario lo pide**
