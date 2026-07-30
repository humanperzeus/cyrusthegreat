import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { componentTagger } from "lovable-tagger";

// App version from package.json — surfaced in the BuildBadge so the live
// version number is readable at a glance (not just the git SHA).
const appVersion = (() => {
  try {
    return JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// Resolve the build SHA + timestamp ONCE per build. Cloudflare's deploy
// runner has the repo checked out, so git rev-parse works there too —
// the live SHA matches the commit Cloudflare was triggered on.
const buildSha = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
})();
const buildTime = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
}));
