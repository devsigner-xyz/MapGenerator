
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-4-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

<br />
<p align="center">
  <a href="https://github.com/probabletrain/mapgenerator">
      <img src="docs/images/logo.png" alt="Logo" width="125" height="125">
  </a>

  <h3 align="center">Map Generator</h3>

  <p align="center">
    Create procedural American-style cities
    <br />
    <a href="https://probabletrain.itch.io/city-generator"><strong>Open Generator »</strong></a>
    <br />
    <br />
    <a href="https://maps.probabletrain.com/docs/" target="_blank">Read the Docs</a>
    ·
    <a href="https://github.com/probabletrain/mapgenerator/issues">Report Bug</a>
    ·
    <a href="https://github.com/probabletrain/mapgenerator/issues">Request Feature</a>
  </p>
</p>


## Table of Contents

* [About the Project](#about-the-project)
  * [Built With](#built-with)
* [Getting Started](#getting-started)
  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
* [Usage](#usage)
* [Roadmap](#roadmap)
* [Contributing](#contributing)
* [License](#license)
* [Contact](#contact)



## About The Project

![Map Generator Screen Shot](docs/images/screenshot.png)
<!-- TODO YT video -->

This tool procedurally generates images of city maps. The process can be automated, or controlled at each stage give you finer control over the output.
3D models of generated cities can be downloaded as a `.stl`. The download is a `zip` containing multiple `.stl` files for different components of the map.
Images of generated cities can be downloaded as a `.png` or an `.svg`. There are a few choices for drawing style, ranging from colour themes similar to Google or Apple maps, to a hand-drawn sketch.


### Built With

* [Typescript](https://www.typescriptlang.org/)
* [Vite](https://vite.dev/)
* [pnpm](https://pnpm.io/)


## Getting Started

To get a local copy up and running follow these steps.

### Prerequisites

* Node.js 20+
```sh
node --version
```

* pnpm
```
corepack enable
corepack use pnpm@10.29.3
```

### Installation
 
1. Clone the mapgenerator
```sh
git clone https://github.com/probabletrain/mapgenerator.git
```
2. Install dependencies
```sh
cd mapgenerator
pnpm install
```
3. Start the full local development stack
```
make dev
```

This starts:

- BFF: `http://127.0.0.1:3000/v1/health`
- Landing + app dev server: `http://127.0.0.1:5173/`
- VitePress docs dev server: `http://127.0.0.1:5174/`

4. Alternative manual startup
```
pnpm bff:dev
pnpm dev
pnpm docs:dev
```
5. Build production bundle
```
pnpm build
```
6. Preview production bundle
```
pnpm preview
```



## Usage

See the [documentation](https://maps.probabletrain.com/docs/).

### Local development (frontend + BFF + docs)

The Nostr overlay now uses a Fastify Backend-for-Frontend (BFF) for social feed,
notifications, DM read/stream, user search, and signed publish forwarding.

Architecture notes for the backend-first migration are available in
`docs/portfolio-backend-first.md`.

For local development, the easiest option is:

- `make dev`

If you prefer to run each service manually, use three terminals:

- Terminal 1: `pnpm bff:dev`
- Terminal 2: `pnpm dev`
- Terminal 3: `pnpm docs:dev`

If a previous dev session left orphan processes behind and ports stay busy, run:

- `make dev-stop`

In development, Vite proxies `/v1/*` requests to `http://127.0.0.1:3000`.

If you only run `pnpm dev`, some overlay surfaces (for example Agora) can fail with
`Not found` because `/v1/*` endpoints are served by the BFF.

### BFF health check

Verify the BFF is up:

```sh
curl http://127.0.0.1:3000/v1/health
```

Expected response:

```json
{"status":"ok"}
```

### Troubleshooting

#### `tsx: not found` when running `pnpm bff:dev`

This usually means dev dependencies were not installed.

```sh
pnpm install
pnpm exec tsx --version
```

### BFF environment variables

- `PORT` (default: `3000`)
- `HOST` (default: `127.0.0.1`)
- `BFF_CORS_ORIGINS` (comma-separated allowed origins)
- `FASTIFY_TRUST_PROXY` (default: `loopback`; supports `true`, `false`, or comma-separated trusted proxies)

### Routes

- `/` -> landing page (project overview + feature highlights)
- `/app/` -> map application

The documentation is served by a separate VitePress dev server on
`http://127.0.0.1:5174/`.

### Public app URL override

Landing and docs point to `/app/` by default. For deployments that use a separate app host
(for example `https://app.example.com`), set:

```sh
VITE_APP_URL=https://app.example.com
```

When not set, the fallback remains `/app/`.

### Public docs URL override

The landing points to `/docs/` by default.

For local development, `pnpm dev` already injects the correct docs URL so the CTA
opens the VitePress dev server at `http://127.0.0.1:5174/docs/`.

If you ever deploy docs on a different host, set:

```sh
VITE_DOCS_URL=https://docs.example.com
```

### Nostr cache policy (time-to-value)

The Nostr overlay uses in-memory TTL cache to improve perceived loading speed when submitting an `npub`.

- follows graph: 60s TTL
- followers discovery: 2m TTL
- profile metadata: 5m TTL

This cache is process-local and non-persistent by design for this phase.

### Nostr overlay settings and profile modal

- Relay settings are available inside the overlay settings modal (`Settings -> Relays`).
- You can add multiple relays at once (one URL per line); values are normalized and deduplicated.
- Relay settings are persisted in browser localStorage under `nostr.overlay.relays.v1`.
- Occupant profile modal now includes recent posts plus followers/following counters.
- Recent posts are loaded incrementally (initial batch + on-demand load more).




## Roadmap

See the [open issues](https://github.com/probabletrain/mapgenerator/issues) for a list of proposed features (and known issues).




## Contributing

Contributions are what make the open source community such an amazing place to be learn, inspire, and create. Any contributions you make are **greatly appreciated**. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/trees-and-airlines"><img src="https://avatars3.githubusercontent.com/u/63573826?v=4" width="100px;" alt=""/><br /><sub><b>trees-and-airlines</b></sub></a><br /><a href="#infra-trees-and-airlines" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
    <td align="center"><a href="https://github.com/ProbableTrain"><img src="https://avatars2.githubusercontent.com/u/33726340?v=4" width="100px;" alt=""/><br /><sub><b>Keir</b></sub></a><br /><a href="https://github.com/ProbableTrain/MapGenerator/commits?author=ProbableTrain" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/ersagunkuruca"><img src="https://avatars3.githubusercontent.com/u/8115002?v=4" width="100px;" alt=""/><br /><sub><b>Ersagun Kuruca</b></sub></a><br /><a href="https://github.com/ProbableTrain/MapGenerator/commits?author=ersagunkuruca" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/Jason-Patrick"><img src="https://avatars3.githubusercontent.com/u/65310110?v=4" width="100px;" alt=""/><br /><sub><b>Jason-Patrick</b></sub></a><br /><a href="https://github.com/ProbableTrain/MapGenerator/commits?author=Jason-Patrick" title="Code">💻</a></td>
  </tr>
</table>

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!


## Contact

Keir - [@probabletrain](https://twitter.com/probabletrain) - probabletrain@gmail.com

Project Link: [https://github.com/probabletrain/mapgenerator](https://github.com/probabletrain/mapgenerator)



## License

Distributed under the LGPL-3.0 License. See `COPYING` and `COPYING.LESSER` for more information.

If you redistribute a modified version of this project, keep copyright and license notices intact and make the corresponding source available under LGPL-3.0 terms.
