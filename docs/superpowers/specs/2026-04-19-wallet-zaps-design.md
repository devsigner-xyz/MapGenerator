# Wallet And Functional Zaps Design

## Context

El overlay ya expone menus de `Zap` en personas y contexto de edificios, pero hoy esos menus no ejecutan pagos reales. La app tambien tiene `Settings > Zaps`, aunque esa pantalla solo persiste cantidades rapidas por usuario y no existe todavia una capa de wallet local para pagar invoices.

En paralelo, el sidebar principal no tiene una entrada top-level de `Wallet`; `Settings` solo conoce `ui`, `shortcuts`, `zaps`, `about` y `advanced`. El objetivo de esta iteracion es introducir una superficie `Wallet` propia, hacer que `Zaps` dependan de esa wallet operativa y mantener separadas las preferencias de zap frente al estado de conexion y pago.

Las cabeceras de esta spec siguen el formato habitual del repositorio. Los nombres entre comillas invertidas como `Wallet`, `Settings`, `Balance` o `Recibir` describen nombres de ruta, componentes conceptuales o labels de producto; no implican que toda la UI final deba quedarse sin localizar.

## Scope

Dentro de alcance:

- navegacion top-level del overlay para exponer `/wallet`
- pagina `Wallet` como superficie routada propia
- persistencia por usuario de la wallet activa y sus metadatos
- soporte inicial para `NWC + WebLN`
- integracion del flujo de zap para pagar invoices reales
- ampliacion de `Settings > Zaps` para seguir siendo la pantalla de preferencias de zap
- actividad reciente local de acciones de wallet iniciadas desde la app
- accion `Recibir` solo cuando el metodo activo soporte `make_invoice`
- tests de routing, sidebar, estados de wallet, gating de capacidades y flujo de zap

Fuera de alcance:

- multiples wallets activas simultaneamente
- gestion de varias conexiones guardadas con selector avanzado
- historial universal completo de la wallet remota
- soporte de Cashu, nutzaps o custodias adicionales
- edicion de `lud16` o `lud06` desde la pagina `Wallet`
- rediseno general del sidebar o de `Settings` fuera de los cambios necesarios para `Wallet` y `Zaps`

## Goals

- Introducir `Wallet` como entrada top-level del overlay, separada de `Settings`.
- Permitir conectar una wallet por `NWC` o `WebLN`.
- Hacer que los zaps usen la wallet activa para ejecutar pagos reales.
- Mantener `Settings > Zaps` como la pantalla de preferencias de cantidades y defaults, no como superficie de conexion.
- Mostrar estado de conexion, capacidades y balance cuando el proveedor lo soporte.
- Exponer `Recibir` como capacidad progresiva cuando el metodo activo permita `make_invoice`.
- Registrar actividad reciente local de pagos y resultados relevantes.

## Non-Goals

- No convertir `Wallet` en un explorador completo de transacciones del proveedor.
- No prometer `balance`, `notifications` o `receive` cuando el metodo activo no exponga esas capacidades.
- No mezclar la wallet de pago con la identidad principal de Nostr o con la configuracion del perfil.
- No introducir retrocompatibilidad larga para metodos de wallet que la app no soporte todavia.

## Decision

Se introduce una pagina top-level `/wallet` y se mantiene `Settings > Zaps` como pantalla de preferencias. La wallet activa se modela como una capacidad local del cliente, con una sola conexion activa por `ownerPubkey`.

- `Wallet` responde a que metodo de pago esta activo y que capacidades operativas tiene en este cliente.
- `Settings > Zaps` responde a las preferencias de envio de zaps: cantidades rapidas y defaults de uso.
- Los menus de `Zap` intentan usar la wallet activa; si no existe, redirigen a `/wallet` con un contrato de retorno definido.
- `Recibir` se expone solo si la wallet activa soporta `make_invoice`.
- La actividad visible en `Wallet` es local a la app, no un historial universal del proveedor.

## Support Definition

Cuando esta spec habla de que un proveedor o metodo `soporta` una capability, significa:

- el metodo la anuncia de forma explicita o la expone mediante una API detectable
- la app pudo verificar esa capability durante la conexion o en un refresh posterior
- la UI solo la trata como disponible cuando el estado verificado actual es `true`

No se consideran soportadas capacidades inferidas por nombre, por suposicion o por exito historico de una sesion previa.

## Method Capability Baseline

El minimo entregable por metodo en esta iteracion es:

- `NWC`
  - requerido: conectar, verificar URI, resolver capabilities, `payInvoice`
  - opcional: `getBalance`, `makeInvoice`, `notifications`
- `WebLN`
  - requerido: detectar provider, `enable()`, resolver capabilities, `payInvoice`
  - opcional: `getBalance`, `makeInvoice`

Si un metodo no puede exponer `payInvoice`, no se considera una conexion valida para la primera release de `Wallet + Zaps`.

Para `NWC`, la resolucion canonica de capabilities desde `13194` es:

- parsear `content` como lista separada por espacios y normalizarla con trim + dedupe
- `payInvoice === true` solo si `content` incluye `pay_invoice`
- `getBalance === true` solo si `content` incluye `get_balance`
- `makeInvoice === true` solo si `content` incluye `make_invoice`
- `notifications === true` solo si `content` incluye `notifications`

Campos duplicados o desconocidos se ignoran tras normalizacion. Si el `13194` es valido pero su `content` es inutilizable o no confirma `pay_invoice`, la conexion se rechaza en esta iteracion.

La resolucion canonica de soporte de cifrado desde `13194` es:

- leer todos los tags `encryption`
- separar cada valor por espacios, normalizar con trim + dedupe y unir los modos soportados
- si la union contiene `nip44_v2`, ese modo tiene prioridad
- si la union contiene solo `nip04`, usar `nip04`
- si no hay tags `encryption`, aplicar la regla de fallback ya definida

Para `WebLN`, el adapter debe mapear capabilities asi:

- `payInvoice === true` solo si el provider expone `sendPayment` tras `enable()`
- `getBalance === true` solo si el provider expone `getBalance`
- `makeInvoice === true` solo si el provider expone `makeInvoice`

## Information Architecture

### Sidebar

- Se agrega `Wallet` como item top-level del sidebar principal.
- La ubicacion requerida es justo encima de `Ajustes` para mantener el orden actual casi intacto y hacer visible la nueva capacidad sin esconderla dentro de settings.
- El item debe mostrar un indicador discreto de estado:
  - sin indicador cuando existe una wallet conectada y sin error
  - indicador de advertencia cuando no existe wallet activa
  - indicador de error cuando el ultimo intento de conexion o refresh fallo

La representacion minima observable del indicador es un dot o badge pequeno renderizado junto al item `Wallet`, con `aria-label` explicita:

- `Wallet desconectada`
- `Wallet con error`

### Route Layout

- `/wallet` usa el shell de paginas routadas del overlay, equivalente al usado por `NotificationsPage` o `UserSearchPage`.
- `Settings` conserva su layout actual y sigue alojando `zaps` como subruta de preferencias.

### Wallet Page Sections

- cabecera con titulo, descripcion, estado y acciones principales
- tarjeta `Wallet activa` con metodo, alias/proveedor y acciones `Cambiar`, `Desconectar`, `Refrescar`
- tarjeta `Balance` siempre visible; el valor numerico y el boton `Consultar balance` solo se renderizan cuando `getBalance === true`
- tarjeta `Conectar wallet` con caminos visibles para `NWC` y `WebLN`
- tarjeta `Recibir` siempre visible; su accion solo se renderiza cuando `makeInvoice === true`
- tarjeta `Actividad reciente` con intentos, exitos y fallos de acciones de wallet iniciadas desde la app, ordenada de mas reciente a mas antigua

## Visibility Rules

- Sin wallet activa, `Conectar wallet` es la unica accion de conexion visible en el estado vacio.
- Con wallet activa, siguen visibles `Cambiar`, `Desconectar` y `Refrescar`; la tarjeta de conexion permanece visible para seleccionar otro metodo si el usuario decide reconectar.
- `Wallet activa`, `Balance`, `Recibir` y `Actividad reciente` se muestran siempre, pero con empty state cuando no existe wallet activa.
- `Cambiar` significa `desconectar la wallet actual y abrir el selector de conexion`. No implica selector de varias conexiones guardadas ni switching automatico entre perfiles persistidos.
- `Desconectar` requiere confirmacion y elimina la conexion activa persistida del usuario actual.
- La confirmacion de `Desconectar` debe usar un patron observable equivalente a `AlertDialog` con accion explicita `Desconectar` y cancelacion.
- `Refrescar` vuelve a consultar capabilities siempre que exista wallet conectada; solo vuelve a consultar balance cuando `getBalance === true`.
- `Balance` no hace autoload silencioso. La tarjeta se renderiza siempre, pero solo consulta el valor cuando el usuario pulsa `Consultar balance` o cuando pulsa `Refrescar` con una wallet ya conectada.
- Cuando `getBalance === false`, la tarjeta `Balance` muestra el texto `Balance no disponible para este metodo`.
- `Recibir` no se oculta por falta de capability; la tarjeta comunica `Este metodo no soporta generar invoices` cuando `makeInvoice === false`.

## State Contract

La implementacion debe separar al menos tres piezas de estado:

1. `wallet connection`
   - metodo activo: `nwc | webln | none`
   - estado: `disconnected | connecting | connected | error`
   - metadatos serializables necesarios para restaurar la conexion por usuario

2. `wallet capabilities`
- `payInvoice`
- `getBalance`
- `makeInvoice`
- `notifications`
- otras capacidades opcionales que el proveedor anuncie, sin obligar a la UI a usarlas

Las capabilities deben representarse como booleanos explicitamente resueltos para la sesion actual. Una capability ausente o no verificada se trata como `false`, nunca como `undefined` en la capa que consume la UI.

3. `wallet activity`
- eventos locales de la app con `pending | succeeded | failed`
- monto, timestamp, destino, tipo de accion y mensaje de error si aplica

El esquema minimo de `wallet activity` debe incluir:

- `id`
- `status`: `pending | succeeded | failed`
- `actionType`: `zap-payment | manual-receive`
- `amountMsats`
- `createdAt`
- `targetType`: `profile | event | invoice | none`
- `targetId` opcional
- `errorMessage` opcional
- `provider`: `nwc | webln`
- `invoice` opcional para `manual-receive` exitoso
- `expiresAt` opcional para `manual-receive` exitoso

En esta iteracion, `wallet activity` cubre tanto intentos de pago iniciados por la app como la generacion manual de invoices desde la tarjeta `Recibir`.

La UI de `Actividad reciente` debe mostrar los registros en orden descendente por `createdAt`, con actualizacion in-place del item cuando su estado cambia y sin reordenarlo por la transicion de estado. El listado visible puede limitarse a los 20 registros mas recientes.

El formato canonico de `targetId` es:

- perfil: pubkey hex del destinatario
- evento no addressable: event id hex
- evento addressable: coordinate completa del tag `a`
- invoice: payment request exacta cuando aplique

El lifecycle observable de `manual-receive` es:

- crear registro `pending` al iniciar `makeInvoice`
- pasar a `succeeded` cuando el provider devuelve la invoice generada
- pasar a `failed` si `makeInvoice` falla
- guardar como metadata minima de exito la invoice generada y su expiracion si el provider la devuelve

La persistencia de `wallet connection` debe ser scoped por `ownerPubkey`, igual que `zaps` y `relays`. `wallet activity` puede persistirse por usuario para restaurar contexto reciente, pero no debe depender de una API universal del proveedor.

## Persistence And Security Boundary

- La spec permite persistir la conexion activa por usuario para restaurar la sesion local.
- La restauracion automatica local de la wallet activa en el mismo dispositivo entra en alcance.
- En `NWC`, esto incluye metadatos suficientes para reconstruir la conexion, incluido el secreto en storage local scoped por usuario.
- En `WebLN`, la restauracion tras recarga solo recuerda el metodo seleccionado y el estado previo; no se considera reconexion automatica completa hasta que el provider permita un nuevo `enable()` valido.
- Esa persistencia se considera sensible y queda limitada a storage local del navegador, scoped por `ownerPubkey`; no se sincroniza, exporta ni mezcla con el estado de la identidad principal.
- La advertencia sobre almacenamiento sensible de `NWC` debe mostrarse como helper text inline en la tarjeta o formulario de conexion `NWC` con el texto: `Guardar esta conexion en este dispositivo almacena datos sensibles de wallet.`
- `Desconectar` debe borrar la conexion activa persistida del usuario actual.

## Wallet Adapter Boundary

La UI no debe hablar directamente con `NWC` ni con `WebLN`. Se define una capa comun de adapter con metodos equivalentes:

- `connect`
- `disconnect`
- `getCapabilities`
- `getBalance`
- `payInvoice`
- `makeInvoice` cuando exista

Sobre esa interfaz se montan dos adaptadores:

- `nwc adapter`
- `webln adapter`

Esto permite que la UI, el flujo de zap y los tests dependan de un contrato comun y no de detalles especificos del proveedor.

El contrato del adapter debe incluir resultados y errores normalizados:

- `connect` devuelve estado conectado mas capabilities verificadas
- `getBalance` devuelve un resultado exitoso o un error tipado de capability/transport
- `payInvoice` devuelve un resultado exitoso solo cuando el metodo de pago confirma exito segun el proveedor activo
- `makeInvoice` devuelve una invoice generada y su metadata minima cuando la capability existe
- todos los errores de adapter se transforman en una forma normalizada apta para UI y actividad local

La unidad canonica del contrato de adapter es `msats` para montos entrantes y salientes. Los inputs de UI en sats se convierten a `msats` en el boundary de presentacion antes de llamar al adapter.

La forma canonica de error del adapter es:

- `code`: `parse_error | capability_unsupported | connection_unavailable | transport_timeout | provider_rejection | signer_unavailable | invoice_fetch_failure | payment_failure`
- `message`: texto humano utilizable por UI
- `retryable`: booleano

Cada adaptador debe mapear sus fallos internos a uno de esos `code` antes de devolver control a la UI.

El shape minimo de exito es:

- `payInvoice`: `preimage` obligatorio; `feesPaidMsats` opcional
- `makeInvoice`: `invoice` obligatoria; `expiresAt` opcional

En `NWC`, los errores de provider se derivan del `error.code` y `error.message` del payload descifrado. En `WebLN`, los errores del provider deben mapearse a la forma canonica del adapter antes de llegar a UI.

## Protocol Boundaries

### NWC

- La conexion `nostr+walletconnect://` se trata como wallet de pago, no como identidad principal del usuario.
- La implementacion debe validar pubkey, secret y relay URLs antes de persistir la conexion.
- La validacion minima de la URI es sintactica: pubkey hex valido, `secret` de 32 bytes hex, uno o mas relays validos y normalizados.
- Un relay solo se considera valido si pasa por la misma politica de normalizacion de relay ya usada por el overlay para settings y parsing de URIs; si esa normalizacion falla, el relay es invalido.
- La app debe descubrir capacidades antes de asumir `pay_invoice`, `get_balance`, `make_invoice` o `notifications`.
- La discovery de capabilities debe partir del evento `info` kind `13194`.
- Antes de confiar en ese `13194`, la app debe verificar que el evento es valido y que esta firmado por el pubkey del wallet service indicado en la URI `nostr+walletconnect://`.
- Si llegan multiples eventos `13194` validos, la app usa el mas reciente por `created_at` entre los firmados por el wallet service esperado dentro de la ventana de discovery inicial de 10 segundos; en empate, usa el de `id` lexicograficamente menor.
- Si el evento `info` falta, esta mal formado o no confirma `pay_invoice`, la conexion `NWC` debe rechazarse en esta iteracion.
- La discovery inicial de `13194` tiene timeout de 10 segundos; si no aparece un evento valido en ese plazo, la conexion falla inline y no se persiste.
- La negociacion de cifrado queda fijada asi:
  - si `info` anuncia `nip44_v2`, usar `NIP-44` y enviar `23194` con tag `['encryption', 'nip44_v2']`
  - si `info` anuncia solo `nip04`, usar `NIP-04` y omitir el tag `encryption` en `23194`
  - si `info` no trae `encryption` tag, permitir fallback `NIP-04`
  - si `info` anuncia solo modos no soportados, rechazar la conexion
- Los requests `23194` deben incluir `expiration` a 60 segundos desde su creacion.
- Los requests `23194` deben incluir el tag `['p', <wallet-service-pubkey>]` y estar firmados con la key cliente derivada del `secret` de la URI `nostr+walletconnect://`.
- El cliente considera timeout a los 90 segundos sin `23195` valido y registra un unico fallo idempotente; no reintenta automaticamente pagos expirados o timeouts.
- Los responses `23195` deben validarse antes de aceptarse: firma valida, autor igual al wallet-service pubkey de la URI, `p` dirigido al pubkey cliente de la conexion, `e` igual al request id, `result_type` igual al metodo solicitado y contenido correctamente descifrado con el modo negociado.
- Los requests y responses de wallet deben mantenerse separados del resto del dominio de auth.

### Zaps

- El flujo de zap debe respetar la secuencia de `NIP-57`: resolver lnurl o `zap` tags, construir `9734`, pedir invoice por callback y solo despues pagar la invoice.
- La peticion al callback LNURL debe enviar el `9734` firmado como parametro `nostr`, junto con el `amount` en msats y `lnurl` cuando aplique.
- Cuando se envie `lnurl` al callback, el valor canonico debe ser el lnurl-pay URL codificado en bech32 con prefijo `lnurl`.
- Si el target es un evento con `zap` tags validos, esos `zap` tags tienen precedencia sobre `lud16` o `lud06` del autor del perfil.
- Si no existen `zap` tags validos y el perfil expone ambos `lud16` y `lud06`, la app debe preferir `lud16` y usar `lud06` solo como fallback.
- En esta iteracion, un `zap` tag solo se considera valido si hay exactamente un destinatario resoluble, con pubkey hex valida y sin pesos o splits fuera de alcance.
- Para un unico `zap` tag valido, la app usa el pubkey etiquetado como destinatario y el relay del tag como fuente preferente para resolver su metadata kind-0; si el relay del tag no responde, puede usar metadata ya cacheada o hacer fallback a relays de lectura activos del usuario.
- Si tras resolver ese destinatario no existe `lud16` ni `lud06` utilizable, el zap falla con `No se puede enviar este zap.`.
- El evento `9734` debe firmarse con la identidad Nostr autenticada del usuario, no con la conexion de wallet.
- El `9734` debe incluir tags deterministas por tipo de target:
  - zap a perfil: `relays`, `p`, `amount`
  - zap a evento no addressable: `relays`, `p`, `amount`, `e`
  - zap a evento addressable: `relays`, `p`, `amount`, `a`
- El tag `k` puede incluirse como kind stringificado del target cuando la implementacion ya tenga ese dato disponible, pero no es requisito de interoperabilidad en esta iteracion.
- Cuando exista lnurl del destinatario, el `9734` debe incluir tambien el tag recomendado `lnurl`.
- El `amount` del `9734` y el parametro `amount` enviado al callback LNURL deben expresarse en msats como string y ser iguales entre si.
- Antes de pedir la invoice, la app debe validar que el monto elegido cae dentro de `minSendable` y `maxSendable` del endpoint LNURL.
- Tras recibir la invoice, la app debe rechazarla si el monto codificado no coincide con el monto solicitado para el zap.
- La app debe validar que la invoice recibida sea una description-hash invoice vinculada al `9734` firmado que origino la solicitud.
- La comparacion de description hash debe hacerse sobre la serializacion JSON exacta del `9734` firmado enviada en el parametro `nostr` del callback LNURL.
- El tag `relays` del `9734` debe construirse a partir de los relays con capacidad de escritura configurados por el usuario actual en el overlay, es decir la union normalizada y deduplicada de sus listas de escritura activas.
- Si el usuario no tiene relays de escritura activos, la app debe abortar el zap con el toast `No se puede enviar este zap.` y registrar el intento como `failed`.
- Si el destino no es zap-compatible (`allowsNostr !== true`, `nostrPubkey` ausente o invalido, o no existe target valido de zap), la app debe abortar el flujo con error explicito. En esta iteracion no se hace fallback automatico a pago Lightning generico.
- Los eventos con multiples `zap` tags o pesos de reparto quedan fuera de alcance en esta iteracion. La app debe rechazarlos con error explicito en vez de intentar un split payment parcial.
- La app no debe fingir un zap como exitoso si solo obtuvo una invoice.
- La app solo marca el zap como exitoso cuando el metodo de pago activo devuelve confirmacion de exito para la invoice.
- La observacion o validacion de `9735` zap receipts para confirmar exito final queda fuera de alcance en esta iteracion; el exito local de v1 significa invoice pagada con confirmacion del metodo activo.
- Los fallos de invoice o pago deben quedar reflejados tanto en la UI inmediata como en `Actividad reciente`.
- Si la app no puede firmar el `9734` con la identidad Nostr autenticada del usuario por ausencia de signer, signer bloqueado, rechazo o error de firma, el zap falla antes del callback LNURL con `No se puede enviar este zap.` y actividad `failed`.

## Zaps Preference Boundary

`Settings > Zaps` permanece como pantalla de preferencias y debe poder crecer sin absorber la conexion de wallet.

- cantidades rapidas
- cantidad por defecto

En esta iteracion, `Settings > Zaps` debe ampliar su contrato para soportar `cantidad por defecto`. `mensaje por defecto` queda fuera de alcance y se difiere a una iteracion posterior.

La pagina `Wallet` no reemplaza estas preferencias; las consume de forma indirecta cuando el usuario dispara un zap desde menus o perfiles.

## Flow Mapping

### Connect Wallet

1. Usuario entra en `/wallet`.
2. Elige `NWC` o `WebLN`.
3. La app valida y conecta usando el adapter correspondiente.
4. Si la conexion es valida, persiste el estado por usuario y actualiza capacidades.
5. La cabecera y la tarjeta `Wallet activa` reflejan el nuevo estado.

### Pay Zap

1. Usuario selecciona una cantidad de zap desde un menu existente.
2. Si no hay wallet activa con `payInvoice`, la app navega a `/wallet` con retorno al contexto original.
3. Si no hay wallet activa, la app no crea todavia actividad; solo conserva el intento interrumpido para reanudarlo.
4. Cuando ya existe wallet activa y el flujo real va a ejecutarse, la app crea inmediatamente un registro de actividad local en estado `pending`.
5. La app resuelve el target de zap y obtiene la invoice.
6. La app paga la invoice a traves del adapter activo.
7. La actividad pasa a `succeeded` o `failed` y se expone resultado inmediato.

## Return Contract For Interrupted Zaps

Cuando un zap se interrumpe por falta de wallet activa, la app debe conservar en memoria o en route state al menos:

- tipo de target (`profile | event`)
- identificador canonico del target
- monto elegido
- mensaje de zap si existia
- ruta de origen serializada como `pathname + search` cuando exista

La implementacion puede usar memoria o route state, pero el contrato observable es fijo:

- el intento sobrevive a navegacion interna de la SPA durante la misma sesion
- el intento no sobrevive a recarga completa del navegador
- el intento se invalida tras pago exitoso, cancelacion explicita o error definitivo de compatibilidad del target

Se considera `error definitivo de compatibilidad del target` cualquiera de estos casos:

- no hay relays de escritura activos
- el target no es zap-compatible
- el target expone multiples `zap` tags o pesos de reparto fuera de alcance
- el target o su callback LNURL no permiten construir un zap compatible con `NIP-57`

Los errores de transporte, timeout, rechazo del provider, invoice fetch failure y payment failure no invalidan por si solos la compatibilidad del target; esos casos dejan el intento como reintentable mientras la sesion siga viva.

Tras una conexion exitosa desde `/wallet`, la app debe reanudar automaticamente el flujo si el contexto sigue siendo valido. Si la reanudacion falla por invalidez del target, del callback o de la invoice, la app debe:

- mostrar un error inline con `role='alert'` dentro de la superficie `Wallet`
- mostrar tambien el toast correspondiente (`No se puede enviar este zap.` o `No se pudo completar el pago.` segun la causa)
- marcar el intento como `failed`
- limpiar el intento pendiente para evitar reintentos fantasma
- conservar al usuario en `/wallet`

Si la auto-reanudacion termina con exito, la app debe volver a la ruta de origen guardada con el intento interrumpido. Si no existe ruta de origen representable, la app puede permanecer en `/wallet` y mostrar el estado exitoso alli.

En esta spec, una `ruta de origen representable` significa una combinacion serializable de `pathname + search` del router actual. Estados efimeros no serializables, menus contextuales abiertos o UI transitoria fuera de ruta no forman parte del contrato de retorno.

### Receive

1. Usuario entra en `/wallet`.
2. Si la wallet activa soporta `make_invoice`, la app muestra el boton `Generar invoice` y un input obligatorio de monto en sats en la tarjeta `Recibir`.
3. En esta iteracion, `makeInvoice` solo requiere monto; descripcion y expiry quedan fuera de alcance y se delegan al comportamiento por defecto del provider cuando exista.
4. Al pulsar `Generar invoice`, la app crea actividad `pending`, ejecuta `makeInvoice` y despues deja ese registro en `succeeded` o `failed`.
5. Cuando `makeInvoice` tiene exito, la UI muestra la invoice generada junto al boton `Copiar invoice`.
6. Si la capability no existe, la tarjeta comunica de forma explicita que `Recibir` no esta soportado por ese metodo.

## Error Handling

- `NWC` invalida: error inline con `role='alert'` en el formulario de conexion; no genera actividad.
- `WebLN` no disponible: error inline con `role='alert'` en la tarjeta de conexion; no genera actividad.
- `capability unsupported`: estado inline estable dentro de la tarjeta afectada; no genera actividad.
- `wallet transport timeout`: un solo toast con el texto `No se pudo completar el pago.` y registro `failed` en actividad cuando afecta a una accion iniciada por el usuario.
- `provider rejection`: un solo toast con el texto `No se pudo completar el pago.` y registro `failed` en actividad cuando afecta a una accion iniciada por el usuario.
- `invoice fetch failure`: un solo toast con el texto `No se pudo completar el pago.` y registro `failed` en actividad para el intento de zap.
- `payment failure`: un solo toast con el texto `No se pudo completar el pago.` y registro `failed` en actividad para el intento de pago.
- `target no zap-compatible` o `split zap fuera de alcance`: un solo toast con el texto `No se puede enviar este zap.` y registro `failed` en actividad para el intento de zap.
- `zap success`: un solo toast con el texto `Pago enviado.` y transicion del registro de actividad de `pending` a `succeeded`.

## Technical Direction

- `OverlaySidebar.tsx`
  - agregar item top-level `Wallet`
  - marcarlo activo en `/wallet`
- `App.tsx`
  - registrar la nueva ruta `/wallet`
  - cablear la composicion de pagina y el paso del estado, sin convertir `App.tsx` en el hogar de la logica de wallet
  - cablear los menus de zap actuales para que dejen de ser placeholder y usen el flujo real
- `settings-routing.ts`
  - no mover `wallet` a settings; `zaps` permanece como subruta de preferencias
- dominio `src/nostr`
  - crear modulo de estado persistido para wallet
  - crear contrato de adapter y adaptadores `nwc` y `webln`
  - modelar actividad local de wallet
- UI `src/nostr-overlay/components`
  - crear `WalletPage` y sus secciones
  - ampliar `SettingsZapsPage` si hace falta para defaults adicionales, sin absorber conexion

## Validation Criteria

- El sidebar muestra `Wallet` como item top-level y la ruta `/wallet` queda accesible en acceso directo.
- `Wallet` aparece inmediatamente encima de `Ajustes` en el sidebar principal.
- Cuando no hay wallet activa, el item `Wallet` muestra un dot o badge de advertencia.
- Cuando la ultima conexion o refresh falla, el item `Wallet` muestra un dot o badge de error.
- Los indicadores del sidebar exponen `aria-label` comprobable para desconexion y error.
- La app mantiene accesibles tanto `/wallet` como `/settings/zaps` y cada ruta conserva su funcion separada.
- La app puede conectar una wallet por `NWC` cuando la URI es valida, el `13194` esta firmado por el wallet service esperado y confirma `pay_invoice`.
- Si aparecen multiples `13194` validos, la app usa el de `created_at` mas reciente dentro de la ventana de discovery inicial de 10 segundos; en empate, usa el de `id` lexicograficamente menor.
- Si no aparece `13194` valido en 10 segundos, la conexion `NWC` falla inline y no se persiste.
- La app puede conectar una wallet por `WebLN` cuando el provider existe, `enable()` funciona y el adapter puede marcar `payInvoice === true` porque el provider expone `sendPayment`.
- Tras una recarga, `WebLN` puede restaurarse como metodo recordado pero no se considera `connected` hasta completar un nuevo `enable()` valido.
- La validacion de `NWC` rechaza URIs con pubkey invalida, sin `secret` o sin relays validos.
- La validacion de `NWC` rechaza `secret` que no sea hex de 32 bytes.
- La tarjeta `Balance` se renderiza siempre, pero el valor y el boton `Consultar balance` solo aparecen cuando `getBalance === true`.
- Cuando `getBalance === false`, la tarjeta `Balance` muestra `Balance no disponible para este metodo`.
- La tarjeta `Recibir` se renderiza siempre, pero su accion solo aparece cuando `makeInvoice === true`; en caso contrario muestra el estado no soportado.
- El input de `Generar invoice` acepta solo enteros positivos en sats; `0`, negativos, decimales o vacio muestran error inline con `role='alert'`.
- Sin wallet activa, `Conectar wallet` es la unica accion de conexion visible en el estado vacio.
- Con wallet activa, siguen visibles `Cambiar`, `Desconectar` y `Refrescar`; la tarjeta de conexion sigue visible para seleccionar otro metodo.
- `Cambiar` desconecta la wallet actual y abre de nuevo el selector de conexion; no aparece un selector de varias wallets guardadas.
- `Desconectar` elimina la conexion persistida del usuario actual.
- `Refrescar` vuelve a consultar capabilities sin requerir reconexion manual y solo vuelve a consultar balance cuando `getBalance === true`.
- `Balance` solo consulta un valor cuando el usuario pulsa `Consultar balance` o `Refrescar`; no se hace autoload silencioso.
- Al intentar un zap sin wallet activa, la app redirige a `/wallet` y conserva el contexto minimo del intento interrumpido.
- Tras conectar con exito desde un zap interrumpido, la app reanuda automaticamente el intento sin perder target ni monto.
- Si la auto-reanudacion termina con exito, la app vuelve a la ruta de origen guardada; si no hay ruta de origen representable, permanece en `/wallet`.
- Al recargar por completo el navegador durante un zap interrumpido, el intento pendiente se pierde y la UI no intenta reanudarlo.
- Al intentar un zap sin wallet activa, la app redirige a `/wallet` sin crear aun una entrada en `Actividad reciente`.
- Al intentar un zap con wallet activa, la app ejecuta el flujo real de invoice + pago: registra actividad `pending`, obtiene invoice, paga y termina en `succeeded` o `failed`; el exito muestra el toast `Pago enviado.`.
- El evento `9734` se firma con la identidad Nostr autenticada del usuario y no con la conexion de wallet.
- El `9734` usa tags distintos y obligatorios segun el tipo de target definido en la spec; `k` es opcional.
- La llamada al callback LNURL envia el `9734` firmado como parametro `nostr`, junto con `amount` y `lnurl` cuando aplica.
- El flujo valida `minSendable` y `maxSendable` antes de pedir la invoice y rechaza invoices con monto distinto al solicitado.
- El flujo rechaza invoices que no esten vinculadas al `9734` firmado mediante description hash.
- Si el destino contiene multiples `zap` tags o pesos de reparto, la app muestra el toast `No se puede enviar este zap.` y no intenta fallback a pago Lightning generico.
- Si el destino no es zap-compatible, la app muestra el toast `No se puede enviar este zap.` y no intenta fallback a pago Lightning generico.
- Si el usuario no tiene relays de escritura activos, la app muestra el toast `No se puede enviar este zap.` y no intenta construir un `9734` invalido.
- Si la app no puede firmar el `9734`, muestra el toast `No se puede enviar este zap.` y no intenta llamar al callback LNURL.
- Las requests `23194` incluyen `expiration` a 60 segundos y el cliente marca timeout a los 90 segundos si no llega `23195` valido.
- Un `23195` solo se acepta si su firma es valida, su autor es el wallet-service esperado, el `p`, `e` y `result_type` coinciden con la request activa y el contenido se descifra correctamente con el modo negociado.
- Las requests `23194` incluyen el tag `['p', <wallet-service-pubkey>]` y estan firmadas con la key cliente derivada del `secret`.
- Si la wallet usa `NIP-44`, la request `23194` incluye `['encryption', 'nip44_v2']`.
- Si la wallet usa `NIP-04`, la request `23194` omite el tag `encryption`.
- Los resultados de pago quedan reflejados en `Actividad reciente` usando el esquema minimo definido.
- Los intentos de `Generar invoice` dejan registros `manual-receive` que pasan por `pending` y terminan en `succeeded` o `failed`.
- El exito de `Generar invoice` muestra la invoice generada junto al boton `Copiar invoice`.
- Los fallos usan superficies de UI comprobables segun su clase: inline error para parseo o conexion, empty state inline para capability unsupported, y toast mas actividad `failed` para timeout, rechazo, invoice fetch failure, payment failure o target no soportado.
- Cuando un fallo ocurre durante la auto-reanudacion de un zap desde `/wallet`, la app muestra tanto el inline error con `role='alert'` dentro de `Wallet` como el toast correspondiente y mantiene al usuario en `/wallet`.
- El exito del zap muestra el toast `Pago enviado.` y deja la actividad correspondiente en `succeeded`.
- La tarjeta o formulario `NWC` muestra el helper text exacto `Guardar esta conexion en este dispositivo almacena datos sensibles de wallet.`
- La persistencia de wallet no se comparte entre usuarios distintos del overlay.
- Al recargar la app, el usuario recupera solo la conexion persistida de su propio `ownerPubkey`.
- `Settings > Zaps` persiste cantidades rapidas y `cantidad por defecto`; `mensaje por defecto` no forma parte de esta iteracion.
