import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Formula Spy - mobile-first PWA.
// The scoring engine lives in `scoringlogic+database/` and is imported as-is.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@engine", replacement: path.resolve(__dirname, "scoringlogic+database") },
      // The engine's unknown-ingredient logger has a Node-only file-I/O module
      // that it dynamically imports off the (never-taken) Node branch in the
      // browser. Redirect it to the project's own browser stub so the bundle
      // stays Node-free. The scoring engine itself is left untouched.
      {
        find: /^(.*\/)?unknownLogStore\.(js|ts)$/,
        replacement: path.resolve(
          __dirname,
          "scoringlogic+database/tools/unknownLogStore.stub.ts"
        ),
      },
    ],
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5173,
    host: true,
  },
});
