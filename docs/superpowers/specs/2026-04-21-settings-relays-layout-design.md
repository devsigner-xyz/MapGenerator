# Diseño: ajustes de layout en la pantalla de relays

Fecha: 2026-04-21
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Corregir la presentación de la pantalla de listado de relays para que el bloque principal no se recorte por izquierda ni por abajo, no tenga scroll horizontal y ordene mejor las acciones secundarias.

Requisitos acordados:

- El listado principal de relays no debe recortarse por el lado izquierdo ni por la parte inferior.
- El listado principal no debe mostrar scroll horizontal.
- `Relays configurados` debe tener un área de tabla con `max-height: 800px` y scroll propio.
- `Relays sugeridos` debe tener su propia área de tabla con `max-height: 800px` y scroll propio.
- Se debe quitar el `box-shadow` del bloque principal del listado.
- El panel lateral con `Añadir relay` y `Relays sugeridos` deja de ser sidebar y pasa debajo del listado principal.
- Se elimina el texto `Conecta varios relays. Puedes agregar uno por vez y elegir categoria.`
- Los badges de totales (`Relays configurados`, `Conectados`, `Sin conexión`) deben mostrarse justo debajo de `Estado actual y categorias activas de tus relays.`

## 2) Decisión principal

Se reemplazará el layout de dos columnas por un flujo vertical de secciones.

`Relays configurados` seguirá siendo el bloque principal superior. Debajo se renderizarán dos bloques independientes, en este orden:

- `Añadir relay`
- `Relays sugeridos`

Se descarta mantener un sidebar colapsado porque deja CSS de layout lateral que ya no aporta valor y complica el control de overflow. También se descarta fusionar todo en una sola card porque mezcla tabla principal, formulario y sugerencias en una jerarquía menos clara.

## 3) Alcance

El cambio aplica a la pantalla `SettingsRelaysPage` y sus estilos/tests asociados.

En alcance:

- reordenación del markup de la página de relays
- eliminación del copy introductorio ya no deseado
- reposicionamiento de badges de resumen dentro del bloque principal
- limitación de altura y scroll interno de ambas tablas
- eliminación del scroll horizontal en los listados
- eliminación de la elevación visual del bloque principal
- actualización de tests de render de la página

Fuera de alcance:

- lógica de añadir, eliminar o abrir detalles de relay
- cálculo de estados de conexión
- contenido interno de cada fila de relay
- cambios en la página de detalle de relay

## 4) Arquitectura propuesta

### 4.1 Estructura general de la página

La página dejará de renderizar un contenedor `aside` lateral para relays.

La estructura conceptual quedará así:

```tsx
<div className="nostr-relays-content">
  <div className="nostr-relays-main">
    <Card className="nostr-relay-table-card ...">
      <CardHeader>
        <CardTitle>Relays configurados</CardTitle>
        <CardDescription>Estado actual y categorias activas de tus relays.</CardDescription>
        <div className="nostr-relay-connection-summary">...</div>
      </CardHeader>
      <CardContent>
        <div className="nostr-relay-table-scroll">...</div>
      </CardContent>
    </Card>

    <section className="nostr-relays-secondary-stack">
      <Card className="nostr-relays-panel ...">...</Card>
      <Card className="nostr-relays-panel ...">...</Card>
    </section>
  </div>
</div>
```

Objetivo de cada unidad:

- `nostr-relays-content`: contenedor general de la página sin layout lateral
- `nostr-relays-main`: pila vertical de secciones
- `nostr-relay-table-card`: card principal del listado configurado, sin shadow
- `nostr-relay-table-scroll`: viewport de tabla con altura máxima y scroll propio
- `nostr-relays-secondary-stack`: bloque vertical para acciones secundarias
- `nostr-relays-panel`: card reutilizable para `Añadir relay` y `Relays sugeridos`

### 4.2 Orden visual y jerarquía

El texto de ayuda superior se elimina por completo.

El header de `Relays configurados` quedará con esta secuencia:

1. título
2. descripción
3. badges de resumen

La motivación es que los indicadores pasen a leerse como parte del estado del bloque principal, no como una barra separada encima de la tabla.

El formulario `Añadir relay` pasa a ser una sección completa debajo del listado principal. `Relays sugeridos` queda debajo del formulario, no al lado.

## 5) Contrato de layout y scroll

### 5.1 Tabla principal `Relays configurados`

El contenedor visible de la tabla tendrá estas reglas:

- `max-height: 800px`
- `overflow-y: auto`
- `overflow-x: hidden`
- borde visible completo dentro de la card
- `min-width: 0` en wrappers intermedios para permitir compresión horizontal correcta

La tabla conservará `width: 100%` y `table-layout: fixed`.

No se añadirá scroll horizontal. Si una URL o badge es largo, el contenido deberá partir línea o ajustarse dentro de la columna existente.

Contrato explícito de contención:

- los wrappers de contenido dentro de la celda principal de relay seguirán usando `min-width: 0`
- el texto visible del relay seguirá usando `word-break: break-all` o una regla equivalente de corte agresivo
- los contenedores de badges de tipo seguirán permitiendo `flex-wrap`
- la celda de acciones conserva un ancho acotado y no debe crecer por contenido dinámico

Este contrato aplica tanto a `Relays configurados` como a `Relays sugeridos`.

### 5.2 Tabla `Relays sugeridos`

`Relays sugeridos` usará el mismo patrón de scroll independiente:

- wrapper propio de tabla
- `max-height: 800px`
- `overflow-y: auto`
- `overflow-x: hidden`

Esto permite que ambas listas crezcan de forma contenida sin expandir indefinidamente la altura de la página.

### 5.3 Prevención de recortes y overflow

El problema actual parece venir de la combinación de layout en dos columnas y wrappers con overflow abierto/cerrado en lugares distintos.

La corrección propuesta es deliberadamente mínima:

- eliminar el layout lateral para esta pantalla
- asegurar `min-width: 0` en los contenedores relevantes
- mover el scroll al wrapper interno de cada tabla
- evitar que la card principal delegue el overflow a su superficie exterior

Resultado esperado:

- el borde izquierdo vuelve a verse completo
- el borde inferior deja de quedar recortado
- desaparece el scroll horizontal del listado

## 6) Estilos

### 6.1 Card principal

La card de `Relays configurados` dejará de usar la variante elevada o cualquier clase que mantenga `box-shadow` visible.

No se cambiará el lenguaje visual base de cards, bordes o tabla fuera de esta necesidad concreta.

### 6.2 Secciones inferiores

`Añadir relay` y `Relays sugeridos` conservarán el estilo general actual, pero ya no vivirán bajo una clase semántica de sidebar.

El CSS asociado a `nostr-relays-sidebar` y al grid de dos columnas podrá simplificarse o quedar sin uso y eliminarse si no aporta nada al nuevo layout.

### 6.3 Reutilización mínima

Siempre que sea viable, el wrapper scrollable de tabla se reutilizará entre `Relays configurados` y `Relays sugeridos` para evitar duplicar reglas.

No se introducirán abstractions nuevas en React para esto; bastará con clases CSS claras sobre la estructura ya existente.

## 7) Testing

Se actualizarán los tests de `SettingsRelaysPage` para reflejar el nuevo contrato de render.

Cobertura mínima esperada:

- existe la card principal de tabla
- existe el wrapper scrollable dedicado de `Relays configurados`
- existe el wrapper scrollable dedicado de `Relays sugeridos` cuando hay sugerencias
- existen las secciones inferiores reubicadas
- el DOM ya no renderiza `.nostr-relays-sidebar`
- el orden visible de secciones es `Relays configurados` -> `Añadir relay` -> `Relays sugeridos`
- se mantienen los badges de resumen
- se mantiene el control para seleccionar la categoría del relay

No se añadirán tests visuales de CSS computado en esta fase; el objetivo del test es asegurar que el DOM esperado sigue presente tras la reorganización y que el contrato estructural del scroll independiente queda representado en el markup.

## 8) Riesgos y mitigaciones

Riesgo principal:

- alguna celda larga podría seguir forzando ancho extra si un wrapper pierde `min-width: 0` o si un contenido deja de partir palabra

Mitigaciones:

- conservar `table-layout: fixed`
- mantener `word-break` en las URLs largas
- fijar `overflow-x: hidden` en el viewport de tabla, no en la card externa

Riesgo secundario:

- que el cambio de orden visual afecte tests que todavía asumen la presencia del sidebar

Mitigación:

- actualizar `SettingsRelaysPage.test.tsx` junto con el JSX para validar el nuevo contrato del DOM

## 9) Implementación prevista

Archivos previstos:

- `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.tsx`
- `src/nostr-overlay/styles.css`
- `src/nostr-overlay/components/settings-pages/SettingsRelaysPage.test.tsx`

Secuencia de trabajo:

1. Reordenar el JSX para eliminar el `aside`, mover los badges al header principal y apilar `Añadir relay` y `Relays sugeridos` debajo.
2. Ajustar CSS para reemplazar el grid lateral por un flujo vertical y definir wrappers scrollables de tabla con `max-height: 800px`.
3. Quitar shadow del bloque principal.
4. Actualizar los tests de la página para el nuevo contrato de render.
5. Ejecutar el test de esta pantalla para validar que no se rompió el render básico.

## 10) Nota de control

Este diseño queda listo para planificación e implementación. No se ha incluido commit del spec en esta etapa porque la sesión actual no incluye una petición explícita de crear commits.
