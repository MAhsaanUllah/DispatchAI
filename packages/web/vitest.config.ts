import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      alias: {
        "cloudflare:workers": fileURLToPath(new URL("./test/cloudflare-workers-stub.js", import.meta.url))
      }
    }
  })
);
