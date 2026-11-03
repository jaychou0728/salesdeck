import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000";
const port = Number(process.env.VITE_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port, proxy: { "/api": apiTarget, "/v1": apiTarget } },
});
