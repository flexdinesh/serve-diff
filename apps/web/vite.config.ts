import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { fixtureApiPlugin } from "./test/fixture-api.ts";

export default defineConfig(async ({ command }) => ({
  server: { host: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(command === "serve" ? [await fixtureApiPlugin()] : []),
  ],
}));
