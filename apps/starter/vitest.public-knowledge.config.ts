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
      "apps/starter/settings-panel-ui.test.ts",
      "apps/starter/source-progress-ui.test.ts",
      "apps/starter/recent-posts-ui.test.ts",
      "apps/starter/shared-cloud-evidence.test.ts",
      "apps/starter/task-runtime-picker.test.ts",
      "apps/starter/cloud-save-capture-ui.test.ts",
      "apps/starter/capture-runtime-ui.test.ts",
      "apps/starter/private-library-upgrade-ui.test.ts",
      "apps/starter/work-cloud-text-ui.test.ts",
      "apps/starter/assistant-connections-cloud-ui.test.ts",
      "apps/starter/work-cloud-parent-ui.test.ts",
      "apps/starter/public-knowledge-web.test.ts",
      "apps/starter/source-acquisition-ui.test.ts",
      "apps/starter/integration-controls.test.ts",
      "apps/starter/demo-renderer.test.ts",
    ],
    environment: "node",
  },
});
