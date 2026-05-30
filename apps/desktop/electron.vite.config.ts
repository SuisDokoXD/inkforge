import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const workspaceExcludes = [
  "@inkforge/shared",
  "@inkforge/llm-core",
  "@inkforge/storage",
  "@inkforge/editor",
  "@inkforge/research-core",
  "@inkforge/review-engine",
  "@inkforge/skill-engine",
  "@inkforge/tavern-engine",
  "@inkforge/auto-writer-engine",
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceExcludes })],
    build: {
      outDir: "out/main",
      sourcemap: false,
      minify: true,
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
    resolve: {
      alias: {
        "@inkforge/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
        "@inkforge/llm-core": resolve(__dirname, "../../packages/llm-core/src/index.ts"),
        "@inkforge/storage": resolve(__dirname, "../../packages/storage/src/index.ts"),
        "@inkforge/research-core": resolve(__dirname, "../../packages/research-core/src/index.ts"),
        "@inkforge/review-engine": resolve(__dirname, "../../packages/review-engine/src/index.ts"),
        "@inkforge/skill-engine": resolve(__dirname, "../../packages/skill-engine/src/index.ts"),
        "@inkforge/tavern-engine": resolve(__dirname, "../../packages/tavern-engine/src/index.ts"),
        "@inkforge/auto-writer-engine": resolve(
          __dirname,
          "../../packages/auto-writer-engine/src/index.ts",
        ),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspaceExcludes })],
    build: {
      outDir: "out/preload",
      sourcemap: false,
      minify: true,
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
      },
    },
    resolve: {
      alias: {
        "@inkforge/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@inkforge/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
        "@inkforge/editor": resolve(__dirname, "../../packages/editor/src/index.ts"),
        // skill-engine 的模板渲染器在渲染进程里被 SkillPage 用于本地预览；
        // 指向 src（ESM/TS）以便 rollup 能静态分析具名导出（dist 是 CJS export *，无法被追踪）。
        "@inkforge/skill-engine": resolve(__dirname, "../../packages/skill-engine/src/index.ts"),
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    css: {
      postcss: resolve(__dirname, "src/renderer/postcss.config.cjs"),
    },
    build: {
      outDir: "out/renderer",
      sourcemap: false,
      minify: true,
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
