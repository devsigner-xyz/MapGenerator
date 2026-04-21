# Diseño: selector de layout para el feed principal de Agora

Fecha: 2026-04-21
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Permitir que el feed principal de Agora pueda verse en dos layouts seleccionables por el usuario:

- `Lista`: una nota por fila, como hoy.
- `Masonry`: tarjetas en columnas con alturas variables.

Requisitos acordados:

- El cambio afecta solo al listado principal de Agora.
- El detalle de una nota no cambia y no depende de este ajuste.
- El layout por defecto seguirá siendo `Lista`.
- El usuario podrá cambiar la vista desde la cabecera de Agora.
- La preferencia también estará disponible en `Configuración > Interfaz`.
- La preferencia se guardará entre sesiones.
- El layout `Masonry` tendrá un máximo de 2 columnas.
- En móvil, `Masonry` debe degradar a 1 columna.

## 2) Decisión principal

Se añadirá una preferencia persistida `agoraFeedLayout: 'list' | 'masonry'` dentro de `ui-settings`, reutilizando el mecanismo ya existente de `localStorage` para ajustes de interfaz.

Se descarta un estado puramente local dentro de Agora porque no cumple el requisito de tener una preferencia visible también en `Configuración > Interfaz`, y rompería la coherencia con otros ajustes visuales persistidos.

## 3) Alcance

En alcance:

- nueva preferencia persistida en `src/nostr/ui-settings.ts`
- wiring desde `App.tsx` hacia la superficie de Agora
- selector rápido en la cabecera de Agora
- control equivalente en `Configuración > Interfaz`
- layout visual del listado principal de Agora en modo `list` y `masonry`
- tests de persistencia, render y wiring del selector

Fuera de alcance:

- detalle de nota / vista de hilo
- cambios en la lógica de queries, scroll infinito o refresco del feed
- reordenación de publicaciones
- virtualización o rediseño de `NoteCard`
- más de 2 columnas en desktop

## 4) Arquitectura propuesta

### 4.1 Preferencia de UI

`ui-settings` incorporará una nueva clave `agoraFeedLayout` con este contrato:

```ts
type AgoraFeedLayout = 'list' | 'masonry';
```

Reglas:

- valor por defecto: `'list'`
- cualquier valor persistido inválido vuelve a `'list'`
- `saveUiSettings` y `loadUiSettings` normalizan este campo igual que el resto de preferencias

La clave seguirá viviendo en `src/nostr/ui-settings.ts` porque ya es la fuente de verdad para preferencias visuales persistidas del overlay.

### 4.2 Wiring en App

`App.tsx` ya mantiene `uiSettings` en estado local y persiste cambios mediante `saveUiSettings`. El nuevo ajuste seguirá ese patrón:

- `FollowingFeedSurface` recibirá el layout activo
- `FollowingFeedSurface` recibirá un callback para cambiar el layout
- el callback actualizará `uiSettings` con `saveUiSettings`

No se añadirá un controller nuevo porque el cambio no necesita una capa adicional; basta con reutilizar el wiring existente.

### 4.3 Selector rápido en Agora

La cabecera de Agora ya monta acciones como `Ver publicaciones nuevas` y `Actualizar`. El selector de layout se añadirá en ese mismo grupo de acciones, solo cuando se esté viendo el feed principal.

Control elegido:

- `ToggleGroup` de 2 opciones
- `type="single"`
- `required`
- valores: `list` y `masonry`
- etiquetas visibles: `Lista` y `Masonry`

Motivos:

- ya existe ese patrón en el proyecto para toggles visuales
- comunica mejor una elección exclusiva entre dos vistas que un `Switch`
- permite un control compacto sin añadir estilos custom complejos

## 5) Contrato de render del feed

### 5.1 Layout `list`

`list` conserva el comportamiento actual:

- contenedor scrollable del feed intacto
- el footer/estado de carga sigue fuera del stack de notas
- una nota por fila
- shell con ancho visual acotado como hoy

No debe haber cambios de comportamiento ni de spacing fuera de lo necesario para soportar el modo alternativo.

### 5.2 Layout `masonry`

`masonry` se aplicará solo al listado principal de Agora y solo cuando `activeThread` sea `null`.

Contrato visual:

- móvil: 1 columna
- desde `min-width: 900px`: 2 columnas máximo
- las tarjetas mantienen su DOM y contenido actual
- el contenedor scrollable sigue siendo el mismo
- el orden del DOM no cambia
- cada tarjeta debe evitar partirse entre columnas mediante `break-inside: avoid` o regla equivalente
- el footer/estado de carga (`ListLoadingFooter` y contenido equivalente) queda fuera del flujo masonry y mantiene ancho completo

Estados del feed principal:

- los estados `loading`, `empty` y `error` conservan el layout actual
- el modo `masonry` solo cambia la disposición de las notas renderizadas del feed principal

El layout se implementará con CSS columns en el contenedor del feed principal.

Motivos:

- es el cambio más pequeño que produce un masonry real
- no obliga a reestructurar `NoteCard`
- mantiene el scroll infinito y el render actual con mínimo acoplamiento

Trade-off explícito:

- la lectura visual baja por columnas en lugar de alinearse por filas
- el orden semántico y de accesibilidad se mantiene porque el DOM no cambia

### 5.3 Clases y alcance de estilos

`FollowingFeedContent` añadirá una clase derivada del layout activo en el contenedor del feed principal, algo equivalente a:

- `nostr-following-feed-list-layout-list`
- `nostr-following-feed-list-layout-masonry`

Además, el listado principal separará explícitamente:

- un wrapper interno para las notas del feed, que será el único nodo afectado por el layout masonry
- el footer/estado de carga, que seguirá como hermano fuera de ese wrapper

Las reglas CSS de masonry deben quedar scopeadas a esas clases del feed principal para evitar fugas hacia:

- detalle de nota
- otras listas del overlay

## 6) Configuración > Interfaz

`SettingsUiPage.tsx` añadirá un control explícito para la preferencia del layout de Agora.

Decisión:

- se mostrará como selector binario usando `ToggleGroup`, igual que el selector rápido de la cabecera de Agora
- no se introducirá una pantalla nueva ni una subsección aparte
- el ajuste vivirá junto al resto de preferencias visuales del overlay

Objetivo UX:

- acceso rápido desde Agora para cambiar sobre la marcha
- acceso estable desde configuración para dejar una preferencia persistida visible y descubrible

Aplicación con filtros:

- el layout elegido aplica igual al feed principal de Agora cuando hay filtro por hashtag activo
- el filtro no cambia el tipo de layout, solo el conjunto de publicaciones mostrado
- con filtro por hashtag activo, el selector superior de layout sigue visible porque la superficie sigue siendo el feed principal de Agora

## 7) Error handling y compatibilidad

- Si `localStorage` no está disponible, `ui-settings` seguirá devolviendo defaults y el feed se verá en `list`.
- Si hay un valor persistido desconocido, se normaliza a `list`.
- Si el selector de cabecera no puede renderizarse por alguna condición futura, el feed sigue aplicando la preferencia persistida ya resuelta en `ui-settings`; la ausencia del control no fuerza `list`.
- Si `saveUiSettings` no puede escribir en `localStorage` por quota, privacidad o una excepción del runtime, el cambio de layout puede seguir reflejándose en el estado en memoria de la sesión actual, pero no se garantiza persistencia al recargar.

Sincronización esperada:

- el selector de cabecera de Agora y el control de `Configuración > Interfaz` actualizan la misma fuente de verdad (`uiSettings` en `App.tsx`)
- al cambiar el valor en uno de los dos puntos, el otro debe reflejarlo inmediatamente dentro de la misma sesión cuando se vuelva a renderizar

Accesibilidad:

- no se definirá un patrón nuevo de accesibilidad para este cambio
- el selector debe conservar el comportamiento de teclado y ARIA que ya aporta el `ToggleGroup` existente del proyecto

Scroll al alternar layout:

- al cambiar entre `list` y `masonry` no se garantiza preservar la posición exacta de scroll
- el criterio de aceptación es que el feed siga siendo usable y estable tras el reflow, no que mantenga el mismo offset visual exacto

No se necesita migración versionada separada porque `ui-settings` ya tolera payloads parciales y claves nuevas.

## 8) Testing

Cobertura mínima esperada:

- `src/nostr/ui-settings.test.ts`
  - default de `agoraFeedLayout`
  - persistencia correcta de `list` y `masonry`
  - normalización a `list` con valor inválido
- `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
  - render del selector rápido
  - callback al cambiar de layout
  - el selector no aparece cuando hay detalle abierto
  - clase/layout correcto para `list` vs `masonry`
  - el feed sigue pudiendo disparar la paginación/scroll infinito en `masonry`
- `src/nostr-overlay/components/settings-pages/SettingsUiPage.test.tsx` o test equivalente de settings route
  - el control aparece y persiste el valor esperado
- test integrado de `App` o coverage equivalente
  - un cambio desde el selector superior y otro desde `Configuración > Interfaz` usan la misma fuente de verdad y dejan el valor sincronizado en la misma sesión

## 9) Riesgos y mitigaciones

Riesgo principal: algunas notas muy largas o con media pueden generar columnas descompensadas.

Mitigaciones:

- limitar `masonry` a 2 columnas máximo
- mantener 1 columna en móvil
- no tocar el detalle ni el markup interno de `NoteCard`

Riesgo secundario: colisiones de estilo entre el feed principal y otras vistas.

Mitigación:

- scopear todas las reglas nuevas al contenedor de Agora con clases específicas de layout

## 10) Resultado esperado

Agora seguirá abriendo por defecto en `Lista`, pero el usuario podrá alternar a `Masonry` desde la cabecera o desde `Configuración > Interfaz`, y esa preferencia se recordará en siguientes sesiones sin afectar al detalle de una nota.
