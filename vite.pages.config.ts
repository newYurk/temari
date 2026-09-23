import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runtimeModelSource } from "./scripts/lib/stitch-diagram-data.ts";

export default defineConfig(({ command }) => ({
  define: {
    __UPPER_BUNDLE_SOURCE__: JSON.stringify({
      mode: command === "build" ? "build" : "development-startup",
      model: runtimeModelSource(fileURLToPath(new URL(".", import.meta.url)), "src/components/temari/upper-bundle.ts", "src/components/temari/upper-bundle.worker.ts"),
      renderer: runtimeModelSource(fileURLToPath(new URL(".", import.meta.url)), "src/components/temari/UpperBundleControl.tsx"),
      dependencies: createHash("sha256").update(readFileSync(new URL("./package-lock.json", import.meta.url))).digest("hex"),
    }),
    __UPPER_SOURCE__: JSON.stringify({
      mode: command === "build" ? "build" : "development-startup",
      model: runtimeModelSource(fileURLToPath(new URL(".", import.meta.url)), "src/components/temari/upper-kiku.ts"),
      renderer: runtimeModelSource(fileURLToPath(new URL(".", import.meta.url)), "src/components/temari/thread-path-mesh.ts"),
      dependencies: createHash("sha256").update(readFileSync(new URL("./package-lock.json", import.meta.url))).digest("hex"),
    }),
  },
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
}));
