import './style.css';
import { resolveLandingAppUrl } from './app-url';

const appUrl = resolveLandingAppUrl();

for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-app-link]')) {
  link.href = appUrl;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scroll-to]')) {
  button.addEventListener('click', () => {
    const targetId = button.getAttribute('data-scroll-to');
    if (!targetId) {
      return;
    }

    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
