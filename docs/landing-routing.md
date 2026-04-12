# Landing and App Routing

This repository serves two entry points with Vite multipage:

- `/` -> landing page (`index.html`)
- `/app/` -> map app (`app/index.html`)

## Local development

- `pnpm dev` serves both routes from one dev server.
- Open `http://localhost:5173/` for landing.
- Open `http://localhost:5173/app/` for the application.

## Production build

`pnpm build` outputs both pages in `dist/`:

- `dist/index.html`
- `dist/app/index.html`

## Deploy strategy

Recommended starting point:

- Keep a single domain and route app under `/app/`.
- Keep landing on `/`.

This keeps setup simple while preserving a clear separation.

## Future subdomain migration

If you later move the app to `app.yourdomain.com`:

1. Deploy the app build to that host.
2. Set `VITE_LANDING_APP_URL=https://app.yourdomain.com` for the landing build.
3. Rebuild/redeploy landing.

No landing code changes are required because CTA links are resolved via `VITE_LANDING_APP_URL`.
