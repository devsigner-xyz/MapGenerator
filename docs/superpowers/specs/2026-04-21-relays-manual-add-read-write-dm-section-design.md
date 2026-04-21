# Diseño: alta simple de relays + toggles read/write + sección separada de DMs

Fecha: 2026-04-21
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Simplificar la UX de alta manual de relays y separar mejor las responsabilidades de cada lista Nostr dentro de `/relays`.

Requisitos acordados:

- El formulario `Añadir relay` general deja de pedir al usuario una categoría técnica.
- Al añadir manualmente un relay general, se guardará por defecto como `nip65Both`.
- La tabla principal de relays configurados deja de mostrar una sola columna `Tipo` y pasa a permitir edición explícita con dos toggles: `Read` y `Write`.
- La configuración `dmInbox` deja de mezclarse visualmente con la tabla principal y pasa a una sección separada de `Relays de mensajes`.
- La nueva sección de `Relays de mensajes` debe aparecer ya prellenada con defaults recomendados.
- Los `Relays de búsqueda` siguen siendo una sección separada y no cambian de semántica.

## 2) Decisión principal

La pantalla `/relays` pasará a reflejar tres grupos operativos distintos, con UX específica para cada uno:

1. relays generales NIP-65
2. relays de mensajes NIP-17 (`kind:10050`)
3. relays de búsqueda NIP-50

Para el flujo manual de alta general se adopta una política deliberadamente simple:

- añadir URL
- guardar como `nip65Both`
- editar después con toggles `Read` / `Write`

Se descarta mantener el selector de categoría en el alta porque obliga al usuario a entender una semántica protocolar que no necesita conocer para completar la acción más común. También se descarta intentar inferir automáticamente `read`, `write` o `dmInbox` desde la metadata del relay, porque NIP-11 informa capacidades y restricciones, pero no la intención de uso del usuario.

## 3) Alcance

En alcance:

- quitar el selector de categoría del alta general
- defaultar el alta manual general a `nip65Both`
- separar visualmente `dmInbox` de la tabla principal de relays generales
- añadir toggles `Read` y `Write` en la tabla principal de relays configurados
- crear una sección independiente de `Relays de mensajes`
- mantener esa sección prellenada con defaults recomendados
- ajustar detalle de relay para no depender de una única categoría representativa cuando el relay tenga varios usos activos
- actualizar tests de modelo y de render de la página

Fuera de alcance en esta fase:

- inferencia automática del mejor `dmInbox` a partir de NIP-11
- descubrimiento automático persistente de relays de DM
- sincronización bidireccional automática entre estado local y el `kind:10050` remoto
- un tercer toggle `DM` dentro de la tabla principal
- cambios en la semántica de `search`
- refactor grande de rutas o de estilos fuera de la pantalla de relays

## 4) Contexto protocolar y de producto

### 4.1 Relays generales

Los relays generales existentes se publican como `kind:10002` usando la semántica NIP-65:

- tag `r` sin marcador => lectura + escritura
- tag `r` con `read` => lectura
- tag `r` con `write` => escritura

Esto ya existe hoy en `src/nostr/auth/bootstrap-profile.ts`.

### 4.2 Relays de mensajes

`dmInbox` representa la lista de relays donde el usuario desea recibir mensajes privados, publicada como `kind:10050` con tags `relay`.

Punto clave de producto:

- `dmInbox` no es una capacidad objetiva del relay
- `dmInbox` es una preferencia del usuario

La metadata NIP-11 puede ayudar a evaluar si un relay parece usable para mensajería, pero no permite decidir de forma fiable si debe entrar en la lista `kind:10050` del usuario.

### 4.3 Defaults de mensajes

Los defaults locales recomendados de `dmInbox` ya existen en `src/nostr/relay-settings.ts`:

- `wss://relay.snort.social`
- `wss://temp.iris.to`
- `wss://vault.iris.to`

La nueva sección de `Relays de mensajes` debe apoyarse en esa misma fuente de verdad y mostrarse prellenada desde el primer render, no como una lista vacía.

Regla explícita de persistencia:

- si no existe payload local de relay settings para el scope actual, la sección DM arranca con los defaults recomendados de `getDefaultRelaySettings()`
- si el usuario ya guardó settings locales, se respeta exactamente `byType.dmInbox`, incluso si quedó vacío por decisión explícita del usuario
- `Restablecer recomendados` repone los defaults de DM en cualquier momento, pero la UI no los reinyecta automáticamente sobre un estado persistido vacío
- los defaults visibles en ese primer render sin payload no requieren una escritura inmediata a storage; son el resultado natural de `loadRelaySettings()` devolviendo el estado por defecto

## 5) Arquitectura propuesta

### 5.1 Modelo de settings

No se introduce una nueva categoría persistente; se reaprovecha el modelo existente:

```ts
type RelayType = 'nip65Both' | 'nip65Read' | 'nip65Write' | 'dmInbox' | 'search';

interface RelaySettingsByType {
  nip65Both: string[];
  nip65Read: string[];
  nip65Write: string[];
  dmInbox: string[];
  search: string[];
}
```

El cambio está en cómo la UI y el controller interpretan esas listas.

### 5.2 Separación visual por grupos

La página `/relays` debe quedar organizada conceptualmente así:

1. `Relays configurados`
2. `Añadir relay`
3. `Relays sugeridos`
4. `Relays de mensajes`
5. `Relays de búsqueda`

Regla explícita de producto:

- `Relays configurados` representa solo el uso general NIP-65
- `Relays de mensajes` representa solo `dmInbox`
- `Relays de búsqueda` representa solo `search`

Esto implica que `dmInbox` deja de formar parte del bloque `configuredRows` que hoy mezcla NIP-65 y mensajes en una sola tabla.

### 5.3 Filas derivadas por sección

El controller deberá derivar por separado:

- `configuredRows`: solo `nip65Both`, `nip65Read`, `nip65Write`
- `suggestedRows`: solo sugerencias NIP-65 aún no configuradas
- `dmConfiguredRows`: solo `dmInbox`
- `dmSuggestedRows`: solo sugerencias `dmInbox` aún no configuradas
- `searchConfiguredRows`: solo `search`
- `searchSuggestedRows`: solo sugerencias `search`

Esto evita que un relay aparezca en la tabla general por pertenecer únicamente a `dmInbox`.

Regla explícita para contadores del bloque principal:

- `Relays configurados`, `Conectados` y `Sin conexión` siguen midiendo solo la sección general NIP-65
- la sección `Relays de mensajes` no se incorpora a esos badges de resumen

### 5.4 Alta manual general

El formulario `Añadir relay` general quedará reducido a:

- input de URL
- botón `Añadir`

Contrato funcional:

- cada URL válida añadida manualmente entra como `nip65Both`
- el selector `newRelayType` desaparece del estado y de las props

### 5.5 Toggles `Read` / `Write`

La tabla principal sustituye la columna `Tipo` por dos columnas interactivas.

Regla de mapeo:

- `Read=on`, `Write=on` => el relay debe existir en `nip65Both`
- `Read=on`, `Write=off` => el relay debe existir en `nip65Read`
- `Read=off`, `Write=on` => el relay debe existir en `nip65Write`
- `Read=off`, `Write=off` => el relay sale del uso NIP-65

Importante:

- los toggles modifican solo el uso NIP-65
- no deben tocar `dmInbox`
- no deben tocar `search`

### 5.6 Helper de transición NIP-65

El modelo actual tiene `addRelay` y `removeRelay`, pero no un helper que reescriba el estado efectivo de un relay al cambiar entre `both`, `read`, `write` y `off`.

Se añadirá un helper mínimo en `relay-settings.ts` con esta responsabilidad:

- eliminar el relay de `nip65Both`, `nip65Read` y `nip65Write`
- volver a insertarlo en el conjunto correcto según la combinación `read/write`
- recomputar `relays` sin afectar `dmInbox` ni `search`

El nombre final puede variar, pero su responsabilidad debe ser única y explícita.

### 5.7 Sección `Relays de mensajes`

La nueva sección usará el mismo patrón visual ya empleado por `Relays de búsqueda`:

- card propia
- descripción corta
- listado configurado
- alta manual por URL
- acciones de eliminar y reset
- sugeridos del perfil si existen

Copy esperado:

- se usan para recibir mensajes privados
- esta lista corresponde al `kind:10050`
- si tu perfil publica relays de DM, pueden aparecer como sugeridos

Política explícita:

- la sección arranca prellenada con defaults recomendados
- las sugerencias remotas de `kind:10050` se muestran como sugerencias, no sobreescriben el estado local automáticamente
- la fuente de verdad de esos defaults vive en `relay-settings.ts`, no en el controller ni en la página
- añadir manualmente un relay DM ya existente o añadir un sugerido ya configurado debe ser un no-op silencioso apoyado en la deduplicación normal del modelo

Orden visual explícito dentro de la sección DM:

1. formulario y acciones primarias
2. tabla de relays DM configurados
3. tabla de relays DM sugeridos, si existe

### 5.8 Detalle del relay

Hoy el detalle muestra una sola `Categoria`, tomada desde el `primaryRelayType` o desde el tipo usado al abrir el detalle.

Con la nueva UX eso deja de representar bien los relays configurados, porque un relay puede estar activo simultáneamente en:

- `nip65Both`
- `dmInbox`
- `search`

El detalle debe cambiar para mostrar `Usos activos` o una lista equivalente derivada del estado actual cuando la fuente sea `configured`.

Para relays sugeridos se conservará la representación basada en los tipos sugeridos recibidos, sin consultar el estado persistido local para reinterpretarlos.

## 6) Contrato de interacción

### 6.1 Alta general

Flujo:

1. usuario introduce una o varias URLs
2. se normalizan con `normalizeRelayInput`
3. cada URL válida se añade como `nip65Both`
4. se limpia el input
5. los errores de parsing siguen mostrándose igual

### 6.2 Edición general con toggles

Flujo por fila:

1. usuario cambia `Read` o `Write`
2. el controller calcula el siguiente estado booleano deseado
3. persiste usando el helper NIP-65 nuevo
4. si el relay queda sin uso NIP-65, desaparece de la tabla principal aunque siga existiendo en `dmInbox`
5. si el relay sigue presente en `dmInbox`, seguirá visible únicamente dentro de `Relays de mensajes`

### 6.3 Relays de mensajes

Flujo inicial:

1. la sección ya muestra los defaults recomendados si el usuario no había personalizado nada
2. el usuario puede añadir manualmente un relay de mensajes
3. el usuario puede eliminar uno configurado
4. `Restablecer recomendados` vuelve a los defaults locales de `dmInbox`

Contrato de interacción del alta manual DM:

- usa la misma normalización `normalizeRelayInput` que el alta general
- acepta una o varias URLs separadas por salto de línea
- las URLs duplicadas se deduplican de forma silenciosa mediante el modelo
- las entradas inválidas se muestran con el mismo patrón de error que el alta general
- tras persistir las entradas válidas, el input se limpia

Contrato de persistencia e integración:

- las ediciones de `dmInbox` siguen usando el flujo normal de persistencia local ya existente en relay settings
- este diseño no introduce una ruta nueva de guardado ni una publicación inmediata adicional distinta a la ya existente
- el reset general de relays no debe alterar `dmInbox` ni `search`; solo el reset específico de mensajes puede reponer los defaults DM

## 7) Testing

Cobertura mínima esperada:

- `relay-settings.test.ts` cubre transiciones NIP-65 entre `both`, `read`, `write` y `off`
- el reset general no rompe `search`
- el reset de mensajes repone los defaults recomendados de `dmInbox`
- existe un caso explícito `sin payload local -> defaults DM visibles`
- existe un caso explícito `payload persistido con dmInbox vacío -> la UI no reinyecta defaults`
- existe un caso explícito donde un mismo relay participa en NIP-65 y `dmInbox`, y al apagar `Read` y `Write` desaparece de la tabla general pero permanece en la sección DM
- `SettingsRelaysPage.test.tsx` valida:
  - desaparición del selector de categoría del alta general
  - presencia de columnas/toggles `Read` y `Write`
  - presencia de la nueva sección `Relays de mensajes`
  - relays de mensajes configurados separados de la tabla principal
- `SettingsRelayDetailPage.test.tsx` deja de depender del texto `Categoria` y pasa a validar la representación nueva de usos activos

No se exige en esta fase una suite nueva exclusiva para el controller si los tests de modelo y de página cubren bien el contrato resultante.

## 8) Riesgos y mitigaciones

Riesgo principal:

- mezclar accidentalmente `dmInbox` con la tabla general al seguir reutilizando `buildRelayRowsByUrl` sin filtrar tipos por sección

Mitigación:

- derivar explícitamente cada colección (`configured`, `dmConfigured`, `searchConfigured`) con objetos `byType` ya filtrados antes de llamar al builder

Riesgo secundario:

- que una transición `both -> read-only` o `both -> write-only` deje el relay duplicado en varios sets NIP-65

Mitigación:

- el helper de actualización NIP-65 debe partir siempre de remover el relay de los tres sets antes de reinsertarlo

Riesgo terciario:

- que el detalle del relay muestre información inconsistente al seguir usando un solo tipo representativo

Mitigación:

- representar lista de usos activos en vez de una sola categoría para relays configurados

## 9) Implementación prevista

Archivos previstos:

- `src/nostr/relay-settings.ts`
- `src/nostr/relay-settings.test.ts`
- `src/nostr-overlay/components/settings-routes/controllers/useRelaysSettingsController.ts`
- `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`
- `src/nostr-overlay/components/settings-routes/SettingsRelaysRoute.tsx`
- `src/nostr-overlay/components/RelaysRoute.tsx`
- `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.tsx`
- `src/nostr-overlay/components/settings-pages/SettingsRelayDetailPage.test.tsx`

Secuencia prevista:

1. cerrar el helper NIP-65 y sus tests
2. simplificar el alta general y separar las colecciones del controller
3. añadir toggles `Read` / `Write` en la tabla principal
4. crear la sección separada de `Relays de mensajes`
5. ajustar el detalle del relay y tests asociados
6. verificar con tests enfocados de relays

## 10) Nota de control

Este diseño consolida la decisión de producto ya validada en conversación. No incluye commit del spec porque la sesión actual no contiene una petición explícita de crear commits.
