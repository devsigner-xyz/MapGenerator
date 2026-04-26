# I18n Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use `/subagent-driven-development` if subagents are available, or `/executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove remaining hardcoded user-visible strings from `App.tsx` and App-extracted overlay modules.

**Architecture:** Keep translation ownership in `src/i18n/messages/{es,en}.ts`. Components should use `useI18n()` when they already live in render code; non-component controllers should receive `language` and call `translate(language, key)`.

**Tech Stack:** React 19, TypeScript, existing i18n catalog, Sonner toasts, Vitest jsdom.

---

## Context

Plans 1-6 are already reflected in the current code. Current audit found hardcoded user-visible copy in `App.tsx`, `use-wallet-zap-controller.ts`, `ChatsRouteContainer.tsx`, `OverlayMapInteractionLayer.tsx`, zap amount labels, and wallet activity status rendering.

## Files

- Create: `src/nostr-overlay/i18n-cleanup.structure.test.ts`.
- Modify: `src/i18n/messages/es.ts`.
- Modify: `src/i18n/messages/en.ts`.
- Modify: `src/nostr-overlay/App.tsx`.
- Modify: `src/nostr-overlay/controllers/use-wallet-zap-controller.ts`.
- Modify: `src/nostr-overlay/routes/ChatsRouteContainer.tsx`.
- Modify: `src/nostr-overlay/shell/OverlayMapInteractionLayer.tsx`.
- Modify: `src/nostr-overlay/components/NoteCard.tsx`.
- Modify: `src/nostr-overlay/components/PeopleListTab.tsx`.
- Modify: `src/nostr-overlay/components/WalletPage.tsx`.
- Modify: `src/nostr-overlay/components/settings-pages/SettingsZapsPage.tsx`.
- Modify tests near each changed module.

## Non-Goals

- Do not change Nostr event shapes, zap semantics, wallet persistence shape, relay behavior, or auth behavior.
- Do not translate arbitrary `Error.message` values returned by services; only translate local fallback strings.
- Do not perform a full all-overlay i18n audit outside the App refactor scope.

## Task 1: Add I18n Source Guard

- [ ] **Step 1: Create failing guard test**

Create `src/nostr-overlay/i18n-cleanup.structure.test.ts` that reads target files and fails on known hardcoded Spanish fragments and zap amount templates.

Guard targets should include `App.tsx`, `use-wallet-zap-controller.ts`, `ChatsRouteContainer.tsx`, `OverlayMapInteractionLayer.tsx`, `NoteCard.tsx`, `PeopleListTab.tsx`, `WalletPage.tsx`, and `SettingsZapsPage.tsx`.

- [ ] **Step 2: Run guard and verify failure**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/i18n-cleanup.structure.test.ts
```

Expected: FAIL on current hardcoded strings.

## Task 2: Add Translation Keys

- [ ] **Step 1: Add message keys**

Add keys to `src/i18n/messages/es.ts` and `src/i18n/messages/en.ts` for:

```ts
'app.toast.followUpdateFailed'
'feed.toast.repostRemoved'
'feed.toast.repostPublished'
'feed.toast.repostRemoveFailed'
'feed.toast.repostPublishFailed'
'feed.toast.postPublished'
'feed.toast.postPublishFailed'
'feed.toast.quotePublished'
'feed.toast.quotePublishFailed'
'wallet.toast.paymentSent'
'wallet.toast.paymentFailed'
'wallet.toast.weblnUnavailable'
'wallet.toast.weblnReconnectFailed'
'wallet.toast.weblnPaymentsUnsupported'
'wallet.toast.connected'
'wallet.toast.nwcConnectFailed'
'wallet.activity.amountSats'
'wallet.activity.status.pending'
'wallet.activity.status.succeeded'
'wallet.activity.status.failed'
'zaps.amountSats'
'chats.disabled.loginRequired'
'chats.disabled.nip44Required'
```

- [ ] **Step 2: Run typecheck for catalog parity**

Run:

```bash
pnpm typecheck:frontend
```

Expected: PASS after both locale files contain the same keys.

## Task 3: Localize `App.tsx` Toasts And Copy Actions

- [ ] **Step 1: Replace App fallback and toast literals**

Replace hardcoded copy at current `App.tsx` lines around follow failure, copy success, repost success/failure, post success/failure, and quote success/failure with `translate(uiSettings.language, key)`.

- [ ] **Step 2: Update App regression expectations**

Update existing `App.test.tsx` assertions that currently expect Spanish literals such as `Publicacion enviada`, `Cita publicada`, and `npub copiada` to use translated expectations or explicit locale setup.

- [ ] **Step 3: Run App tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx
```

Expected: PASS.

## Task 4: Localize Wallet And Zap Controller Messages

- [ ] **Step 1: Replace controller literals**

In `src/nostr-overlay/controllers/use-wallet-zap-controller.ts`, replace payment, WebLN, NWC, wallet connected, and persisted wallet activity failure strings with translated messages using the existing `language` input.

- [ ] **Step 2: Add English behavior tests**

Extend `use-wallet-zap-controller.test.tsx` to cover at least one English wallet success toast, one English WebLN unavailable toast, and one English payment failure activity reason.

- [ ] **Step 3: Run controller tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/controllers/use-wallet-zap-controller.test.tsx
```

Expected: PASS.

## Task 5: Localize Route Disabled Reasons And Zap Amount Labels

- [ ] **Step 1: Localize chat disabled reasons**

In `ChatsRouteContainer.tsx`, use `useI18n()` and keys for login-required and NIP-44-required disabled reasons.

- [ ] **Step 2: Localize zap amount labels**

Replace `${amount} sats` and `amount sats` labels in `OverlayMapInteractionLayer.tsx`, `NoteCard.tsx`, `PeopleListTab.tsx`, `SettingsZapsPage.tsx`, and `WalletPage.tsx` with `zaps.amountSats` or `wallet.activity.amountSats`.

- [ ] **Step 3: Localize wallet activity status**

In `WalletPage.tsx`, render `wallet.activity.status.pending`, `wallet.activity.status.succeeded`, and `wallet.activity.status.failed` instead of raw enum values.

- [ ] **Step 4: Run focused UI tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/routes/ChatsRouteContainer.test.tsx src/nostr-overlay/shell/OverlayMapInteractionLayer.test.tsx src/nostr-overlay/components/NoteCard.test.tsx src/nostr-overlay/components/PeopleListTab.test.tsx src/nostr-overlay/components/WalletPage.test.tsx src/nostr-overlay/components/settings-pages/SettingsZapsPage.test.tsx
```

Expected: PASS.

## Task 6: Final Guard And Quality Gates

- [ ] **Step 1: Re-run i18n source guard**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/i18n-cleanup.structure.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run frontend lint and typecheck**

Run:

```bash
pnpm lint:frontend
pnpm typecheck:frontend
```

Expected: PASS.

- [ ] **Step 3: Run affected frontend unit tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.mts --project frontend src/nostr-overlay/App.test.tsx src/nostr-overlay/controllers/use-wallet-zap-controller.test.tsx src/nostr-overlay/routes/ChatsRouteContainer.test.tsx src/nostr-overlay/shell/OverlayMapInteractionLayer.test.tsx src/nostr-overlay/components/WalletPage.test.tsx
```

Expected: PASS.

## Acceptance Criteria

- `App.tsx` has no hardcoded user-visible Spanish toast or copy-success literals.
- Wallet and zap controller toasts use locale-aware translation keys.
- Chat disabled reasons use translation keys.
- Zap amount labels use translation keys instead of inline `sats` templates.
- Wallet activity status labels are localized.
- `en.ts` and `es.ts` remain type-synchronized.
- Focused tests and frontend lint/typecheck pass.
