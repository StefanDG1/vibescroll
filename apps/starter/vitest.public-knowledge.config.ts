import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("../../tests/server-only-empty.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "apps/starter/public-knowledge-web.test.ts",
      "apps/starter/source-acquisition-ui.test.ts",
      "apps/starter/integration-controls.test.ts",
      "apps/starter/creator-ui.test.ts",
      "apps/starter/service-catalog-ui.test.ts",
      "apps/starter/work-cloud-text-ui.test.ts",
      "apps/starter/scrollshow-prompts-ui.test.ts",
      "apps/starter/scrollshow-emphasis-ui.test.ts",
      "apps/starter/own-plan-task-ui.test.ts",
      "apps/starter/personal-source-ui.test.ts",
      "apps/starter/ordered-file-upload.test.ts",
      "apps/starter/upload-batch-route.test.ts",
      "apps/starter/demo-renderer.test.ts",
    ],
    environment: "node",
  },
});
