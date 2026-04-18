# Login Spacing Design

## Context

La pantalla principal de login del overlay, en `LoginGateScreen` cuando `panel === 'login'`, muestra dos problemas de ritmo vertical:

- Los botones `Acceder` y `Crear cuenta` quedan demasiado separados entre si.
- El grupo de acciones queda demasiado pegado al selector/input del formulario.

El ajuste pedido es puramente visual. No cambia flujos, labels ni comportamiento de autenticacion. Quedan fuera de alcance las vistas de desbloqueo de cuenta local, selector de creacion de cuenta y flujo de creacion de cuenta.

Los estados afectados dentro de ese login principal son unicamente las tres variantes de `LoginMethodSelector`: `npub`, `nip07` y `nip46`.

## Goals

- Acercar visualmente los botones `Acceder` y `Crear cuenta` para que se lean como un mismo bloque de acciones.
- Separar ese bloque de acciones del bloque de campos (`Select` e `Input`) para mejorar jerarquia.
- Mantener el cambio pequeno, localizado y consistente con el estilo actual del overlay.

## Non-Goals

- No reordenar el formulario.
- No mover la logica de autenticacion entre componentes.
- No redisenar el card completo ni tocar espaciados no relacionados.

## Options Considered

1. Ajustar solo el `gap` global de `CardContent`.
2. Agrupar las acciones del login y darles un espaciado propio.
3. Mover `Crear cuenta` dentro de `LoginMethodSelector`.

## Decision

Se adopta la opcion 2.

Razon:

- Permite controlar por separado la distancia entre campos y acciones.
- Permite reducir la distancia entre botones sin afectar el resto del card.
- Evita mezclar responsabilidades entre `LoginGateScreen` y `LoginMethodSelector` mas de lo necesario.

## Technical Direction

El overlay ya usa clases propias en `src/nostr-overlay/styles.css`, por lo que el ajuste debe seguir ese patron en lugar de introducir utilidades Tailwind nuevas para un caso aislado.

- En `LoginGateScreen.tsx`, agrupar `LoginMethodSelector` y el boton `Crear cuenta` en un contenedor dedicado que solo exista en la vista principal de login.
- El cambio de CSS debe agregarse con clases nuevas y acotadas al login; no se deben editar selectores compartidos como `.nostr-form` o `.nostr-login-selector` de forma global.
- En `LoginMethodSelector.tsx`, agregar una clase especifica al boton de accion principal (`Acceder` en `npub`, `Continuar con extension` en `nip07`, `Conectar bunker` en `nip46`).
- `LoginMethodSelector` solo se consume desde `LoginGateScreen`, asi que ese ajuste queda acotado al login principal actual y no requiere nuevos props.
- La fuente de verdad es el espaciado renderizado final: la distancia entre el ultimo campo o texto descriptivo y la accion principal debe quedar en `1rem` exacto en estado normal. Usar `margin-top: 0.5rem` es una implementacion esperable con la estructura actual, pero no un requisito contractual.
- Invariante requerida: en las variantes normales cubiertas por esta spec (`npub`, `nip07`, `nip46`, sin errores inline nuevos), no debe renderizarse ningun elemento nuevo por debajo de la accion principal dentro de `LoginMethodSelector`.
- Con esa invariante, el espacio entre la accion principal y `Crear cuenta` debe ser propiedad del contenedor del login principal en `LoginGateScreen` y quedar fijado en `0.75rem` exactos.

## Validation Criteria

- En la vista principal de login, la distancia vertical entre la accion principal y `Crear cuenta` baja a `0.75rem`.
- En `npub` y `nip46`, la distancia entre el ultimo `Input` y la accion principal queda en `1rem` exacto.
- En `nip07`, la distancia entre el texto descriptivo y la accion principal tambien queda en `1rem` exacto.
- Estados fuera de alcance de ajuste fino:
  - errores inline nuevos
  - ayudas contextuales nuevas
  - estados de carga con contenido adicional debajo de la accion principal
- Verificaciones minimas por variante:
  - `npub`: abrir el login por defecto y confirmar selector, input, `Acceder` y `Crear cuenta` en el orden esperado.
  - `nip07`: cambiar el selector a `Extension (NIP-07)` y confirmar texto explicativo, `Continuar con extension` y `Crear cuenta`.
  - `nip46`: cambiar el selector a `Bunker (NIP-46)` y confirmar selector, input URI, `Conectar bunker` y `Crear cuenta`.
- Smoke check fuera de alcance:
  - la vista de desbloqueo de cuenta local sigue renderizando igual
  - el selector de creacion de cuenta sigue renderizando igual
  - el flujo de creacion de cuenta no recibe cambios visuales intencionales
- Revisión visual en dos viewports representativos:
  - mobile: `390x844`
  - desktop: `1280x800`
- Verificacion de medidas:
  - confirmar en DevTools la separacion renderizada entre el ultimo campo o texto descriptivo y la accion principal: `1rem`
  - confirmar en DevTools la separacion renderizada entre accion principal y `Crear cuenta`: `0.75rem`
