import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fixtureApiPlugin } from "./test/fixture-api.ts";

export default defineConfig(async ({ command }) => ({
  server: { host: true },
  plugins: [
    react(),
    ...(command === "serve" ? [await fixtureApiPlugin()] : []),
  ],
}));
