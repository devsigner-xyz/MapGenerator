# Login Loading And Restoration Design

## Context

El login del overlay muestra dos indicadores de carga simultaneos durante el acceso manual:

- un spinner superior dentro de `LoginGateScreen` con textos como `Conectando a relay...` y `Construyendo mapa...`
- un boton del selector con el texto generico `Cargando...`

Ademas, durante la restauracion de sesion hay un parpadeo en el que aparece el formulario de login antes de que termine de cargarse la sesion restaurada. En ese mismo gate tambien se expone un boton `Cerrar sesion` que no aporta valor en esa pantalla.

## Scope

Dentro de alcance:

- `App.tsx`
- `LoginGateScreen.tsx`
- `LoginMethodSelector.tsx`
- tests de `App`, `LoginGateScreen` y `LoginMethodSelector`

Fuera de alcance:

- sidebar habitual de la app autenticada
- cambios de copy fuera del flujo de auth
- cambios de logica de autenticacion o de payloads

## Goals

- Eliminar el spinner superior del gate de login.
- Mostrar el texto de progreso real dentro del boton principal del login manual en vez de `Cargando...`.
- No mostrar `Cerrar sesion` dentro de `LoginGateScreen`.
- Evitar que el formulario de login aparezca mientras se restaura una sesion persistida.

## Non-Goals

- No redisenar la card principal del login.
- No cambiar el lugar habitual donde se cierra sesion una vez cargada la UI.
- No alterar el loader global del mapa cuando la app ya esta autenticada y fuera del gate.

## Decision

Se separan claramente dos estados visuales:

- `restoringSession`: estado bloqueante exclusivo de restauracion, sin formulario de login visible
- `manual login loading`: progreso del acceso manual mostrado en el boton primario del selector

`LoginGateScreen` deja de renderizar el loader superior de `mapLoaderText` y deja de ofrecer logout. El formulario de login solo se muestra cuando la restauracion ya termino y no hay una sesion restaurada pendiente de completar.

## State Contract

- La restauracion inicial permanece activa desde que arranca el `useEffect` de restauracion en `useNostrOverlay` hasta que termina una de estas rutas:
  - no hay `mapBridge`
  - no existe sesion persistida valida
  - `loadOwnerGraph()` de la sesion restaurada termina en `success`
  - `loadOwnerGraph()` de la sesion restaurada termina en `error`
- En implementacion minima, esto implica que `sessionRestorationResolved` no debe pasar a `true` antes de que termine `loadOwnerGraph()` cuando `restoreSession()` devuelve una sesion valida.
- Si `restoreSession()` no devuelve sesion, el gate deja de estar en modo restauracion y vuelve a mostrar el formulario de login.
- Si la restauracion falla durante `loadOwnerGraph()`, el gate deja de estar en modo restauracion y puede mostrar el formulario de login con el estado de error existente.
- El progreso del login manual solo se refleja en el metodo visible y activo del selector. No debe afectar a estados de restauracion automatica.

## Technical Direction

- `App.tsx`
  - Mantener `LoginGateScreen` visible durante la restauracion completa de una sesion persistida.
  - No considerar resuelta la restauracion hasta que termine `loadOwnerGraph()` de la sesion restaurada.
  - Dejar de pasar `showLogout` al gate.
- `LoginGateScreen.tsx`
  - Eliminar el bloque visual superior que hoy usa `mapLoaderText`.
  - Cuando `restoringSession === true`, renderizar solo el estado `Restaurando sesion...` dentro del card y ocultar el formulario de login.
  - Eliminar el boton `Cerrar sesion` del gate.
  - Pasar `mapLoaderText` a `LoginMethodSelector` para que el selector pueda mostrar copy especifico de progreso.
- `LoginMethodSelector.tsx`
  - Aceptar un texto opcional de progreso.
  - En el boton primario del metodo visible (`npub` o `nip07`), sustituir `Cargando...` por ese texto cuando exista.
  - Mantener `Cargando...` solo como fallback si hay estado ocupado sin texto especifico.
  - Mantener el spinner inline actual junto al texto de progreso.

## Validation Criteria

- Durante login manual ya no se ve un spinner superior con `Conectando a relay...`, `Obteniendo datos...` o `Construyendo mapa...`.
- Durante login manual el boton primario muestra el texto de progreso actual del loader.
- `LoginGateScreen` no muestra `Cerrar sesion`.
- Durante restauracion de sesion se ve `Restaurando sesion...` y no aparece el formulario de login aunque la carga tarde un instante adicional.
- Una vez completada la restauracion, la UI autenticada reemplaza directamente al gate.
