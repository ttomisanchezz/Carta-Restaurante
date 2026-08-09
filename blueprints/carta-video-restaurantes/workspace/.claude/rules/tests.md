---
description: Convenciones de tests unitarios, de integracion y e2e
paths:
  - "tests/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# Tests

## Reparto de capas

| Carpeta | Runner | Cubre |
|---|---|---|
| `tests/unit/` | vitest | logica pura: formato de precio, validacion de color, armado de URLs, firma |
| `tests/integration/` | vitest | el proyecto Supabase enlazado: esquema, policies de RLS, aislamiento, Server Actions |
| `tests/e2e/` | playwright | recorridos de navegador: carta publica, plato, panel, accesibilidad |
| `tests/helpers/` | — | fabricas y clientes; no contiene tests |

- **La base es real, nunca simulada.** Un test que se burla de la base afirma que el mock coincide con
  el mock. La base es el proyecto enlazado; `pnpm db:push` deja el esquema al dia.
- **Ningun test importa `src/lib/supabase/server.ts`.** Ese modulo importa `next/headers` y muere
  fuera de un request. Los tests construyen clientes con `tests/helpers/supabase-clients.ts`.
- **Cada test limpia lo que crea.** Las fabricas devuelven un `cleanup()` que borra con el cliente de
  servicio en `afterAll`. Los datos de BRASA (el seed) **no se tocan**: son la demo de ventas.
- **Toda fila creada por un test lleva prefijo `__test_` en su `slug` o `email`, y toda limpieza
  filtra por ese prefijo. Ningun `delete` sin `where`.** La base es compartida con la demo BRASA.
- `tests/setup.ts` exige `TEST_DB_PROJECT_REF` igual al ref del proyecto: es lo que impide correr
  la suite contra credenciales de un cliente real.
- `fileParallelism: false` esta puesto a proposito en `vitest.config.ts`: todos los archivos comparten
  una unica base remota.
- **Nada de numeros magicos derivados del blueprint.** No afirmes "hay 4 tablas": afirmá que cada
  tabla que el esquema define existe. Una propiedad no se desactualiza cuando el esquema crece.
- **Nada de literales que produce el runtime.** Mensajes de error de Postgres, de zod o de `Intl` son
  especificos de la version. Afirmá codigos, conteos de filas y propiedades, no textos.
  `formatPrice` es la excepcion deliberada: no usa `Intl`, es puro y su salida es contrato nuestro.
- **Un comando que falla a proposito se envuelve.** `cmd; test $? -eq 1`, nunca `cmd` pelado ni un
  `!` suelto: `!` acepta cualquier fallo, incluido el error de uso.
- E2E: seleccionar por texto visible o por `data-testid`, nunca por clase de Tailwind.
- E2E: nada de `waitForTimeout`. Usar `expect(locator).toBeVisible()` y las esperas propias de
  Playwright.
- Un test intermitente es un test roto. Se pone en cuarentena el mismo dia.
