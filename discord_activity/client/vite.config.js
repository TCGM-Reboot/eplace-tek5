import { defineConfig } from "vite"

export default defineConfig({
  root: ".",
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", ".discordsays.com"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true
      }
    }
  }
})
