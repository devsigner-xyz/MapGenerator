# Diseño: eliminar el tab Sobre mi del sidebar principal

Fecha: 2026-04-22
Estado: validado en conversación, listo para planificación

## 1) Objetivo

Eliminar el tab `Sobre mi` del sidebar principal del overlay social y no dejar código legado relacionado con ese acceso.

Requisitos acordados:

- el sidebar principal debe mostrar solo `Sigues` y `Seguidores`
- el tab `Sobre mi` deja de existir en el sidebar principal
- el contenido que hoy renderiza `ProfileTab` deja de formar parte del sidebar
- no debe quedar código legacy del tab eliminado
- no se debe tocar el campo `Sobre mi` del formulario de cuenta, porque es otro flujo

## 2) Decisión principal

Se eliminará por completo la variante `profile` de `SocialSidebar`.

Esto implica:

- quitar `profile` del tipo `SocialTab`
- cambiar el tab inicial a `following`
- dejar `TabsList` en dos columnas
- eliminar el `TabsTrigger` y `TabsContent` asociados a `Sobre mi`
- eliminar `ProfileTab` y su suite de tests si no tiene otros consumidores

Se descarta mantener `ProfileTab` oculto o sin acceso porque eso dejaría código muerto y contradice el requisito de no dejar legado.

## 3) Alcance

En alcance:

- `src/nostr-overlay/components/SocialSidebar.tsx`
- `src/nostr-overlay/components/ProfileTab.tsx` si queda sin usos
- `src/nostr-overlay/components/ProfileTab.test.tsx` si el componente se elimina
- tests de `src/nostr-overlay/App.test.tsx` que todavía esperan el tab `Sobre mi`
- limpieza repo-wide solo de referencias que participen en el sidebar social principal y sus tests asociados

Fuera de alcance:

- el diálogo o página de detalle de usuario
- el formulario de edición o creación de perfil que usa el label `Sobre mi`
- cualquier otra navegación del overlay no relacionada con el sidebar social principal
- cualquier referencia a `Sobre mi` que pertenezca a formularios, detalle de usuario u otra UI no-sidebar

## 4) Arquitectura propuesta

`SocialSidebar` quedará como un contenedor de dos tabs navegables:

- `following`
- `followers`

El orden visible debe ser exactamente este:

- `Sigues` primero
- `Seguidores` segundo

El estado local `activeTab` iniciará en `following`.

La estructura conceptual quedará así:

```tsx
type SocialTab = 'following' | 'followers';

<TabsList className="grid ... grid-cols-2">
  <TabsTrigger value="following">Sigues (...)</TabsTrigger>
  <TabsTrigger value="followers">Seguidores (...)</TabsTrigger>
</TabsList>

<TabsContent value="following">...</TabsContent>
<TabsContent value="followers">...</TabsContent>
```

Resultado de la búsqueda global previa a implementar:

- `src/nostr-overlay/components/SocialSidebar.tsx`
- `src/nostr-overlay/components/ProfileTab.tsx`
- `src/nostr-overlay/components/ProfileTab.test.tsx`

No se detectaron más consumidores de `ProfileTab`. Por tanto, este cambio elimina `ProfileTab.tsx` y `ProfileTab.test.tsx` por completo.

## 5) Limpieza de legado

La limpieza mínima correcta incluye:

- borrar el import de `ProfileTab` desde `SocialSidebar`
- borrar props derivadas que solo existían para alimentar ese panel si dejan de ser necesarias en el componente
- borrar el archivo `ProfileTab.tsx` si queda huérfano
- borrar `ProfileTab.test.tsx` si el componente se elimina
- actualizar expectativas de `App.test.tsx` que buscaban el texto `Sobre mi`
- eliminar `profile` de `SocialTab` o de cualquier otro modelo de tabs equivalente del sidebar principal
- eliminar cualquier valor por defecto, selector o flujo derivado que todavía pueda intentar activar `profile`; si aparece alguno, debe desaparecer o normalizarse a `following`
- verificar por búsqueda global que no queden referencias del sidebar principal y sus tests a `Sobre mi` o `ProfileTab`

No se introducirán flags, ramas temporales ni compatibilidad hacia atrás para un tab que ya no existirá.

## 6) Testing

Cobertura mínima esperada:

- el sidebar expandido ya no contiene `Sobre mi`
- el sidebar expandido sigue mostrando `Sigues` y `Seguidores`
- el orden visible de tabs es `Sigues` y luego `Seguidores`
- el sidebar colapsado sigue ocultando los tabs sociales
- el logout sigue dejando la app sin el contenido del sidebar social
- no quedan tests unitarios dedicados a `ProfileTab` si el componente se elimina
- no queda `profile` en el tipo o modelo de tabs del sidebar principal
- no quedan assertions o queries del sidebar principal referenciando `Sobre mi` o `ProfileTab`
- se ejecuta `pnpm test:unit:frontend -- --run src/nostr-overlay/App.test.tsx`
- se ejecuta `pnpm typecheck:frontend`

## 7) Riesgos y mitigaciones

Riesgo principal:

- que algún test o flujo asuma que el primer tab visible es `Sobre mi`

Mitigación:

- actualizar tests para usar `Sigues` como estado inicial visible
- validar con la suite de tests del overlay social afectada por el cambio

## 8) Implementación prevista

Archivos previstos:

- `src/nostr-overlay/components/SocialSidebar.tsx`
- `src/nostr-overlay/App.test.tsx`
- `src/nostr-overlay/components/ProfileTab.tsx` (eliminación)
- `src/nostr-overlay/components/ProfileTab.test.tsx` (eliminación)
