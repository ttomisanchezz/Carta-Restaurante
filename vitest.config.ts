import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest corre FUERA de Next.js, asi que nadie carga .env.local por nosotros.
// process.loadEnvFile existe en Node 22+ y es la unica forma de cargar el entorno
// una sola vez, en el archivo de config, sin depender de que cada comando lo recuerde.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No hay .env.local (por ejemplo en CI, donde las variables vienen del runner).
  // No es un error: tests/setup.ts valida lo que hace falta, y solo donde hace falta.
}

const sharedExclude = [
  "node_modules/**",
  ".next/**",
  // blueprints/ es el bundle de diseno que vive dentro del proyecto: si no se excluye,
  // vitest intenta coleccionar los archivos de blueprints/*/workspace/.
  "blueprints/**",
  "tests/e2e/**",
  "playwright-report/**",
  "test-results/**",
];

export default defineConfig({
  resolve: {
    // El alias @/ no lo hereda el runner desde tsconfig.json: hay que escribirlo aca.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // DOS PROYECTOS, y la separacion es deliberada.
    //
    // `tests/setup.ts` exige las credenciales de Supabase y que TEST_DB_PROJECT_REF
    // coincida con el proyecto. Eso es correcto para los tests que escriben y borran
    // filas en una base real y compartida con la demo BRASA — y es absurdo para un
    // test unitario de un esquema zod, que no sale de la memoria.
    //
    // Con un unico proyecto, el gate del paso 1 quedaba bloqueado detras de claves que
    // §10 no exige hasta el paso 3. Verificado ejecutandolo: `pnpm test
    // tests/unit/env.test.ts` moria en setup.ts sin correr un solo test.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          globals: false,
          include: ["tests/unit/**/*.test.ts"],
          exclude: sharedExclude,
          // SIN setupFiles: logica pura, sin red y sin base.
          testTimeout: 10000,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globals: false,
          include: ["tests/integration/**/*.test.ts"],
          exclude: sharedExclude,
          setupFiles: ["./tests/setup.ts"],
          testTimeout: 30000,
          hookTimeout: 60000,
          // Todos los archivos comparten una unica base remota. Sin esto se pisan
          // entre si y el resultado depende del orden.
          fileParallelism: false,
        },
      },
    ],
    reporters: ["default"],
  },
});
