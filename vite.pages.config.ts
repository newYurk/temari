import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), viteReact()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Fixed local port so parallel Home projects never swap addresses silently.
  server: { port: 8860, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { main: "index.html", lab: "lab.html", s8ab: "s8-ab.html", passport: "passport.html" },
    },
  },
});
