# mdp-module-facebook

@../ai-workspace/claude/CLAUDE.md

## Module-specific context

- Platform: **facebook**
- Backend: `backend/` — Go + Gin, owns `facebook` Postgres schema
- Plugin: `plugin/` — Vite IIFE bundle, React, imports `@mdp-private/kit-{ui,ipc}`
- Contracts: `contracts/` — OpenAPI spec + Zod schemas
- Manifest: `manifest.json` — Electron plugin contract

### Running locally
```bash
mdp run module --name facebook   # start backend + deps via docker-compose
cd plugin && pnpm dev              # start plugin dev server
```

### Backend — first-time setup

The backend uses **pgx/v5 + sqlc** and ships with a hand-written `db/` stub package so
`go build` works before `sqlc` is installed. The first time you touch the backend on a
new machine:

```bash
cd backend
make db-up                # docker compose up -d postgres (port 5433)
go mod tidy               # download go modules
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
make sqlc                 # regenerate the db/ package from queries/*.sql
go mod tidy               # pick up the new module deps sqlc needs
```

After that, the dev loop is:
```bash
make migrate-up           # apply pending SQL migrations
make run                  # go run ./cmd/server (port 8081)
make test                 # go test ./... (uses testcontainers, needs Docker)
```

### Sidecar (Node.js Playwright micro-service)

The Go backend depends on a Node.js Express + Playwright sidecar that lives at
`mdp-module-facebook/sidecar/`. It listens on `http://localhost:9001` (env
`SIDECAR_PORT`) and is what actually drives the visible Chrome browser for
account login, group posting, and Kling AI generation.

**Auto-start:** `cmd/server` checks `GET /health` on `SIDECAR_URL` at boot. If
nothing is listening and `SIDECAR_AUTOSTART=true` (default), it spawns
`node <repo>/mdp-module-facebook/sidecar/src/index.js` as a tracked child
process and waits for `/health` to come up (timeout `SIDECAR_START_TIMEOUT`,
default 5s). The child is killed automatically when the backend shuts down.
**You should not need to start the sidecar by hand.**

To run the sidecar manually (e.g. for a Playwright-only debug session):
```bash
cd mdp-module-facebook/sidecar
pnpm install              # first time only
pnpm dev                  # listens on :9001 by default
```

To disable auto-start (production / k8s / docker-compose where the sidecar
is a separate process):
```bash
SIDECAR_AUTOSTART=false ./bin/server
```

The `CreateAccount` HTTP handler is **atomic**: if the sidecar rejects the
login-start request, the backend rolls back the just-inserted row and
returns `502 Bad Gateway` — the user never sees a phantom account in the
list.

### Build
```bash
cd plugin && pnpm build            # produces plugin/dist/facebook.iife.js
```

### Architecture quick map
```
backend/
  cmd/server/main.go       # entry point — config → migrate → pool → worker → http
  cmd/migrate/main.go      # CLI: go run ./cmd/migrate up|down|version
  internal/api/            # HTTP layer: router, middleware, handlers
  internal/service/        # business logic; orchestrates repos + graph client
  internal/repo/           # data access; sqlc impls behind interfaces
  internal/db/             # pool + golang-migrate runner + SQL migrations
  db/                      # sqlc-generated (or hand-written stub before `make sqlc`)
  internal/models/         # domain types, JSON-serializable
  internal/fb/             # Facebook Graph API client
  internal/config/         # env-driven config loader
  internal/telemetry/      # slog JSON logger
  testutil/                # testcontainers helper
```

### Plugin dev notes
- Plugin is a **Vite IIFE bundle** loaded by Tauri shell via `http://asset.localhost`.
- Shell expects plugin to call `window.mdp.register({ mount, unmount })`. If the call is missing, the shell shows "plugin did not call window.mdp.register".
- The shell copies built plugin files from `plugin/dist/` into `mdp-shell/plugins/facebook/` at runtime. **After rebuilding the plugin, copy `dist/*` to that directory.**
- `process.env.NODE_ENV` is not defined in Tauri webview. The plugin injects a polyfill in `main.tsx`:
  ```tsx
  if (typeof window !== 'undefined' && !(window as any).process) {
    (window as any).process = { env: { NODE_ENV: 'production' } };
  }
  ```
  And `vite.config.ts` defines it at build time:
  ```ts
  define: { 'process.env.NODE_ENV': JSON.stringify('production') }
  ```
- CSS class `.fb-tab` is shared between tab **buttons** and tab **panels** (both use it). Panel layout overrides use `div.fb-tab[class*="fb-tab--"]` with `!important` to avoid specificity conflicts.

### Checklist before PR
- [ ] `cd plugin && pnpm typecheck` passes
- [ ] `cd plugin && pnpm build` passes (IIFE bundle)
- [ ] `cd backend && go vet ./...` passes
- [ ] `cd backend && go test ./...` passes (skips when Docker absent)
- [ ] `manifest.json` version matches `plugin/package.json` version
- [ ] No new `EAA...` (Meta token) strings committed — pre-commit hook will block
- [ ] `appSecret` never appears in `GET /config` response (test asserts this)
- [ ] After plugin build, verify `mdp-shell/plugins/facebook/` is updated

