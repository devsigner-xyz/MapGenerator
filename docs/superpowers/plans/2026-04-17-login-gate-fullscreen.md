# Plan: Gate de Login Full Screen (Formulario Centrado)

## Resumen
Implementar un gate de login dedicado en `/login` que ocupe toda la pantalla (`full screen`) y centre el formulario vertical y horizontalmente.
Hasta completar login + carga inicial, no se mostrará la UI de mapa/sidebar.
Flujo: landing (`/app/`) -> si no hay sesión, `/login`; si ya hay sesión válida, entrar directo a la app (`/`).

## Cambios de implementación
- En `src/nostr-overlay/App.tsx`:
  - Añadir guard de rutas con `HashRouter`:
    - sin sesión/autorización lista -> redirección a `/login`.
    - con sesión cargada -> acceso a rutas de app.
  - Crear ruta `/login` con layout exclusivo full screen.
  - Durante `mapLoaderStage`, mostrar spinner + texto de etapa en esa pantalla de login (no como overlay sobre mapa).
  - Tras éxito de login+carga, redirigir a `/`.
- En `src/nostr-overlay/components/SocialSidebar.tsx`:
  - Eliminar render del `LoginMethodSelector`; sidebar solo para estado autenticado.
- Nuevo componente/pantalla de login (por ejemplo en `src/nostr-overlay/components/`) reutilizando `LoginMethodSelector` con layout:
  - contenedor `fixed inset-0` / `min-h-screen w-screen`.
  - `flex items-center justify-center`.
  - tarjeta/formulario centrado con componentes shadcn por defecto.
- En `src/nostr-overlay/styles.css`:
  - Añadir clases mínimas para la pantalla full screen de login (sin personalización visual extra innecesaria).

## Interfaces/tipos
- En `src/nostr-overlay/hooks/useNostrOverlay.ts`, exponer bandera explícita de “restauración de sesión resuelta” para que el guard no parpadee entre login/app en el arranque.
- Sin cambios de API backend.

## Pruebas
- Actualizar `src/nostr-overlay/App.test.tsx`:
  - sin sesión: aparece `/login` full screen y formulario centrado.
  - con sesión restaurada: no se queda en login, entra a `/`.
  - durante login: spinner + etapas visibles en login.
  - acceso directo a rutas internas sin sesión: redirige a `/login`.
- Actualizar `tests/smoke/map-load.spec.ts`:
  - esperar pantalla login full screen inicial en `/app/`.

## Supuestos cerrados
- Pantalla de login obligatoria full screen.
- Formulario centrado vertical y horizontalmente.
- Destino tras login exitoso: Mapa (`/`).
