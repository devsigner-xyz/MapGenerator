# Public Security Hardening For Single-Instance Deployments Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer la aplicacion para un despliegue publico pequeno con una sola instancia del backend, eliminando persistencia innecesaria de secretos en navegador, bloqueando URLs inseguras, endureciendo la salida HTTP del backend y documentando claramente las limitaciones aceptadas sin Redis.

**Architecture:** Esta iteracion asume un unico proceso Fastify y deja `rate limiting` y anti-replay como estado local del proceso por decision explicita de producto. El hardening se centra en reducir superficie de exposicion real: no persistir material secreto en almacenamiento web, sanitizar URLs no fiables antes de renderizarlas o usarlas, y restringir las peticiones salientes del backend a destinos NIP-05 seguros. La parte operativa se completa con cabeceras y documentacion de despliegue para que el comportamiento seguro no dependa de suposiciones tacitas.

**Tech Stack:** Fastify 5, React 19, TypeScript, Vite, Vitest, Web Crypto API, Nostr/NIP-05.

---

## Chunk 1: Scope And File Map

**Alcance confirmado**
- Despliegue publico pequeno con una sola instancia del backend.
- Sin Redis en esta fase.
- Mantener `rate limiting` y anti-replay en memoria como limitacion aceptada y documentada.
- Priorizar riesgos reales antes del lanzamiento: secretos persistidos en navegador, URLs inseguras, SSRF en NIP-05 y configuracion de despliegue.

**Fuera de alcance**
- Escalado multi-instancia o estado distribuido.
- Proxy de media externo o red de thumbnails propia.
- Reescritura completa de auth o sustitucion del modelo Nostr actual.
- Nuevas features de producto no relacionadas con seguridad o privacidad.

**Mapa de archivos**
- Create: `docs/security-public-deploy.md`
- Create: `src/nostr/safe-external-url.ts`
- Create: `src/nostr/safe-external-url.test.ts`
- Create: `src/nostr-overlay/components/RichNostrContent.test.tsx`
- Create: `server/src/security/safe-outbound.ts`
- Modify: `src/nostr/auth/auth-service.ts`
- Modify: `src/nostr/auth/local-key-storage.ts`
- Modify: `src/nostr/auth/secure-storage.ts`
- Modify: `src/nostr/wallet-settings.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr/profiles.ts`
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
- Modify: `src/nostr-overlay/components/RichNostrContent.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/nostr/auth/auth-service.test.ts`
- Modify: `src/nostr/auth/local-key-storage.test.ts`
- Modify: `src/nostr/auth/secure-storage.test.ts`
- Modify: `src/nostr/wallet-settings.test.ts`
- Modify: `src/nostr/profiles.test.ts`
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
- Modify: `server/src/modules/identity/identity.service.ts`
- Modify: `server/src/modules/identity/identity.service.test.ts`
- Modify: `server/src/modules/identity/identity.routes.test.ts`
- Modify: `server/src/plugins/security-headers.ts`
- Modify: `server/src/plugins/request-context.test.ts`
- Modify: `server/src/app.test.ts`
- Modify: `index.html`
- Modify: `app/index.html`
- Modify: `README.md`

## Chunk 2: Implementation Tasks

### Task 1: Eliminar persistencia de secretos en navegador para auth local y NWC

**Files:**
- Modify: `src/nostr/auth/auth-service.ts`
- Modify: `src/nostr/auth/local-key-storage.ts`
- Modify: `src/nostr/auth/secure-storage.ts`
- Modify: `src/nostr/wallet-settings.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Test: `src/nostr/auth/auth-service.test.ts`
- Test: `src/nostr/auth/local-key-storage.test.ts`
- Test: `src/nostr/auth/secure-storage.test.ts`
- Test: `src/nostr/wallet-settings.test.ts`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] Anadir tests que fallen demostrando que una sesion `local` ya no persiste clave cifrada, `last-pubkey` ni sesion restaurable tras recargar.
- [ ] Anadir tests que fallen demostrando que `wallet-settings` no vuelve a escribir `uri` ni `secret` de NWC en `sessionStorage`.
- [ ] Cambiar `auth-service` para que las sesiones `local` sean solo en memoria y no llamen a `localKeyStorage.save()` ni persistan `StoredAuthSession` con metodo `local`.
- [ ] Limpiar migracion/compatibilidad minima para borrar restos antiguos de `local` si se detectan en `localStorage`.
- [ ] Simplificar `local-key-storage` para que deje de anunciar cuentas guardadas reutilizables en este modo publico.
- [ ] Ajustar `useNostrOverlay` y sus tests para que la UI no siga insinuando una cuenta local recuperable cuando el servicio ya no la expone.
- [ ] Cambiar `wallet-settings` para persistir solo metadatos no sensibles de la wallet y dejar cualquier reconexion NWC en estado `reconnect-required`.
- [ ] Confirmar que `nip07`, `nip46`, `npub` y el flujo actual de wallet siguen funcionando sin secretos persistidos.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project frontend src/nostr/auth/auth-service.test.ts src/nostr/auth/local-key-storage.test.ts src/nostr/auth/secure-storage.test.ts src/nostr/wallet-settings.test.ts src/nostr-overlay/App.test.tsx`

**Resultado esperado**
- No quedan secretos de login local ni secretos NWC guardados en `localStorage` o `sessionStorage`.
- Recargar la pagina ya no restaura material sensible sin intervencion explicita del usuario.

### Task 2: Sanitizar URLs externas antes de renderizar o consumir contenido remoto

**Files:**
- Create: `src/nostr/safe-external-url.ts`
- Create: `src/nostr/safe-external-url.test.ts`
- Modify: `src/nostr/profiles.ts`
- Modify: `src/nostr-overlay/components/OccupantProfileDialog.tsx`
- Modify: `src/nostr-overlay/components/RichNostrContent.tsx`
- Test: `src/nostr/profiles.test.ts`
- Test: `src/nostr-overlay/components/OccupantProfileDialog.test.tsx`
- Test: `src/nostr-overlay/components/RichNostrContent.test.tsx`

- [ ] Crear tests unitarios para una utilidad comun que acepte solo `https:` y, si hace falta para desarrollo, `http://127.0.0.1` o `http://localhost` de forma explicita.
- [ ] Anadir casos que fallen para `javascript:`, `data:`, `file:`, URLs vacias y valores con espacios o parseo invalido.
- [ ] Aplicar la utilidad al parseo de `website`, `picture` y `banner` en `profiles.ts` para que el modelo compartido nunca exponga URLs inseguras.
- [ ] Ajustar `OccupantProfileDialog` para renderizar enlaces solo cuando la URL haya pasado la sanitizacion central.
- [ ] Ajustar `RichNostrContent` para descartar attachments con protocolos no permitidos antes de llegar a `<img>` o `<video>`.
- [ ] Reescribir o ampliar tests de modal de perfil y rich content para verificar que lo inseguro no se renderiza y que lo valido sigue visible.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project frontend src/nostr/safe-external-url.test.ts src/nostr/profiles.test.ts src/nostr-overlay/components/OccupantProfileDialog.test.tsx src/nostr-overlay/components/RichNostrContent.test.tsx`

**Resultado esperado**
- La UI deja de enlazar o cargar contenido con esquemas inseguros.
- Los datos Nostr no fiables se degradan a ausencia de URL valida en lugar de llegar al DOM como `src` o `href` peligrosos.

### Task 3: Endurecer la resolucion NIP-05 contra SSRF sin introducir Redis ni infraestructura extra

**Files:**
- Create: `server/src/security/safe-outbound.ts`
- Modify: `server/src/modules/identity/identity.service.ts`
- Test: `server/src/modules/identity/identity.service.test.ts`
- Test: `server/src/modules/identity/identity.routes.test.ts`

- [ ] Anadir tests backend que fallen para dominios que resuelven a `127.0.0.1`, `::1`, RFC1918, link-local, `0.0.0.0`, multicast o redes reservadas.
- [ ] Anadir tests que fallen para redirects a destinos no permitidos o cambios de `https` a `http`.
- [ ] Anadir un test de integracion de ruta para `/v1/identity/nip05/verify-batch` que ejercite el servicio real con redirect bloqueado y confirme la respuesta esperada sin salir del proceso.
- [ ] Crear una utilidad pequena para validar hostnames de salida y resolver DNS antes del `fetch` de NIP-05.
- [ ] Integrar esa utilidad en `identity.service.ts` para bloquear destinos privados antes de solicitar `/.well-known/nostr.json`.
- [ ] Cambiar el `fetch` NIP-05 a manejo manual de redirects y validar cada salto de `Location` antes de seguirlo.
- [ ] Rechazar redirects que cambien a `http`, apunten a IPs privadas o excedan un numero pequeno de saltos.
- [ ] Mantener timeouts cortos y comportamiento de cache actual, pero devolver error controlado cuando la politica de egress rechace el destino.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project backend server/src/modules/identity/identity.service.test.ts server/src/modules/identity/identity.routes.test.ts`

**Resultado esperado**
- El endpoint de verificacion NIP-05 deja de ser un `fetch` abierto hacia red privada o destinos redirigidos de forma peligrosa.
- El cambio no rompe verificaciones NIP-05 normales hacia dominios publicos validos.

### Task 4: Endurecer cabeceras y fijar una politica de despliegue publico para una sola instancia

**Files:**
- Create: `docs/security-public-deploy.md`
- Modify: `server/src/plugins/security-headers.ts`
- Modify: `server/src/plugins/request-context.test.ts`
- Modify: `server/src/app.test.ts`
- Modify: `index.html`
- Modify: `app/index.html`
- Modify: `README.md`

- [ ] Anadir tests que fallen para cabeceras nuevas o ajustadas en respuestas Fastify.
- [ ] Anadir un test en `app.test.ts` o equivalente que compruebe `Strict-Transport-Security` bajo `https` o `x-forwarded-proto: https` y su ausencia en contexto no seguro.
- [ ] Extender `security-headers.ts` con `Strict-Transport-Security` condicionado a contexto HTTPS y, si encaja con la app actual, `Cross-Origin-Resource-Policy: same-origin`.
- [ ] Eliminar o mover a CSS cualquier inline style que bloquee una CSP razonable, empezando por `app/index.html`.
- [ ] Anadir una CSP por meta tag en `index.html` y `app/index.html` compatible con el bundle actual, Google Fonts y conexiones `https:`/`wss:` del overlay, sin recurrir a `unsafe-eval`.
- [ ] Documentar en `docs/security-public-deploy.md` el modelo operativo elegido: una sola instancia, sin Redis, replay/rate-limit por proceso, HTTPS obligatorio, `FASTIFY_TRUST_PROXY` correcto, `BFF_CORS_ORIGINS` explicito y nada de Redis abierto a futuro sin necesidad real.
- [ ] Actualizar `README.md` para enlazar esa guia y dejar visible que la politica segura actual no persiste secretos sensibles del usuario en navegador ni backend.
- [ ] Ejecutar:
`pnpm vitest run --config vitest.config.mts --project backend server/src/plugins/request-context.test.ts server/src/app.test.ts`
- [ ] Ejecutar:
`pnpm build`

**Resultado esperado**
- El backend y los entrypoints estaticos reflejan una postura de seguridad explicita para produccion.
- El despliegue personal queda documentado sin ambiguedades sobre lo que esta soportado y lo que no.

### Task 5: Verificacion final y cierre de alcance

**Files:**
- Modify: cualquiera de los anteriores si aparecen regresiones

- [ ] Ejecutar:
`pnpm test:unit`
- [ ] Ejecutar:
`pnpm typecheck:all`
- [ ] Ejecutar:
`pnpm lint:full`
- [ ] Arrancar una preview local del build y verificar manualmente que landing y `/app/` cargan sin errores de CSP ni roturas visibles tras los cambios de URLs externas.
- [ ] Buscar referencias residuales a persistencia sensible con:
`grep` para `nostr.overlay.auth.local-key`, `wallet.session.v1`, `secret`, `last-pubkey`, `javascript:`
- [ ] Revisar manualmente que el plan sigue alineado con el contexto acordado: despliegue pequeno, una sola instancia, sin Redis.

**Resultado esperado**
- El hardening implementado cubre los riesgos prioritarios del lanzamiento publico sin introducir complejidad operativa desproporcionada.
- La decision de no usar Redis queda reflejada como restriccion consciente, no como omision accidental.

**Recomendacion**
No tocaria `owner-auth.ts`, `publish.routes.ts` ni `rate-limit.ts` para redistribuir estado en esta fase. Para una sola instancia, el valor inmediato esta en no persistir secretos, filtrar URLs y cerrar SSRF antes que en anadir infraestructura.

**Interpretacion de producto cerrada**
- `sin redis` significa: no anadir servicio nuevo, no redisenar limites distribuidos y no asumir escalado horizontal.
- `proyecto publico personal` significa: aceptar una sola instancia, pero no aceptar secretos persistidos innecesariamente ni salidas HTTP sin control.
