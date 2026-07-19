import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative root/outDir only. The dashboard ships fully static — the committed
// snapshot is baked in at build time (src/data/*.json), so there is no dev API
// proxy. An optional live /api/stacks/dashboard is fetched at runtime same-origin
// (see src/api/data.ts) and simply no-ops on a static host.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
