# NIP-46 Remote Signing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar NIP-46 de extremo a extremo para login y firma remota interoperable en el overlay, sin exponer claves privadas en el cliente.

**Architecture:** Se implementa un proveedor NIP-46 completo sobre eventos `kind:24133` cifrados con NIP-44, con handshake estricto (`connect -> get_public_key -> switch_relays`) y permisos granulares. La capa de provider queda separada en parsing URI, transporte RPC y control de sesion para mantener testabilidad y evitar acoplar UI con detalles de protocolo. Se integran cambios minimos en auth-service y overlay para habilitar bunker login sin romper `npub`, `nsec` ni `nip07`.

**Tech Stack:** TypeScript, React 19, Vitest, nostr-tools, @nostr-dev-kit/ndk.

---

## Modo de seguimiento (checklist vivo)

- [ ] Este archivo se actualiza durante la ejecucion (marcar pasos/tareas completadas en el momento).
- [ ] Solo se avanza a la siguiente fase cuando la verificacion de la fase actual esta en verde.
- [ ] No se cambia alcance fuera de NIP-46 sin anotar decision en este plan.

## Uso de `nostr-specialist` en todas las fases

- [ ] Consultar `references/nip-priority-matrix.md` para confirmar prioridad de NIPs de identidad/auth y relay routing.
- [ ] Confirmar estado de NIPs en `references/nips-index.md` antes de implementar o agregar fallback.
- [ ] Validar reglas de `NIP-46`, `NIP-44`, `NIP-01`, `NIP-11` contra `references/*.md` (fuente canonica).
- [ ] Cerrar cada fase comparando contra `references/protocol-checklists.md` (event validity, auth, relay interoperability).

## File Structure (unidades y responsabilidades)

- `src/nostr/auth/providers/nip46-provider.ts`: orquestacion de sesion NIP-46 (connect, pubkey real, permisos, metodos signer).
- `src/nostr/auth/providers/nip46-provider.test.ts`: pruebas unitarias e integracion ligera del provider.
- `src/nostr/auth/providers/nip46/uri.ts` (nuevo): parser estricto de `bunker://` y `nostrconnect://`.
- `src/nostr/auth/providers/nip46/transport.ts` (nuevo): publicacion/suscripcion de eventos `kind:24133`, correlacion por `id`, timeout.
- `src/nostr/auth/providers/nip46/rpc.ts` (nuevo): serializacion request/response JSON-RPC-like sobre NIP-44.
- `src/nostr/auth/providers/nip46/permissions.ts` (nuevo): parse/validacion de permisos `method[:params]`.
- `src/nostr/auth/providers/nip46/crypto.ts` (nuevo): adaptador de cifrado/descifrado NIP-44 (apoyado en signer activo).
- `src/nostr/auth/credentials.ts`: deteccion de credenciales y derivacion de `bunkerUri`.
- `src/nostr/auth/credentials.test.ts`: cobertura de parsing bunker/nostrconnect y errores.
- `src/nostr-overlay/components/LoginMethodSelector.tsx`: entrada UX para NIP-46.
- `src/nostr-overlay/components/LoginMethodSelector.test.tsx`: pruebas UI del nuevo metodo.
- `src/nostr/auth/auth-service.test.ts`: no regresiones de sesion al agregar NIP-46 real.

## Chunk 1: Parsing y contrato de conexion NIP-46

### Task 1: Implementar parser estricto de URIs NIP-46

**Contexto (`nostr-specialist`):**
- NIP principal: `46` (activo).
- Reglas criticas: distinguir `remote-signer-pubkey` de `user-pubkey`; validar `secret`; soportar ambos esquemas de inicio.

**Files:**
- Create: `src/nostr/auth/providers/nip46/uri.ts`
- Test: `src/nostr/auth/providers/nip46/uri.test.ts`

- [ ] **Step 1: Escribir tests fallando para `bunker://`**
- [ ] **Step 2: Escribir tests fallando para `nostrconnect://`**
- [ ] **Step 3: Ejecutar test y confirmar FAIL inicial**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/uri.test.ts`
Expected: FAIL por parser no implementado.

- [ ] **Step 4: Implementar parser minimo para pasar tests**
- [ ] **Step 5: Re-ejecutar tests del parser**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/uri.test.ts`
Expected: PASS.

### Task 2: Integrar parsing NIP-46 en credenciales de auth

**Contexto (`nostr-specialist`):**
- Routing e identificadores deben ser deterministicos; no aceptar inputs ambiguos.

**Files:**
- Modify: `src/nostr/auth/credentials.ts`
- Test: `src/nostr/auth/credentials.test.ts`

- [ ] **Step 1: Agregar tests fallando para variaciones validas/invalidas de bunker URI**
- [ ] **Step 2: Ejecutar test y confirmar FAIL esperado**

Run: `pnpm vitest run src/nostr/auth/credentials.test.ts`
Expected: FAIL en casos nuevos.

- [ ] **Step 3: Ajustar deteccion y parseo en `credentials.ts`**
- [ ] **Step 4: Correr tests de credenciales**

Run: `pnpm vitest run src/nostr/auth/credentials.test.ts`
Expected: PASS.

### Task 3: Verificacion de chunk 1

**Files:**
- Test: `src/nostr/auth/providers/nip46/uri.test.ts`
- Test: `src/nostr/auth/credentials.test.ts`

- [ ] **Step 1: Ejecutar suite del chunk**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/uri.test.ts src/nostr/auth/credentials.test.ts`
Expected: PASS.

## Chunk 2: Transporte RPC `kind:24133` + NIP-44

### Task 4: Crear transporte de eventos NIP-46 con correlacion por `id`

**Contexto (`nostr-specialist`):**
- `NIP-46`: requests/responses usan `kind:24133`, `p` tag correcto y `id` compartido.
- `NIP-01`: validar forma basica del evento antes de procesar respuesta.

**Files:**
- Create: `src/nostr/auth/providers/nip46/transport.ts`
- Test: `src/nostr/auth/providers/nip46/transport.test.ts`

- [ ] **Step 1: Tests fallando para subscribe/publish/timeout/correlation**
- [ ] **Step 2: Ejecutar tests y validar FAIL inicial**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/transport.test.ts`
Expected: FAIL por transporte inexistente.

- [ ] **Step 3: Implementar transporte minimo (publish + wait response por `id`)**
- [ ] **Step 4: Re-ejecutar tests del transporte**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/transport.test.ts`
Expected: PASS.

### Task 5: Crear capa RPC cifrada para requests/responses NIP-46

**Contexto (`nostr-specialist`):**
- `NIP-44`: payload cifrado versionado para contenido de request/response.
- `NIP-46`: formato JSON-RPC-like con `id`, `method`, `params` y `result/error`.

**Files:**
- Create: `src/nostr/auth/providers/nip46/rpc.ts`
- Create: `src/nostr/auth/providers/nip46/crypto.ts`
- Test: `src/nostr/auth/providers/nip46/rpc.test.ts`

- [ ] **Step 1: Tests fallando para encode/decode request y response**
- [ ] **Step 2: Ejecutar tests y confirmar FAIL esperado**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/rpc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar serializacion + cifrado/descifrado NIP-44**
- [ ] **Step 4: Re-ejecutar tests RPC**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/rpc.test.ts`
Expected: PASS.

### Task 6: Verificacion de chunk 2

**Files:**
- Test: `src/nostr/auth/providers/nip46/transport.test.ts`
- Test: `src/nostr/auth/providers/nip46/rpc.test.ts`

- [ ] **Step 1: Ejecutar suite del chunk**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/transport.test.ts src/nostr/auth/providers/nip46/rpc.test.ts`
Expected: PASS.

## Chunk 3: Sesion NIP-46 completa en provider

### Task 7: Implementar handshake `connect -> get_public_key -> switch_relays`

**Contexto (`nostr-specialist`):**
- Debe quedar separada identidad signer remoto vs identidad usuario.
- `get_public_key` es obligatorio tras conectar.
- `switch_relays` se solicita al establecer conexion y de forma periodica razonable.

**Files:**
- Modify: `src/nostr/auth/providers/nip46-provider.ts`
- Test: `src/nostr/auth/providers/nip46-provider.test.ts`

- [ ] **Step 1: Agregar tests fallando para resolveSession exitoso y errores de secret**
- [ ] **Step 2: Ejecutar test y confirmar FAIL**

Run: `pnpm vitest run src/nostr/auth/providers/nip46-provider.test.ts`
Expected: FAIL en nuevos escenarios.

- [ ] **Step 3: Implementar `resolveSession` con handshake completo**
- [ ] **Step 4: Re-ejecutar tests de provider**

Run: `pnpm vitest run src/nostr/auth/providers/nip46-provider.test.ts`
Expected: PASS en handshake.

### Task 8: Implementar metodos signer + permisos granulares

**Contexto (`nostr-specialist`):**
- Reglas de permisos: `method[:params]`; `sign_event:<kind>` debe aplicarse estrictamente.
- Compatibilidad: `nip04_*` puede existir como fallback explicito, no como ruta principal.

**Files:**
- Create: `src/nostr/auth/providers/nip46/permissions.ts`
- Test: `src/nostr/auth/providers/nip46/permissions.test.ts`
- Modify: `src/nostr/auth/providers/nip46-provider.ts`
- Test: `src/nostr/auth/providers/nip46-provider.test.ts`

- [ ] **Step 1: Escribir tests fallando de permisos (allow/deny)**
- [ ] **Step 2: Ejecutar tests y confirmar FAIL**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/permissions.test.ts src/nostr/auth/providers/nip46-provider.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar evaluacion de permisos y metodos (`sign_event`, `nip44_encrypt`, `nip44_decrypt`, `ping`)**
- [ ] **Step 4: Re-ejecutar tests**

Run: `pnpm vitest run src/nostr/auth/providers/nip46/permissions.test.ts src/nostr/auth/providers/nip46-provider.test.ts`
Expected: PASS.

### Task 9: Verificacion de chunk 3

**Files:**
- Test: `src/nostr/auth/providers/nip46-provider.test.ts`
- Test: `src/nostr/auth/providers/nip46/*.test.ts`

- [ ] **Step 1: Ejecutar suite del chunk**

Run: `pnpm vitest run src/nostr/auth/providers/nip46-provider.test.ts src/nostr/auth/providers/nip46/*.test.ts`
Expected: PASS.

## Chunk 4: Integracion en overlay y auth-service

### Task 10: Exponer metodo NIP-46 en selector de login

**Contexto (`nostr-specialist`):**
- UX de protocolo: entrada bunker/nostrconnect clara, sin mezclar con `nsec`.
- Debe mantener compatibilidad con metodos existentes.

**Files:**
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`

- [ ] **Step 1: Crear tests fallando para render y submit de metodo NIP-46**
- [ ] **Step 2: Ejecutar tests y confirmar FAIL**

Run: `pnpm vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx`
Expected: FAIL en casos NIP-46.

- [ ] **Step 3: Implementar UI para bunker URI + submit `startSession('nip46', { bunkerUri })`**
- [ ] **Step 4: Re-ejecutar tests del selector**

Run: `pnpm vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx`
Expected: PASS.

### Task 11: Asegurar no-regresion de auth-service y flujo overlay

**Contexto (`nostr-specialist`):**
- No romper `npub`, `nsec`, `nip07`.
- Mantener estado de sesion coherente (`readonly`, `locked`, `capabilities`).

**Files:**
- Modify: `src/nostr/auth/auth-service.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Agregar tests fallando para inicio de sesion NIP-46 y fallback de errores**
- [ ] **Step 2: Ejecutar tests y confirmar FAIL**

Run: `pnpm vitest run src/nostr/auth/auth-service.test.ts src/nostr-overlay/App.test.tsx`
Expected: FAIL en escenarios nuevos.

- [ ] **Step 3: Ajustar integracion en hook/servicio**
- [ ] **Step 4: Re-ejecutar tests de integracion**

Run: `pnpm vitest run src/nostr/auth/auth-service.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS.

### Task 12: Verificacion de chunk 4

**Files:**
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Test: `src/nostr/auth/auth-service.test.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Ejecutar suite del chunk**

Run: `pnpm vitest run src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr/auth/auth-service.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS.

## Chunk 5: Cumplimiento de protocolo y cierre

### Task 13: Checklist de compatibilidad protocolar

**Contexto (`nostr-specialist`):**
- Validar contra `protocol-checklists.md` antes de declarar compatibilidad.

**Files:**
- Modify: `docs/superpowers/plans/2026-04-09-nip46-remote-signing-checklist.md`

- [ ] **Step 1: Confirmar Event Validity Baseline (NIP-01) en provider y tests**
- [ ] **Step 2: Confirmar Identity & Authentication (NIP-46) con validacion de autenticidad/autorizacion**
- [ ] **Step 3: Confirmar Relay Interoperability (NIP-11 + switch relays)**
- [ ] **Step 4: Documentar fallback legacy (si se implementa `nip04_*`) y mantenerlo explicito**

### Task 14: Verificacion final del branch

**Files:**
- Test: `src/nostr/auth/providers/**/*.test.ts`
- Test: `src/nostr/auth/**/*.test.ts`
- Test: `src/nostr-overlay/**/*.test.tsx`

- [ ] **Step 1: Ejecutar suite unitaria completa**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 2: Ejecutar typecheck**

Run: `pnpm typecheck`
Expected: PASS sin errores TypeScript.

- [ ] **Step 3: Ejecutar build**

Run: `pnpm build`
Expected: build exitoso.

## Criterios de aceptacion

- [ ] `src/nostr/auth/providers/nip46-provider.ts` deja de ser placeholder y soporta flujo NIP-46 funcional.
- [ ] Se soporta handshake con validacion de secret y obtencion de `user-pubkey` tras conectar.
- [ ] `switch_relays` se ejecuta en inicializacion de sesion y actualiza ruta de comunicacion.
- [ ] UI permite iniciar sesion con bunker URI (NIP-46) desde selector de login.
- [ ] No hay regresiones en `npub`, `nsec` y `nip07`.
- [ ] Se valida compatibilidad protocolar usando las referencias del skill `nostr-specialist`.
