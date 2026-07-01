import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => ({
  server: {
    port: 5176,
    strictPort: true,
    cors: true,
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
