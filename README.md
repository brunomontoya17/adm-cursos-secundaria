# Adm Cursos Secundaria

Cuaderno de escritorio para **un docente** de PBA y/o CABA que quiere ordenar **los cursos donde dicta**: primaria y secundaria, profesor de materia (inglés, artísticas, …) o maestro de grado. No es software de director ni de secretaría.

App **local**: React + Tauri en el frontend, **Rust + SQLite** en el backend. Sin login ni API remota.

## Estructura

| Ruta | Rol |
|------|-----|
| `adm-cursos-secundaria/` | App Tauri 2 + React 19 + TypeScript |
| `database.sql` | Esquema de dominio (fuente de verdad, SQLite) |
| `docs/` | Mapa de dominio, paleta/logo, roadmap |
| `AGENTS.md` | Convenciones del proyecto |

## Desarrollo

```bash
cd adm-cursos-secundaria
npm install
npm run tauri dev
```

Frontend solo (Vite): `npm run dev`.

Tras un cambio en Rust hay que **reiniciar** `npm run tauri dev`; el HMR del front no recarga comandos.

## Estado

Pasos **0–10** del [roadmap](docs/roadmap.md): shell, escuelas/materias/año lectivo, cursos, alumnos, horarios, evaluaciones, notas, asistencia, calendario (eventos), observaciones e inicio (resumen del día). Schema `database.sql` **v1.3** (alumno = nombre + apellido). Pasos 11–13 de [privacidad](docs/roadmap-privacidad.md) hechos. Icono de la app: sello del logo (no el default de Tauri).

Repositorio: [brunomontoya17/adm-cursos-secundaria](https://github.com/brunomontoya17/adm-cursos-secundaria).
