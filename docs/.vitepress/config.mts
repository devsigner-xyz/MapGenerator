import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'es-ES',
  title: 'Nostr City',
  description: 'Centro de ayuda de Nostr City',
  base: '/docs/',
  cleanUrls: true,
  lastUpdated: true,
  outDir: '../dist/docs',
  srcExclude: ['superpowers/**', 'migration/**', 'landing-routing.md', 'portfolio-backend-first.md'],
  themeConfig: {
    nav: [
      { text: 'Documentacion', link: '/empezar/' },
      { text: 'Aplicacion', link: '/app/' },
      { text: 'GitHub', link: 'https://github.com/ProbableTrain/MapGenerator' },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ProbableTrain/MapGenerator' },
    ],
    sidebar: [
      {
        text: 'Empezar',
        items: [
          { text: 'Inicio', link: '/' },
          { text: 'Primeros pasos', link: '/empezar/' },
          { text: 'Recorrido rapido', link: '/empezar/primeros-pasos' },
          { text: 'Exportacion y STL', link: '/empezar/exportacion-y-stl' },
        ],
      },
      {
        text: 'Conceptos basicos',
        items: [
          { text: 'Que es Nostr City', link: '/conceptos/que-es-nostr-city' },
          { text: 'Que es Nostr', link: '/conceptos/que-es-nostr' },
        ],
      },
      {
        text: 'Cuenta y acceso',
        items: [
          { text: 'Acceso y login', link: '/cuenta-y-acceso/acceso-y-login' },
          { text: 'Crear cuenta', link: '/cuenta-y-acceso/crear-cuenta' },
          { text: 'Relays y configuracion', link: '/cuenta-y-acceso/relays-y-configuracion' },
        ],
      },
      {
        text: 'Protocolo Nostr',
        items: [
          { text: 'NIPs usadas', link: '/protocolo/nips-usadas' },
          { text: 'Aplicacion en Nostr City', link: '/protocolo/aplicacion-en-nostr-city' },
        ],
      },
      {
        text: 'Ayuda',
        items: [{ text: 'Preguntas frecuentes', link: '/faq/' }],
      },
    ],
    outline: {
      level: [2, 3],
      label: 'En esta pagina',
    },
    docFooter: {
      prev: 'Pagina anterior',
      next: 'Pagina siguiente',
    },
  },
});
