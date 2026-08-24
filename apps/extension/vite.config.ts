import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), { name: "copy-manifest", closeBundle() { cpSync(resolve(rootDir,"manifest.json"), resolve(rootDir,"dist/manifest.json")); } }],
  resolve: { alias: { "@faultlab/core": resolve(rootDir,"../../packages/core/src") } },
  build: { outDir:"dist", emptyOutDir:true, rollupOptions:{ input:{ sidepanel:resolve(rootDir,"sidepanel.html"), background:resolve(rootDir,"src/background.ts") }, output:{ entryFileNames:c=>c.name==="background"?"background.js":"assets/[name]-[hash].js", chunkFileNames:"assets/[name]-[hash].js", assetFileNames:"assets/[name]-[hash][extname]" } } }
});
