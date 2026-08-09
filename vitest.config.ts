import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest corre FUERA de Next.js, asi que nadie carga .env.local por nosotros.
// process.loadEnvFile existe en Node 22+ y es la unica forma de cargar el entorno
// una sola vez, en el archivo de config, sin depender de que cada comando lo recuerde.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No hay .env.local (por ejemplo en CI, donde las variables vienen del runner).
  // No es un error: tests/setup.ts valida que las variables necesarias existan.
}

export default defineConfig({
  resolve: {
    // El alias @/ no lo hereda el runner desde tsconfig.json: hay que escribirlo aca.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // blueprints/ es el bundle de diseno que vive dentro del proyecto: si no se excluye,
    // vitest intenta coleccionar los archivos de blueprints/*/workspace/.
    exclude: [
      "node_modules/**",
      ".next/**",
      "blueprints/**",
      "tests/e2e/**",
      "playwright-report/**",
      "test-results/**",
    ],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Los tests de integracion comparten una unica base remota compartida.
    // Sin esto se pisan entre archivos y el resultado depende del orden.
    fileParallelism: false,
    reporters: ["default"],
  },
});
