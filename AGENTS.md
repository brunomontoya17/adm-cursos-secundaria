# Adm Cursos Secundaria — convenciones para agentes

Administrador de cursos de escritorio para **un docente** de PBA y/o CABA que quiere ordenar **los cursos donde dicta**: profesor de materia (inglés, artísticas, etc.) en **primaria y/o secundaria**, y **maestro de grado**. No es una app de director, preceptor ni secretaría: no gestiona la escuela, sino el dictado. App **local** (sin servidor remoto): React + Tauri en el frontend, **Rust + SQLite** en el backend.

## Estructura

| Ruta | Rol |
|------|-----|
| `adm-cursos-secundaria/` | App Tauri 2 + React 19 + TypeScript + Vite. Scaffold actual; dominio se construye acá. |
| `adm-cursos-secundaria/src/` | Frontend React. |
| `adm-cursos-secundaria/src-tauri/` | Backend Rust (comandos Tauri + SQLite). |
| `database.sql` | **Prueba de verdad del esquema de dominio.** No inventar tablas fuera de este archivo (ampliarlo primero si hace falta). |
| `libraries-npm.md` | Catálogo de librerías npm a usar en el frontend. |
| `docs/domain-map.md` | Mapa de dominio alineado a `database.sql`. |

## Principios

1. **`database.sql` es la fuente de verdad del modelo.** Ampliar el SQL antes de crear entidades, comandos Tauri o pantallas que no existan ahí.
2. **La app solo corre en local.** Rust habla con SQLite; el frontend no habla SQL directo.
3. **`database.sql` es SQLite** y se puede aplicar tal cual (`PRAGMA foreign_keys = ON`). No reintroducir MySQL (`CREATE DATABASE`, `AUTO_INCREMENT`, `VARCHAR`).
4. **No tocar ni versionar** `node_modules/`, `target/`, `dist/`, DBs locales de Headroom/CBM, ni `.grok/config.toml`.
5. **Un clone = un índice CBM = un proxy Headroom** desde esta raíz. No mezclar el puerto `:8787` con FactuStock, StockSQL u otro monorepo.
6. **Librerías FE** según `libraries-npm.md`. No agregar UI kits extra sin actualizar ese archivo.

## Dominio (estado actual)

**Actor:** un solo docente. Solo existe lo que carga porque dicta ahí (varias escuelas, PBA y CABA, **primaria y secundaria** a la vez). Caso testigo: profesor de inglés con horas en primaria y en secundaria. Maestro de grado: un curso por grupo, materia «Grado» o las áreas que separe. **Sin login ni usuarios.** Un **curso** es un dictado: materia + grupo (nivel + ciclo/división/turno) + escuela + año lectivo. El **ciclo** es grado (primaria) o año (secundaria); 3° grado ≠ 3° año. El alumno es persona de *sus* cursos; inscripción en `alumnos_cursos`. Un año lectivo activo. Fuera: inicial/jardín.

**Marca:** `docs/Logo y paleta de colores.jpeg` — paleta en `src/index.css` (`paper`, `navy`, `crimson`, `cream`, `sky`); logo centrado en la ventana (`public/logo.jpeg`).

**Tablas en `database.sql`:** catálogos (`niveles`, `turnos`, `divisiones`, `ciclos`, `anios_lectivos`, `jurisdicciones`, `tipos_*`, `estados_asistencia`); maestras (`escuelas`, `materias`, `cursos`, `alumnos`, `alumnos_cursos`, `horarios`); operativa (`eventos`, `evaluaciones`, `notas`, `observaciones`, `asistencias`). Schema v1.2. DBs v1.1: Rust migra `niveles` + ciclos por nivel sin borrar datos. UI lista hasta paso 3 (alumnos e inscripción).

Los exámenes viven en `evaluaciones` (el calendario de exámenes se deriva de ahí). `eventos` es el quehacer del profesor (tema, entrega, reunión, junta, acto/sin clase, otro), no el calendario institucional. Notas y ponderaciones son **TEXT** decimal. Asistencia = esa hora de clase, no el registro oficial del colegio.

Detalle, invariantes y lo que **queda fuera** (director/escuela): [`docs/domain-map.md`](docs/domain-map.md).

## Stack objetivo

| Capa | Tecnología |
|------|------------|
| Desktop | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite |
| Backend | Rust (`src-tauri`), comandos Tauri |
| Persistencia | SQLite (un archivo local) |
| Fechas | Temporal (API JS), no `Date` nativo para lógica de dominio |
| Decimales / notas | `decimal.js` si hay promedios o escalas no enteras |

### Frontend (`libraries-npm.md`)

`tailwindcss`, `toastify` (react-toastify), `sweetalert2`, `zod`, `decimal.js`, `@tanstack/react-table`, `lucide-react`, `react-router-dom`, `recharts`, Temporal.

Instaladas en `adm-cursos-secundaria/package.json`. Tailwind v4 (`@tailwindcss/vite`). Fechas: `@js-temporal/polyfill`. Contrato IPC: `src/api.ts` (Zod) ↔ `src-tauri/src/domain.rs` (serde, mismos nombres que `database.sql`). Argumentos de `invoke` en **snake_case**: cada comando Rust lleva `#[tauri::command(rename_all = "snake_case")]` (Tauri 2 camelCasea por defecto; sin eso `id_anio_lectivo` llega como `idAnioLectivo` y falla).

### Backend Rust

- Interacción FE ↔ SQL solo vía comandos Tauri (o un módulo `db` invocado desde ellos).
- `rusqlite` (bundled) en `src-tauri/src/db.rs`. Cada conexión ejecuta `PRAGMA foreign_keys = ON` y `journal_mode = WAL` (los FK **no** se persisten en el archivo).
- Al abrir: si la DB no tiene tablas de usuario, se aplica `database.sql` (sin reejecutar los `PRAGMA` del archivo). Si ya hay tablas, no se corren los `DROP`.
- Archivo runtime: `{app_data_dir}/adm-cursos.sqlite`. Comando `db_status` para verificar pragmas.
- Tipos `serde` en el borde Tauri; no filtrar filas crudas sin DTO.
- Comandos de dominio: `maestras.rs` (escuelas, materias, años, catálogos), `cursos.rs` y `alumnos.rs` (persona + `alumnos_cursos`). Errores SQL se mapean a mensajes en español (`db::map_sql_error`).

## Tooling de contexto

- **codebase-memory-mcp (CBM):** indexar desde esta raíz con `.cbmignore`. Verificar con `search_code pattern=alumnos` / `CREATE TABLE` (tablas en `database.sql`) y `search_graph query=greet` (símbolos Tauri). `search_graph` no indexa nombres de tablas SQL como nodos de dominio.
- **CBM project id = path absoluto de esta copia.** Nunca hardcodear un id de otra PC.
  - **Trabajo (esta máquina):** root `C:/Users/Usuario/Desktop/Bruno/Proy. TMST` → id `C-Users-Usuario-Desktop-Bruno-Proy.-TMST` (el punto de `Proy.` queda en el id; 129 nodos / 143 edges, full+persistence 2026-09-09).
  - Artefacto local: `.codebase-memory/graph.db.zst` (gitignored). Se escribe en full reindex con `persistence=true`.
  - En Windows el CLI a veces rompe JSON en PowerShell; preferir MCP en Grok o JSON en archivo.
- **Headroom:** dos piezas. El **proxy** (`.\.headroom\start-proxy.ps1` desde la raíz, `:8787`) no es MCP. El **MCP** es `headroom mcp serve --proxy-url http://127.0.0.1:8787` (stdio, en `.grok/config.toml`). Si el proxy está caído, Grok marca `headroom` como timeout.
  - Python **3.13** (`headroom-ai[all]`; no 3.14). Win10: `.\.headroom\setup-windows.ps1` luego `.\.headroom\start-proxy.ps1`.
  - URL proxy: `http://127.0.0.1:8787` — health: `/livez`, `/readyz`, `/health`, `/stats`
  - Flags: `mode=token`, `memory=project`, `code_graph=true`
  - DBs locales (gitignored): `.headroom/memory.db`, `memory_graph.db`, `memory_vectors.db` — **no copiar entre PCs**
  - Seed versionable: `.headroom/seed-memories.json` → `headroom memory import --db-path .\.headroom\memory.db --force .\.headroom\seed-memories.json`
  - **No** compartir `:8787` con FactuStock ni StockSQL
- Config Grok del proyecto: copiar `.grok/config.example.toml` → `.grok/config.toml` (paths reales a CBM y `headroom.exe`). **`.grok/config.toml` es local**. Tras recablear: `/mcps` → `r` o reabrir Grok desde esta raíz.

## Multi-máquina

CBM y Headroom son **por máquina y por carpeta**, no por remote de git.

| Qué | ¿Viaja con git? | Notas |
|-----|-----------------|--------|
| Código, `docs/`, `AGENTS.md`, `database.sql`, seed Headroom | Sí | Fuente de verdad compartida |
| Índice CBM | No | Id = path absoluto |
| `.codebase-memory/` | No | Regenerar en cada PC |
| `.headroom/*.db` | No | Importar seed en cada PC |
| `node_modules/`, `target/` | No | Reinstalar |
| `.grok/config.toml` | No | Paths locales |

Al cambiar de PC: `git pull` (si hay repo), `list_projects` con el path de **esta** máquina, reindex CBM `full` + `persistence=true` si el grafo falta, `.\.headroom\setup-windows.ps1` o import del seed, no copiar `*.db`.

## Comandos

| Área | Comando |
|------|---------|
| FE Vite | `cd adm-cursos-secundaria && npm run dev` |
| Tauri | `cd adm-cursos-secundaria && npm run tauri dev` |
| Build FE | `cd adm-cursos-secundaria && npm run build` |
| Headroom proxy | `.\.headroom\start-proxy.ps1` |
| Headroom setup | `.\.headroom\setup-windows.ps1` |
| Import seed | `headroom memory import --db-path .\.headroom\memory.db --force .\.headroom\seed-memories.json` |

## Git

- Repo en la raíz de `Proy. TMST` (no anidar git dentro de `adm-cursos-secundaria/` si se versiona junto).
- Nunca `git add .` sin revisar: fuera van `node_modules/`, `target/`, `dist/`, `.env`, DBs de Headroom/CBM, `.grok/config.toml`.
