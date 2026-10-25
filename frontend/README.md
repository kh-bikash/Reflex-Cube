# Reflex Cube — Web Client

React + TypeScript + Vite single-page app for the Reflex Cube platform. It hosts the
prompt-to-model studio, the live training monitor and the Intelligence Cube consoles.

See the [root README](../README.md) for the full-stack picture and
[docs/architecture.md](../docs/architecture.md) for how the pieces fit together.

## Quick start

```bash
npm install
cp .env.example .env     # optional; the defaults work for local development
npm run dev
```

The dev server listens on <http://localhost:8080> and proxies `/api/*` to
`http://localhost:8000`, so start the backend too (see
[`backend/README.md`](../backend/README.md)).

## Scripts

| Script              | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR and the `/api` proxy.                 |
| `npm run build`     | Typecheck (`tsc -b`) then emit a production bundle to `dist/`. |
| `npm run preview`   | Serve the built `dist/` locally.                                |
| `npm run typecheck` | Project-wide TypeScript check, no emit.                        |
| `npm run lint`      | ESLint over the whole project.                                 |
| `npm run lint:fix`  | ESLint with autofix.                                            |

## Layout

```text
src/
├── components/
│   ├── cubes/      # One console per Intelligence Cube
│   ├── canvas/     # react-three-fiber scenes
│   ├── ui/         # shadcn/ui primitives (Radix based)
│   └── visuals/    # Charts and gallery widgets
├── pages/          # Route targets
├── lib/
│   ├── api.ts      # Typed fetch wrappers for the backend
│   └── cubes.ts    # Cube catalog — ids, metadata, lazy-loaded consoles
└── hooks/
```

### Adding a cube console

`src/lib/cubes.ts` is the single source of truth for the catalog. Add an entry whose
`id` matches the id registered in `backend/app/cubes/registry.py`, point `console` at a
lazy import of your component, and the `/cube/:id` route and hub listings pick it up
automatically. Consoles are code-split, so each one only loads when visited.

## Conventions

- Styling is Tailwind CSS with the design tokens defined in `src/index.css`; prefer the
  semantic tokens (`bg-background`, `text-muted-foreground`) over raw colours.
- `@/` resolves to `src/`.
- Backend calls go through `src/lib/api.ts` rather than bare `fetch`, so the base URL and
  error handling stay in one place.
