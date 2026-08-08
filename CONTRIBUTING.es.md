# Contribuir

Hermes Subpolar es una aplicacion web TypeScript que usa Bun exclusivamente.
Las contribuciones deben conservar este limite: un proceso de API Bun, una
conexion de proveedor compatible con OpenAI, limites nativos para herramientas
en el servidor y estado en SQLite.

## Configuracion

Instala Bun 1.3.x y ejecuta:

```bash
bun install
bun run serve
```

Usa `bun run dev` durante el desarrollo. La interfaz esta en
`packages/web-ui`; el servidor API esta en `packages/api-gateway`.

## Comprobaciones

```bash
bun run check:monorepo
bun run typecheck:runtime
bun test
bun run build:web
bun run test:e2e:browser
```

Los cambios de API, persistencia, configuracion o seguridad necesitan pruebas
centradas en el comportamiento. Usa un directorio de datos temporal y aislado
para las pruebas que escriban en SQLite.

## Limites de ejecucion

- `api-gateway` es propietario de HTTP, WebSocket, autenticacion, archivos
  estaticos y composicion de la API.
- `harness` es propietario del ciclo de vida de los turnos, cancelacion,
  presupuestos y resultados terminales.
- `chat-provider-interface` define el limite compatible con OpenAI.
- `tool-resolver` valida descriptores y aplica una politica denegada por
  defecto; no ejecuta herramientas.
- `tool-runtime` ejecuta manejadores TypeScript nativos construidos de forma
  explicita.
- `data-layer` es propietario de los repositorios SQLite versionados.

Las credenciales, herramientas, aprobaciones y persistencia permanecen en el
servidor. El navegador solo consume operaciones admitidas por la API.

## Pull requests

Describe el cambio de comportamiento, el limite de paquete afectado y los
comandos ejecutados. Los cambios de API deben actualizar su contrato. Las
nuevas herramientas necesitan pruebas de esquema, politica, cancelacion,
tiempo limite, limite de salida y errores.
