# Nostr Multi-Login Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir login en overlay con `npub`, `nsec` y proveedor de firma (NIP-07), con base lista para NIP-46 y para futuras acciones de escritura (seguir, publicar, DM).

**Architecture:** Separar autenticacion de lectura/escritura con una sesion unificada (`method`, `readonly`, `capabilities`) y proveedores de signer por metodo. Mantener `npub` como modo solo lectura y centralizar cualquier accion firmada en una puerta unica para evitar bypass de seguridad. Para `nsec`, almacenar solo formato cifrado (`ncryptsec`) y desbloquear en memoria bajo demanda.

**Tech Stack:** React 19, TypeScript, NDK (`@nostr-dev-kit/ndk`), nostr-tools, Vitest, Vite.

---

## Chunk 1: Dominio de sesion y seguridad de credenciales

### Task 1: Definir modelo de sesion multi-metodo

**Files:**
- Create: `src/nostr/auth/session.ts`
- Create: `src/nostr/auth/session.test.ts`

- [ ] Crear tipos `LoginMethod`, `SessionCapabilities`, `AuthSessionState`.
- [ ] Incluir estado `readonly` y `locked` en el modelo.
- [ ] Exponer helpers puros (`isWriteEnabled`, `isEncryptionEnabled`, `isSessionReady`).
- [ ] Cubrir helpers con tests unitarios.

### Task 2: Parseo y normalizacion de credenciales de entrada

**Files:**
- Create: `src/nostr/auth/credentials.ts`
- Create: `src/nostr/auth/credentials.test.ts`
- Modify: `src/nostr/npub.ts`
- Modify: `src/nostr/npub.test.ts`

- [ ] Implementar parser para `npub`, `nsec`, `hex` y marcador de `bunker://`.
- [ ] Convertir internamente a hex cuando aplique, preservando formato de entrada solo para UX.
- [ ] Reusar validaciones actuales de `npub` y agregar validacion estricta de `nsec`.
- [ ] Agregar tests para casos invalidos y mixtos.

### Task 3: Storage seguro para `nsec` con `ncryptsec`

**Files:**
- Create: `src/nostr/auth/secure-storage.ts`
- Create: `src/nostr/auth/secure-storage.test.ts`

- [ ] Implementar persistencia de sesion sin secretos en claro.
- [ ] Para login con `nsec`, guardar solo `ncryptsec` + metadata minima (`method`, `pubkey`, `createdAt`).
- [ ] Implementar funciones `lockSession`/`unlockSession(passphrase)` y `clearSession`.
- [ ] Verificar por test que nunca se serializa `nsec` plano.

### Task 4: Verificacion del chunk 1

**Files:**
- Test: `src/nostr/auth/session.test.ts`
- Test: `src/nostr/auth/credentials.test.ts`
- Test: `src/nostr/auth/secure-storage.test.ts`
- Test: `src/nostr/npub.test.ts`

- [ ] Run: `pnpm vitest run src/nostr/auth/session.test.ts src/nostr/auth/credentials.test.ts src/nostr/auth/secure-storage.test.ts src/nostr/npub.test.ts`
- [ ] Expected: PASS en todos los tests del chunk.

## Chunk 2: Proveedores de login y abstraccion signer

### Task 5: Crear contrato comun de proveedor de login

**Files:**
- Create: `src/nostr/auth/providers/types.ts`
- Create: `src/nostr/auth/providers/types.test.ts`

- [ ] Definir interfaz de proveedor (`resolveUser`, `signEvent`, `encrypt`, `decrypt`, `lock`, `supports`).
- [ ] Definir tipos de error estandar (`AUTH_READONLY`, `AUTH_LOCKED`, `AUTH_PROVIDER_UNAVAILABLE`).
- [ ] Agregar test de compatibilidad de capacidades por metodo.

### Task 6: Implementar proveedor `npub` (readonly) y proveedor `nsec`

**Files:**
- Create: `src/nostr/auth/providers/npub-provider.ts`
- Create: `src/nostr/auth/providers/npub-provider.test.ts`
- Create: `src/nostr/auth/providers/nsec-provider.ts`
- Create: `src/nostr/auth/providers/nsec-provider.test.ts`

- [ ] `npub-provider`: resolver `pubkey` y declarar `readonly=true`.
- [ ] `nsec-provider`: usar `NDKPrivateKeySigner` con soporte de `ncryptsec`.
- [ ] Garantizar que el proveedor `nsec` no expone secreto luego de lock.
- [ ] Cubrir con tests de login, lock/unlock y errores de passphrase.

### Task 7: Implementar proveedor `NIP-07` y esqueleto `NIP-46`

**Files:**
- Create: `src/nostr/auth/providers/nip07-provider.ts`
- Create: `src/nostr/auth/providers/nip07-provider.test.ts`
- Create: `src/nostr/auth/providers/nip46-provider.ts`

- [ ] `nip07-provider`: detectar `window.nostr`, obtener pubkey y capacidades nip04/nip44.
- [ ] Manejar error claro cuando extension no esta disponible.
- [ ] Crear `nip46-provider` como contrato inicial sin UI final (feature flagged).
- [ ] Agregar tests del proveedor NIP-07 con mocks de `window.nostr`.

### Task 8: Servicio de autenticacion unificado

**Files:**
- Create: `src/nostr/auth/auth-service.ts`
- Create: `src/nostr/auth/auth-service.test.ts`

- [ ] Implementar `startSession`, `restoreSession`, `switchMethod`, `logout`.
- [ ] Integrar storage seguro y proveedores.
- [ ] Exponer estado observable para hooks de overlay.
- [ ] Tests end-to-end del servicio con `npub`, `nsec` y `nip07`.

### Task 9: Verificacion del chunk 2

**Files:**
- Test: `src/nostr/auth/providers/*.test.ts`
- Test: `src/nostr/auth/auth-service.test.ts`

- [ ] Run: `pnpm vitest run src/nostr/auth/providers/npub-provider.test.ts src/nostr/auth/providers/nsec-provider.test.ts src/nostr/auth/providers/nip07-provider.test.ts src/nostr/auth/auth-service.test.ts`
- [ ] Expected: PASS en providers + servicio.

## Chunk 3: Integracion con overlay y reemplazo del input actual

### Task 10: Migrar hook principal a sesion basada en pubkey

**Files:**
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr/follows.ts`
- Modify: `src/nostr/follows.test.ts`

- [ ] Reemplazar `submitNpub` por `startSession` basado en `auth-service`.
- [ ] Extraer `fetchFollowsByPubkey(pubkeyHex, client)` y mantener wrapper `fetchFollowsByNpub` para compatibilidad temporal.
- [ ] Conservar pipeline de carga de mapa/perfiles/followers sin regresiones.
- [ ] Testear flujo inicial con pubkey ya resuelta.

### Task 11: Reemplazar formulario `NpubForm` por selector en sidebar overlay

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Create: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/styles.css`

- [ ] Quitar `NpubForm` del panel principal.
- [ ] Agregar UI "Continuar con" en sidebar con metodos: `npub`, `nsec`, `Extension (NIP-07)`, `Bunker (proximamente)`.
- [ ] Mostrar estado visible: `Solo lectura` vs `Puede firmar` y accion `Bloquear/Desbloquear` para `nsec`.
- [ ] Mantener copy y estilo actual del overlay (sin romper layout movil/escritorio).

### Task 12: Ajustar pruebas de overlay por cambio de UX de login

**Files:**
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr-overlay/selection-focus.test.tsx`
- Create: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`

- [ ] Reemplazar interacciones de `input[name="npub"]` por flujo de selector.
- [ ] Validar que el modo `npub` siga cargando grafo y mapa.
- [ ] Validar transiciones `readonly`/`write-enabled`.
- [ ] Mantener cobertura de tabs sociales y seleccion de personas.

### Task 13: Verificacion del chunk 3

**Files:**
- Test: `src/nostr-overlay/App.test.tsx`
- Test: `src/nostr-overlay/selection-focus.test.tsx`
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Test: `src/nostr/follows.test.ts`

- [ ] Run: `pnpm vitest run src/nostr-overlay/App.test.tsx src/nostr-overlay/selection-focus.test.tsx src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr/follows.test.ts`
- [ ] Expected: PASS en overlay + follows.

## Chunk 4: Puerta unica para acciones firmadas (base para follow/DM/post)

### Task 14: Definir gateway de escritura y cifrado

**Files:**
- Create: `src/nostr/write-gateway.ts`
- Create: `src/nostr/write-gateway.test.ts`
- Modify: `src/nostr/types.ts`

- [ ] Crear API unica (`publishEvent`, `publishTextNote`, `publishContactList`, `encryptDm`, `decryptDm`).
- [ ] Enforzar bloqueo central para `readonly`/`locked`.
- [ ] Encapsular signer del metodo activo sin exponer clave.
- [ ] Agregar tests de guard y rutas felices.

### Task 15: Integrar indicadores de capacidad futura en UI

**Files:**
- Modify: `src/nostr-overlay/components/ProfileTab.tsx`
- Modify: `src/nostr-overlay/components/SocialSidebar.tsx`

- [ ] Mostrar mensajes contextuales para acciones futuras (seguir, DM, publicar) segun capacidades.
- [ ] Evitar botones funcionales incompletos; solo estados y CTAs de autenticacion.
- [ ] Verificar accesibilidad basica (`aria-label`, foco, disabled states).

### Task 16: Verificacion final

**Files:**
- Test: `src/nostr-overlay/**/*.test.tsx`
- Test: `src/nostr/**/*.test.ts`

- [ ] Run: `pnpm test:unit`
- [ ] Expected: PASS suite unitaria completa.
- [ ] Run: `pnpm typecheck`
- [ ] Expected: sin errores de TypeScript.
- [ ] Run: `pnpm build`
- [ ] Expected: build exitoso sin errores.

## Riesgos y mitigaciones

- [ ] **Riesgo:** regressions por cambio de entrada (`npub` input -> selector). **Mitigacion:** mantener compat temporal en hook y cubrir con tests de integracion.
- [ ] **Riesgo:** exponer secretos en logs/storage. **Mitigacion:** pruebas explicitas de no persistencia de `nsec` plano + lint manual de logs.
- [ ] **Riesgo:** comportamiento inconsistente entre providers. **Mitigacion:** contrato comun + test matrix por metodo.
- [ ] **Riesgo:** bloqueo de UX si NIP-07 no existe. **Mitigacion:** fallback claro a `npub` y `nsec`.

## Criterios de aceptacion

- [ ] El overlay ya no muestra el input npub original.
- [ ] El usuario puede iniciar sesion desde sidebar con `npub`, `nsec` o NIP-07.
- [ ] En modo `npub` el sistema se comporta como `readonly`.
- [ ] En modo `nsec` no se almacena ninguna clave privada en claro.
- [ ] Existe una puerta unica para operaciones firmadas, lista para follow/post/DM.
