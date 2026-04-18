# Create Account Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anadir un flujo hibrido de `Crear cuenta` desde el login del overlay Nostr, con alta delegada a signer externo y alta local completa con firma y `NIP-44`.

**Architecture:** El login actual se mantiene como selector de acceso (`npub`, `nip07`, `nip46`) y gana una entrada visible a un wizard de alta separado. La cuenta creada localmente se implementa como un nuevo `AuthProvider` para conservar la arquitectura actual de auth, con secreto cifrado en reposo, clave desbloqueada en memoria y capacidades completas de firma y cifrado `nip44` para integrarse con el runtime actual de DMs.

**Tech Stack:** React 19, TypeScript, shadcn/ui radix-nova, Vitest, `nostr-tools`, localStorage, Web Crypto API, provider auth interno.

---

## Scope Decisions

- La rama `Crear cuenta en esta app` soporta `signEvent`, `nip44_encrypt` y `nip44_decrypt` desde V1.
- La proteccion local por PIN/passphrase es **opcional** para el usuario, pero el secreto persistido nunca se guarda en claro.
- El flujo guardado aqui cubre tambien el bootstrap inicial de perfil y relays, pero la implementacion pedida en esta iteracion solo ejecuta los dos primeros chunks.
- No se usan worktrees en esta ejecucion por instruccion explicita del usuario.

## File Structure

### Login and onboarding UI

- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Create: `src/nostr-overlay/components/CreateAccountMethodSelector.tsx`
- Test: `src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx`
- Create later: `src/nostr-overlay/components/CreateAccountDialog.tsx`
- Test later: `src/nostr-overlay/components/CreateAccountDialog.test.tsx`

### Auth domain

- Modify: `src/nostr/auth/session.ts`
- Modify: `src/nostr/auth/auth-service.ts`
- Modify: `src/nostr/auth/auth-service.test.ts`
- Modify: `src/nostr/auth/secure-storage.ts`
- Modify: `src/nostr/auth/secure-storage.test.ts`
- Create: `src/nostr/auth/providers/local-key-provider.ts`
- Test: `src/nostr/auth/providers/local-key-provider.test.ts`
- Create later: `src/nostr/auth/local-key-storage.ts`
- Test later: `src/nostr/auth/local-key-storage.test.ts`

### Overlay integration and bootstrap

- Modify later: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Create later: `src/nostr/auth/bootstrap-profile.ts`
- Test later: `src/nostr/auth/bootstrap-profile.test.ts`

## Chunk 1: Login Entry and Account Creation Selector

**Files:**
- Modify: `src/nostr-overlay/components/LoginGateScreen.tsx`
- Modify: `src/nostr-overlay/components/LoginMethodSelector.tsx`
- Test: `src/nostr-overlay/components/LoginMethodSelector.test.tsx`
- Create: `src/nostr-overlay/components/CreateAccountMethodSelector.tsx`
- Test: `src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx`

- [ ] **Step 1: Write failing tests for the new create-account entry point**

Add tests that prove:
- `LoginGateScreen` exposes a visible `Crear cuenta` action alongside the existing login UI.
- `LoginMethodSelector` remains focused on login methods and does not inline account creation fields.
- A new account creation selector can render exactly two options:
  - `Usar app o extension`
  - `Crear cuenta en esta app`

- [ ] **Step 2: Run targeted tests and confirm red**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx
```

Expected:
- Existing login tests fail because the new CTA is missing.
- New selector tests fail because the component does not exist yet.

- [ ] **Step 3: Implement the minimal UI changes**

Implementation constraints:
- Keep `LoginMethodSelector` strictly as a login selector.
- Add a `Crear cuenta` entry point in `LoginGateScreen`.
- Introduce `CreateAccountMethodSelector` as a minimal presentational selector using existing shadcn primitives.
- Do not build the full wizard in this chunk.

- [ ] **Step 4: Re-run targeted tests and make them green**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Refactor only if needed**

Refactor only for:
- naming clarity
- shadcn composition compliance
- removing duplication between selector labels and CTA wiring

## Chunk 2: Local Auth Provider with NIP-44 Capabilities

**Files:**
- Modify: `src/nostr/auth/session.ts`
- Modify: `src/nostr/auth/auth-service.ts`
- Modify: `src/nostr/auth/auth-service.test.ts`
- Modify: `src/nostr/auth/secure-storage.ts`
- Modify: `src/nostr/auth/secure-storage.test.ts`
- Create: `src/nostr/auth/providers/local-key-provider.ts`
- Test: `src/nostr/auth/providers/local-key-provider.test.ts`

- [ ] **Step 1: Write failing tests for the local auth method**

Add tests that prove:
- `LoginMethod` accepts a new `local` method.
- `defaultCapabilitiesForMethod('local')` includes `canSign: true`, `canEncrypt: true`, `encryptionSchemes: ['nip44']`.
- `createAuthService().startSession('local', ...)` resolves and persists a local session.
- `LocalKeyAuthProvider` signs events with a generated secret key.
- `LocalKeyAuthProvider` performs `nip44` encrypt/decrypt roundtrips.
- `restoreSession()` restores a local session from persisted metadata without silently downgrading capabilities.

- [ ] **Step 2: Run auth tests and confirm red**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/auth/auth-service.test.ts src/nostr/auth/providers/local-key-provider.test.ts src/nostr/auth/secure-storage.test.ts
```

Expected:
- Type/test failures because the `local` method and provider do not exist yet.

- [ ] **Step 3: Implement the minimal local provider and service wiring**

Implementation constraints:
- Use `nostr-tools/pure` for key generation, signing, and public key derivation.
- Use `nostr-tools` `nip44.v2` helpers for encrypt/decrypt.
- Keep the first provider version in-memory only for secret material.
- Persist only session metadata in this chunk.
- `secure-storage` must accept the `local` method but still reject legacy `nsec` session restoration.

- [ ] **Step 4: Re-run auth tests and make them green**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/auth/auth-service.test.ts src/nostr/auth/providers/local-key-provider.test.ts src/nostr/auth/secure-storage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Refactor only after green**

Allowed refactors:
- extract tiny local helpers for hex/secret normalization
- keep provider API aligned with existing provider contract
- remove duplication in provider map setup

## Chunk 3: Local Secret Storage and Device Protection

**Files:**
- Create: `src/nostr/auth/local-key-storage.ts`
- Test: `src/nostr/auth/local-key-storage.test.ts`
- Modify: `src/nostr/auth/auth-service.ts`
- Modify: `src/nostr/auth/providers/local-key-provider.ts`

Summary:
- Add encrypted-at-rest local secret storage.
- Make PIN/passphrase optional.
- Keep unlocked key material in memory only.

## Chunk 4: Full Create Account Wizard

**Files:**
- Create: `src/nostr-overlay/components/CreateAccountDialog.tsx`
- Test: `src/nostr-overlay/components/CreateAccountDialog.test.tsx`

Summary:
- Generate keypair.
- Show backup.
- Optional profile setup.
- Optional local protection.
- Finish with automatic local login.

## Chunk 5: Bootstrap Profile and Relay Publishing

**Files:**
- Create: `src/nostr/auth/bootstrap-profile.ts`
- Test: `src/nostr/auth/bootstrap-profile.test.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`

Summary:
- Publish `kind 0` profile.
- Publish `kind 10002` relay list.
- Publish `kind 10050` DM inbox relays.
- Keep session alive if bootstrap publish partially fails.

## Validation

For the implemented chunks, always run at minimum:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/LoginMethodSelector.test.tsx src/nostr-overlay/components/CreateAccountMethodSelector.test.tsx src/nostr/auth/auth-service.test.ts src/nostr/auth/providers/local-key-provider.test.ts src/nostr/auth/secure-storage.test.ts
pnpm typecheck:frontend
pnpm lint:frontend
```

## Execution Note

La ejecucion pedida por el usuario en esta sesion cubre solo:
- Chunk 1
- Chunk 2

Los demas chunks quedan planificados pero no comprometidos en esta iteracion.
