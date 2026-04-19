import { resolvePublicAppUrl } from '@/site/app-url';
import { resolvePublicDocsUrl } from '@/site/docs-url';

function scrollToSection(sectionId: string): void {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function LandingPage() {
  const appUrl = resolvePublicAppUrl();
  const docsUrl = resolvePublicDocsUrl();

  return (
    <div className="landing-shell">
      <header className="topbar">
        <p className="brand">Nostr City</p>

        <nav className="topbar-links" aria-label="Enlaces principales">
          <a href={docsUrl}>Documentacion</a>
          <a href="https://github.com/ProbableTrain/MapGenerator" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button type="button" onClick={() => scrollToSection('features')}>
            Features
          </button>
          <a className="app-link" href={appUrl}>Entrar a la aplicacion</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="hero">
          <p className="kicker">Proyecto personal + open source</p>
          <h1>Nostr City, una nueva forma de visualizar Nostr</h1>
          <p>
            No es un producto comercial: es un experimento abierto para mirar la red como geografia social.
            Conecta identidad, relaciones y actividad en una ciudad generativa que puedes explorar en tiempo real.
          </p>

          <div className="hero-actions">
            <a className="app-link" href={appUrl}>Entrar a la aplicacion</a>
            <button type="button" onClick={() => scrollToSection('como-funciona')}>
              Ver como funciona
            </button>
          </div>

          <div className="hero-grid">
            <article>
              <h3>Visualizacion espacial</h3>
              <p>La red deja de ser una lista y pasa a ser territorio navegable.</p>
            </article>
            <article>
              <h3>Contexto social</h3>
              <p>Perfiles, conexiones y actividad se entienden de un vistazo.</p>
            </article>
            <article>
              <h3>Laboratorio abierto</h3>
              <p>Proyecto en evolucion continua, sin animo de lucro y con codigo publico.</p>
            </article>
          </div>
        </section>

        <section className="content" id="que-es">
          <h2>Que es Nostr City</h2>
          <p>
            Nostr City traduce senales del protocolo a una experiencia cartografica. En lugar de leer solo timelines,
            exploras un mapa donde la presencia, la cercania social y el movimiento generan otra lectura de Nostr.
          </p>
        </section>

        <section className="content" id="como-funciona">
          <h2>Como funciona</h2>
          <div className="steps">
            <article className="card">
              <h3>1. Conecta tu identidad</h3>
              <p>Inicias con npub o metodos de sesion compatibles y defines tu punto de partida.</p>
            </article>
            <article className="card">
              <h3>2. Se construye la ciudad</h3>
              <p>El generador proyecta estructuras urbanas y distribuye presencia social sobre el mapa.</p>
            </article>
            <article className="card">
              <h3>3. Exploras otra geometria</h3>
              <p>Recorres perfiles, feed social, estadisticas y capas visuales desde una vista diferente.</p>
            </article>
          </div>
        </section>

        <section className="content" id="features">
          <h2>Features clave</h2>
          <div className="features">
            <article className="card">
              <h3>Ciudad generativa y estilos</h3>
              <p>Mapas procedurales, zoom, camara, capas de lectura y ajustes visuales.</p>
            </article>
            <article className="card">
              <h3>Overlay social Nostr</h3>
              <p>Perfiles, seguidos, seguidores, feed y navegacion contextual sobre edificios.</p>
            </article>
            <article className="card">
              <h3>Control de relays</h3>
              <p>Gestion de relays, metadata y parametros para adaptar la experiencia.</p>
            </article>
            <article className="card">
              <h3>Exportacion y experimentacion</h3>
              <p>Descargas de salida grafica o 3D para seguir iterando fuera de la app.</p>
            </article>
          </div>
        </section>

        <section className="content nostr-native" id="nostr-native">
          <h2>Para quienes ya usan Nostr</h2>
          <p>
            Esta interfaz no compite con tus clientes timeline-first. Propone otra capa: leer Nostr como una topologia
            social, no solo como stream temporal. Si ya entiendes relays, identidad y follows, aqui ves la red desde otra
            geometria.
          </p>

          <div className="features">
            <article className="card">
              <h3>No reemplaza tu stack actual</h3>
              <p>Funciona como vista complementaria para descubrir patrones que un timeline no muestra facil.</p>
            </article>
            <article className="card">
              <h3>Enfoque protocol-first</h3>
              <p>La narrativa prioriza interoperabilidad y lectura del ecosistema, no lock-in de producto.</p>
            </article>
          </div>
        </section>

        <section className="content" id="filosofia">
          <h2>Filosofia del proyecto</h2>
          <p>
            Nostr City es un proyecto personal, sin animo de lucro. Es una exploracion abierta para probar interfaces nuevas
            sobre Nostr y compartir hallazgos con la comunidad.
          </p>

          <p className="manifest">
            Si buscas una forma diferente de observar Nostr, este mapa esta hecho para explorar, no para vender.
          </p>

          <div className="footer-cta">
            <a className="app-link" href={appUrl}>Entrar a la aplicacion</a>
            <a href="https://github.com/ProbableTrain/MapGenerator" target="_blank" rel="noreferrer">
              Ver repositorio
            </a>
            <a href={docsUrl}>Leer documentacion</a>
          </div>
        </section>
      </main>
    </div>
  );
}
