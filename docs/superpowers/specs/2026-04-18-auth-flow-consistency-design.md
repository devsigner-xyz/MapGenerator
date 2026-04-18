# Auth Flow Consistency Design

## Context

El flujo de autenticacion del overlay mezcla varios patrones visuales dentro del mismo card principal:

- wrappers con borde alrededor de acciones o bloques de contenido
- acciones de vuelta dentro del contenido en unas vistas y en footer en otras
- copy poco claro en la seleccion de metodo de creacion de cuenta
- labels del formulario con tono azulado/verdoso por el uso de `.nostr-label`

El objetivo de esta iteracion es refinar unicamente el flujo de auth, sin extender el cambio a settings u otras pantallas del overlay.

## Scope

Dentro de alcance:

- `LoginGateScreen.tsx` en los estados:
  - `panel === 'login'`
  - `panel === 'create-account-selector'`
  - `panel === 'create-account-flow'`
- `CreateAccountMethodSelector.tsx`
- `CreateAccountDialog.tsx`
- `LoginMethodSelector.tsx`
- labels negros dentro de esos componentes del auth flow

Fuera de alcance:

- settings y resto del overlay
- guia global de diseno
- limpieza completa de estilos legacy fuera de auth

## Goals

- Convertir la seleccion de metodo de creacion de cuenta en una lista de `Item` de shadcn con titulo y subtitulo claros.
- Eliminar wrappers con borde alrededor de acciones dentro del auth flow cuando solo aportan decoracion redundante.
- Unificar la navegacion secundaria del auth flow en footer: izquierda `Volver`, derecha accion principal.
- Alinear el copy del flujo para que sea corto y facil de entender.
- Hacer que los labels de formulario del auth flow se rendericen en negro usando estilos mas cercanos al sistema de diseno actual.

## Non-Goals

- No redisenar la card principal del login.
- No cambiar logica de autenticacion ni payloads.
- No rehacer el sistema global de estilos del overlay en esta iteracion.

## Decision

Se mantiene el card principal de `LoginGateScreen` como shell del flujo y se eliminan los wrappers internos innecesarios.

- Las elecciones de metodo se muestran como `ItemGroup` + `Item variant="outline"`.
- Los footers del auth flow gobiernan la navegacion secundaria.
- El contenido de cada paso se limita a explicacion, campos y acciones primarias propias del paso.

## State Mapping

- `LoginGateScreen` + `panel === 'login'`
  - renderiza `LoginMethodSelector`
  - no tiene accion de vuelta en footer
- `LoginGateScreen` + `panel === 'create-account-selector'`
  - renderiza `CreateAccountMethodSelector`
  - footer con `Volver al login` a la izquierda y sin accion derecha adicional
- `LoginGateScreen` + `panel === 'create-account-flow'` + `initialMethod === 'external'`
  - renderiza `CreateAccountDialog` en modo `external`
  - footer con `Volver` a la izquierda y sin boton primario adicional del shell
- `LoginGateScreen` + `panel === 'create-account-flow'` + `initialMethod === 'local'`
  - renderiza `CreateAccountDialog` en modo `local`
  - footer con `Volver` a la izquierda y accion primaria del paso a la derecha

## Copy

Selector de creacion de cuenta:

- `Usar app o extension`
- `Conecta una extension o un signer externo.`
- `Crear cuenta local`
- `Crea una cuenta nueva en este dispositivo.`

Flujo external:

- titulo: `Usar app o extension`
- subtitulo: `Elige como conectar una cuenta que ya controlas.`

Flujo local:

- titulo: `Crear cuenta local`
- subtitulo: `Genera una cuenta nueva y guarda tu clave antes de continuar.`

## Technical Direction

- `CreateAccountMethodSelector.tsx`
  - Reemplazar `Card` interno por `ItemGroup` con dos `Item` clicables.
  - Cada `Item` expone titulo, descripcion y una accion visual a la derecha.
  - Cada item debe seguir siendo claramente accionable con teclado y foco visible, equivalente a la accion actual con botones.
- `LoginGateScreen.tsx`
  - Mover `Volver al login` al footer del panel `create-account-selector`.
  - Mantener el login principal como shell y no duplicar wrappers decorativos.
- `CreateAccountDialog.tsx`
  - Mantener `CardHeader`, `CardContent` y `CardFooter` como estructura principal.
  - Eliminar wrappers con borde redundantes dentro de `external` y `local`, en particular:
    - el `Card` interno de `CreateAccountMethodSelector`
    - cualquier wrapper interno cuyo unico proposito sea agrupar acciones con borde
  - Garantizar footer consistente:
    - `create-account-selector`: izquierda `Volver al login`, sin accion derecha adicional
    - `external`: izquierda `Volver`, sin accion derecha adicional del shell
    - `local`: izquierda `Volver`, derecha accion primaria del paso
- `LoginMethodSelector.tsx`
  - Dejar labels negros dentro del auth flow.
  - Preferir utilidades Tailwind y composicion de shadcn antes que CSS custom nuevo.
  - El objetivo visual para labels es `text-foreground` o equivalente renderizado negro en el tema actual.
  - Esto aplica solo a labels renderizados dentro de:
    - `LoginMethodSelector.tsx`
    - `CreateAccountDialog.tsx`
  - Queda explicitamente fuera de alcance cualquier otro uso de `.nostr-label` fuera de auth.

## Validation Criteria

- La seleccion de metodo de creacion de cuenta se ve como dos `Item` y ya no como un `Card` con dos botones anchos.
- No hay wrappers con borde alrededor de bloques de acciones en `create-account-selector`, `external` ni `local`.
- `Volver al login` aparece en footer del panel `create-account-selector`.
- `Volver` aparece en footer del flujo `external`.
- `Volver` aparece en footer del flujo `local`.
- El login principal queda exento de accion de vuelta en footer.
- Los copies nuevos son visibles y sustituyen los textos ambiguos previos.
- Los labels del auth flow se ven negros en lugar de azul/verde.
- Los dos `Item` del selector son navegables por teclado, muestran foco visible y responden a `Enter` o `Space`.
- Navegacion requerida:
  - login abre selector de creacion de cuenta
  - selector vuelve al login desde footer
  - external vuelve al selector desde footer
  - local vuelve al selector o al paso previo segun corresponda
- No cambian payloads ni logica de auth.
