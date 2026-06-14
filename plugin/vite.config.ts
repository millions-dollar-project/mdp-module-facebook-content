import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 5176,
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
  },
});
