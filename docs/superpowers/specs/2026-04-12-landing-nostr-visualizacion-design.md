# Landing Nostr Visualizacion Design

## Context

El proyecto necesita una landing en espanol para explicar rapidamente de que va MapGenerator/Nostr City y dirigir a la app. El enfoque no es comercial: es un proyecto personal, open source, sin animo de lucro, y una forma alternativa de visualizar Nostr.

La app actual vive en `index.html` y monta mapa + overlay Nostr. Para soportar landing + app en el mismo repo sin complejidad extra, se separan rutas de entrada:

- `/` para landing
- `/app/` para la aplicacion

## Goals

- Mostrar valor del proyecto en menos de un scroll: que es, como funciona y que lo hace distinto.
- Mantener CTA claro y consistente: `Entrar a la aplicacion`.
- Incluir una seccion dedicada a personas que ya usan Nostr.
- Mantener deploy simple dentro del mismo repositorio.

## Non-Goals

- No construir un funnel comercial ni copy de venta agresivo.
- No crear backend nuevo para la landing.
- No separar a un segundo repositorio.

## Audience

1. Usuarios nuevos que no conocen el proyecto.
2. Usuarios Nostr nativos que quieren contexto tecnico y diferenciacion.

## Product Messaging Decisions

- Mensaje principal: "Una nueva forma de visualizar Nostr como una ciudad generativa viva".
- Posicionamiento: complemento visual, no reemplazo de clientes timeline-first.
- Tono: honesto, tecnico y accesible; cero hype comercial.

## UX Structure

Orden de secciones de landing:

1. Hero-manifiesto (titulo, subtitulo, CTA primario + secundario)
2. Que es (bloque para usuarios nuevos)
3. Como funciona en 3 pasos
4. Features clave por categoria
5. Seccion dedicada "Para quienes ya usan Nostr"
6. Filosofia del proyecto (personal/open source/sin animo de lucro)
7. Cierre con CTA final

## Technical Direction

- Monorepo simple (mismo repo) con separacion por entry points en Vite multipage.
- `index.html` pasa a ser landing.
- `app/index.html` aloja el shell actual del mapa.
- CTA de landing apunta a `/app/` por defecto, configurable con env (`VITE_LANDING_APP_URL`) para futura migracion a `app.<dominio>`.

## Visual Direction

- Lenguaje visual editorial/cartografico: atmosfera de atlas vivo.
- Diseño claro con jerarquia fuerte y bloques legibles.
- Evitar look SaaS generico y palettes moradas tipicas.
- Responsive real en mobile y desktop.

## Validation Criteria

- Existe landing funcional en `/` con secciones acordadas y CTA visible.
- Existe seccion explicita para usuarios Nostr nativos.
- La app actual carga en `/app/` sin regresiones de smoke tests.
- Documentacion actualizada para rutas y despliegue.
