import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// CORS / Private Network Access (PNA) headers — Chrome ≥124 enforces
// PNA on cross-origin fetches between loopback / private IPs. Shell
// (http://localhost:5173) loads this plugin via ESM import from
// http://localhost:5176/src/main.tsx, which counts as a private-
// network request that needs explicit opt-in. Without these headers
// the user sees "Failed to load Facebook Content Module: dev load
// failed for facebook-content" in the shell and the plugin never
// registers. Same trick applies to any plugin whose devPort sits on
// a different loopback port than the shell.
const pnaHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Private-Network': 'true',
};

export default defineConfig(({ command, mode }) => ({
  server: {
    port: 5176,
    strictPort: true,
    cors: true,
    headers: pnaHeaders,
  },
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      formats: ["iife"],
      entry: "src/main.tsx",
      name: "MdpPluginFacebookContent",
      fileName: () => "facebookContent.iife.js",
    },
    rollupOptions: {
      external: [],
      output: {
        banner: 'var process=process||{env:{NODE_ENV:"production"}};',
      },
    },
    // Watch only when explicitly running the dev script (vite build --watch).
    // A static watch object here forces `vite build` to never exit, which
    // hangs CI/manual builds and ships a stale bundle.
    watch: command === 'build' && mode === 'development'
      ? { buildDelay: 300, exclude: ['node_modules/**'] }
      : null,
  },
}));
