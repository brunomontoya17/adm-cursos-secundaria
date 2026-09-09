# Adm Cursos Secundaria

Cuaderno de escritorio para **un profesor** de secundaria (PBA y/o CABA) que quiere ordenar **los cursos donde dicta**. No es software de director ni de secretaría.

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

Repositorio: [brunomontoya17/adm-cursos-secundaria](https://github.com/brunomontoya17/adm-cursos-secundaria).
