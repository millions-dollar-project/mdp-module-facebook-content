# mdp-module-facebook

Facebook module for the Millions Dollar Project shell. Provides a Go/Gin backend stub that mirrors the Facebook Graph API surface, plus a Vite/React plugin (IIFE bundle) that the mdp-shell loads at runtime.

## Layout

```
mdp-module-facebook/
  plugin/        Vite IIFE bundle (React + TS)
  backend/       Go + Gin service
  manifest.json  Shell plugin manifest
```

## Backend

```bash
cd backend
go mod tidy
go run .            # serves on :8080
```

Endpoints:

- `GET  /health`
- `GET  /api/v1/facebook/me`
- `POST /api/v1/facebook/publish`
- `GET  /api/v1/facebook/posts`

## Plugin

```bash
cd plugin
pnpm install
pnpm build          # emits plugin/dist/facebook.iife.js
```

The shell loads `plugin/dist/facebook.iife.js` per `manifest.json`.

## Platform docs

- Facebook Graph API: https://developers.facebook.com/docs/graph-api
