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
    server: { deps: { inline: ["@workos-inc/authkit-nextjs"] } },
    include: [
      "apps/starter/auth-redirect.test.ts",
      "apps/starter/high-risk-auth-redirect.test.ts",
      "apps/starter/billing-actions.test.ts",
      "apps/starter/product-errors.test.ts",
      "apps/starter/shared-refresh.test.ts",
      "apps/starter/public-moderation-auth.test.ts",
    ],
    environment: "node",
  },
});
