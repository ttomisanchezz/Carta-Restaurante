#!/usr/bin/env bash
#
# Humo HTTP sobre el artefacto CONSTRUIDO.
#
# Compilar prueba que el compilador estuvo contento. Esto prueba que el servidor
# arranca, que el binario aterrizo donde el manifiesto dice, y que las rutas
# responden lo que tienen que responder.
#
# Uso:  bash scripts/smoke-http.sh [RUTA ESTADO]...
#   bash scripts/smoke-http.sh /api/health 200 /ruta-que-no-existe 404
#
# Siempre, antes de los pares recibidos, verifica que /api/health responda 200 con
# un cuerpo que contenga "ok":true. Sale 0 si todo coincide, 1 si algo falla.

set -u

PORT="${SMOKE_PORT:-3100}"
BASE="http://127.0.0.1:${PORT}"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> arrancando el build en ${BASE}"
pnpm start -p "$PORT" > /tmp/smoke-server.log 2>&1 &
SERVER_PID=$!

# Esperar a que atienda. 60 intentos de 1s: un arranque en frio en Windows tarda.
listo=0
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/health" 2>/dev/null || echo 000)" = "200" ]; then
    listo=1
    break
  fi
  sleep 1
done

if [ "$listo" -ne 1 ]; then
  echo "FALLO: el servidor no atendio en 60s. Ultimas lineas del log:"
  tail -20 /tmp/smoke-server.log
  exit 1
fi

fallos=0

# --- chequeo fijo: el cuerpo del health ---
cuerpo=$(curl -s "${BASE}/api/health")
case "$cuerpo" in
  *'"ok":true'*) echo "  OK  /api/health devuelve \"ok\":true" ;;
  *)
    echo "  FALLO  /api/health no contiene \"ok\":true — devolvio: ${cuerpo}"
    fallos=$((fallos + 1))
    ;;
esac

# --- pares RUTA ESTADO recibidos por argumento ---
while [ "$#" -gt 0 ]; do
  ruta="$1"
  esperado="${2:-}"
  if [ -z "$esperado" ]; then
    echo "  FALLO  '${ruta}' no tiene estado esperado: los argumentos van de a pares RUTA ESTADO"
    fallos=$((fallos + 1))
    break
  fi
  shift 2

  obtenido=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${ruta}" 2>/dev/null || echo 000)
  if [ "$obtenido" = "$esperado" ]; then
    echo "  OK  ${ruta} -> ${obtenido}"
  else
    echo "  FALLO  ${ruta} -> ${obtenido}, esperaba ${esperado}"
    fallos=$((fallos + 1))
  fi
done

if [ "$fallos" -gt 0 ]; then
  echo "==> ${fallos} chequeo(s) fallaron"
  exit 1
fi

echo "==> humo HTTP OK"
exit 0
