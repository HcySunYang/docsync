import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "bin/docsync.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  outDir: "dist",
  splitting: false,
  banner: {
    js: "",
  },
});
