import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  cursoWriteSchema,
  type Ciclo,
  type Curso,
  type CursoWrite,
  type Division,
  type Escuela,
  type Materia,
  type Nivel,
  type Turno,
} from "../api";
import { confirmAction } from "../feedback";
import {
  blankToNull,
  btnDanger,
  btnGhost,
  btnLink,
  btnPrimary,
  inputClass,
} from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";
import { DataTable, tableFeaturesBase } from "../ui/DataTable";

const helper = createColumnHelper<typeof tableFeaturesBase, CursoRow>();
const EMPTY: CursoRow[] = [];

type CursoRow = Curso & {
  escuela: string;
  materia: string;
  nivel: string;
  ciclo: string;
  turno: string;
  division: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function byId<T extends { id: number }>(rows: T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

export function sugerirNombreCurso(opts: {
  ciclo: Ciclo | undefined;
  division: Division | undefined;
  materia: Materia | undefined;
  escuela: Escuela | undefined;
  nivel: Nivel | undefined;
}): string {
  const grado = opts.ciclo ? `${opts.ciclo.orden}°` : "";
  const div = opts.division?.nombre ?? "";
  const mat = opts.materia?.nombre ?? "";
  const escuela = (opts.escuela?.nombre_corto ?? "").trim() || opts.escuela?.nombre || "";
  const nivel = opts.nivel?.nombre ?? "";
  const left = [grado, div, mat].filter(Boolean).join(" ");
  const right = [escuela, nivel].filter(Boolean).join(" · ");
  if (!left) return "";
  return right ? `${left} — ${right}` : left;
}

function Cursos() {
  const { activo } = useAnioLectivo();
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [divisiones, setDivisiones] = useState<Division[]>([]);
  const [rows, setRows] = useState<Curso[]>([]);
  const [filtroNivel, setFiltroNivel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [idEscuela, setIdEscuela] = useState("");
  const [idNivel, setIdNivel] = useState("");
  const [idCiclo, setIdCiclo] = useState("");
  const [idDivision, setIdDivision] = useState("");
  const [idTurno, setIdTurno] = useState("");
  const [idMateria, setIdMateria] = useState("");
  const [orientacion, setOrientacion] = useState("");
  const [nombre, setNombre] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prevSugerido = useRef("");

  const escuelasBy = useMemo(() => byId(escuelas), [escuelas]);
  const materiasBy = useMemo(() => byId(materias), [materias]);
  const nivelesBy = useMemo(() => byId(niveles), [niveles]);
  const ciclosBy = useMemo(() => byId(ciclos), [ciclos]);
  const turnosBy = useMemo(() => byId(turnos), [turnos]);
  const divisionesBy = useMemo(() => byId(divisiones), [divisiones]);

  const ciclosDelNivel = useMemo(
    () => ciclos.filter((c) => !idNivel || String(c.id_nivel) === idNivel),
    [ciclos, idNivel],
  );

  const suggested = useMemo(
    () =>
      sugerirNombreCurso({
        ciclo: ciclosBy.get(Number(idCiclo)),
        division: divisionesBy.get(Number(idDivision)),
        materia: materiasBy.get(Number(idMateria)),
        escuela: escuelasBy.get(Number(idEscuela)),
        nivel: nivelesBy.get(Number(idNivel)),
      }),
    [ciclosBy, divisionesBy, escuelasBy, idCiclo, idDivision, idEscuela, idMateria, idNivel, materiasBy, nivelesBy],
  );

  useEffect(() => {
    if (!suggested) return;
    setNombre((current) =>
      current === "" || current === prevSugerido.current ? suggested : current,
    );
    prevSugerido.current = suggested;
  }, [suggested]);

  const loadCatalogos = useCallback(async () => {
    try {
      const [e, m, n, c, t, d] = await Promise.all([
        api.listEscuelas(),
        api.listMaterias(),
        api.listNiveles(),
        api.listCiclos(),
        api.listTurnos(),
        api.listDivisiones(),
      ]);
      setEscuelas(e);
      setMaterias(m);
      setNiveles(n);
      setCiclos(c);
      setTurnos(t);
      setDivisiones(d);
    } catch {
      /* Swal */
    }
  }, []);

  const reload = useCallback(async () => {
    if (!activo) {
      setRows([]);
      return;
    }
    try {
      setRows(await api.listCursos(activo.id));
    } catch {
      /* Swal */
    }
  }, [activo]);

  useEffect(() => {
    void loadCatalogos();
  }, [loadCatalogos]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!idEscuela && escuelas[0]) setIdEscuela(String(escuelas[0].id));
  }, [escuelas, idEscuela]);
  useEffect(() => {
    if (!idMateria && materias[0]) setIdMateria(String(materias[0].id));
  }, [idMateria, materias]);
  useEffect(() => {
    if (!idTurno && turnos[0]) setIdTurno(String(turnos[0].id));
  }, [idTurno, turnos]);
  useEffect(() => {
    if (!idDivision && divisiones[0]) setIdDivision(String(divisiones[0].id));
  }, [divisiones, idDivision]);
  useEffect(() => {
    if (!idNivel && niveles[0]) setIdNivel(String(niveles[0].id));
  }, [idNivel, niveles]);
  useEffect(() => {
    if (ciclosDelNivel.length === 0) return;
    const still = ciclosDelNivel.some((c) => String(c.id) === idCiclo);
    if (!still) setIdCiclo(String(ciclosDelNivel[0].id));
  }, [ciclosDelNivel, idCiclo]);

  function resetForm() {
    setEditingId(null);
    setOrientacion("");
    setFormError(null);
    prevSugerido.current = "";
    setNombre("");
    if (escuelas[0]) setIdEscuela(String(escuelas[0].id));
    if (materias[0]) setIdMateria(String(materias[0].id));
    if (turnos[0]) setIdTurno(String(turnos[0].id));
    if (divisiones[0]) setIdDivision(String(divisiones[0].id));
    if (niveles[0]) setIdNivel(String(niveles[0].id));
  }

  function startEdit(row: Curso) {
    const ciclo = ciclosBy.get(row.id_ciclo);
    setEditingId(row.id);
    setIdEscuela(String(row.id_escuela));
    setIdNivel(ciclo ? String(ciclo.id_nivel) : idNivel);
    setIdCiclo(String(row.id_ciclo));
    setIdDivision(String(row.id_division));
    setIdTurno(String(row.id_turno));
    setIdMateria(String(row.id_materia));
    setOrientacion(row.orientacion ?? "");
    setNombre(row.nombre);
    setFormError(null);
    prevSugerido.current = row.nombre;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!activo) {
      setFormError("No hay año lectivo activo.");
      return;
    }
    const payload: CursoWrite = {
      nombre: nombre.trim(),
      id_escuela: Number(idEscuela),
      id_turno: Number(idTurno),
      id_division: Number(idDivision),
      id_ciclo: Number(idCiclo),
      id_materia: Number(idMateria),
      id_anio_lectivo: editingId
        ? (rows.find((r) => r.id === editingId)?.id_anio_lectivo ?? activo.id)
        : activo.id,
      orientacion: blankToNull(orientacion),
    };
    const parsed = cursoWriteSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateCurso(editingId, parsed.data);
        toast.success("Curso actualizado");
      } else {
        await api.createCurso(parsed.data);
        toast.success("Curso guardado");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Curso) {
    const ok = await confirmAction({
      title: "¿Borrar este dictado?",
      text: `${row.nombre}. Se borran horarios, notas y demás datos de este curso.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCurso(row.id);
      toast.success("Curso borrado");
      if (editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tableRows: CursoRow[] = useMemo(() => {
    return rows
      .filter((row) => {
        if (!filtroNivel) return true;
        const ciclo = ciclosBy.get(row.id_ciclo);
        return ciclo ? String(ciclo.id_nivel) === filtroNivel : true;
      })
      .map((row) => {
        const ciclo = ciclosBy.get(row.id_ciclo);
        const nivel = ciclo ? nivelesBy.get(ciclo.id_nivel) : undefined;
        return {
          ...row,
          escuela: escuelasBy.get(row.id_escuela)?.nombre_corto || escuelasBy.get(row.id_escuela)?.nombre || "—",
          materia: materiasBy.get(row.id_materia)?.nombre ?? "—",
          nivel: nivel?.nombre ?? "—",
          ciclo: ciclo?.nombre ?? "—",
          turno: turnosBy.get(row.id_turno)?.nombre ?? "—",
          division: divisionesBy.get(row.id_division)?.nombre ?? "—",
        };
      });
  }, [ciclosBy, divisionesBy, escuelasBy, filtroNivel, materiasBy, nivelesBy, rows, turnosBy]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("nombre", { header: "Curso" }),
        helper.accessor("nivel", { header: "Nivel" }),
        helper.accessor("ciclo", { header: "Grado / año" }),
        helper.accessor("division", { header: "Div." }),
        helper.accessor("materia", { header: "Materia" }),
        helper.accessor("escuela", { header: "Escuela" }),
        helper.accessor("turno", { header: "Turno" }),
        helper.display({
          id: "acciones",
          header: "",
          cell: (ctx) => {
            const row = ctx.row.original;
            return (
              <span className="flex justify-end gap-1">
                <Link to={`/cursos/${row.id}`} className={`${btnLink} no-underline`}>
                  Abrir
                </Link>
                <button type="button" className={btnLink} onClick={() => startEdit(row)}>
                  Editar
                </button>
                <button type="button" className={btnDanger} onClick={() => void onDelete(row)}>
                  Borrar
                </button>
              </span>
            );
          },
        }),
      ]),
    [rows],
  );

  const faltanMaestras = escuelas.length === 0 || materias.length === 0;

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Cursos</h2>
        <p className="mt-1 text-sm text-sky">
          {activo
            ? `Dictados de ${activo.anio}. Un 3° grado y un 3° año pueden convivir en la misma escuela.`
            : "Elegí un año lectivo en la cabecera."}
        </p>
      </div>

      {faltanMaestras && (
        <p className="border border-navy/15 bg-cream/40 px-4 py-3 text-sm text-navy">
          Primero cargá al menos una escuela y una materia.{" "}
          <Link to="/escuelas" className="underline">
            Ir a Escuelas y materias
          </Link>
        </p>
      )}

      <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
        <h3 className="text-sm font-medium text-navy">
          {editingId ? "Editar dictado" : "Nuevo dictado"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Escuela">
            <select
              required
              className={inputClass}
              value={idEscuela}
              onChange={(e) => setIdEscuela(e.target.value)}
            >
              {escuelas.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nombre_corto ? `${row.nombre_corto} — ${row.nombre}` : row.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nivel">
            <select
              required
              className={inputClass}
              value={idNivel}
              onChange={(e) => setIdNivel(e.target.value)}
            >
              {niveles.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grado / año">
            <select
              required
              className={inputClass}
              value={idCiclo}
              onChange={(e) => setIdCiclo(e.target.value)}
            >
              {ciclosDelNivel.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="División">
            <select
              required
              className={inputClass}
              value={idDivision}
              onChange={(e) => setIdDivision(e.target.value)}
            >
              {divisiones.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Turno">
            <select
              required
              className={inputClass}
              value={idTurno}
              onChange={(e) => setIdTurno(e.target.value)}
            >
              {turnos.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Materia">
            <select
              required
              className={inputClass}
              value={idMateria}
              onChange={(e) => setIdMateria(e.target.value)}
            >
              {materias.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orientación">
            <input
              className={inputClass}
              value={orientacion}
              onChange={(e) => setOrientacion(e.target.value)}
              placeholder="Opcional (Bachiller, Economía…)"
            />
          </Field>
          <Field label="Etiqueta">
            <input
              required
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="3° B English — ENET · Primaria"
            />
          </Field>
        </div>
        {formError && <p className="text-sm text-crimson">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={saving || !activo || faltanMaestras}>
            {editingId ? "Guardar cambios" : "Agregar curso"}
          </button>
          {editingId && (
            <button type="button" className={btnGhost} onClick={resetForm}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setNombre(suggested);
              prevSugerido.current = suggested;
            }}
          >
            Usar etiqueta sugerida
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-sky">
          Nivel{" "}
          <select
            className={`${inputClass} w-auto`}
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
          >
            <option value="">Todos</option>
            {niveles.map((row) => (
              <option key={row.id} value={row.id}>
                {row.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        columns={columns}
        data={tableRows.length > 0 ? tableRows : EMPTY}
        empty={
          activo
            ? "Todavía no hay dictados en este año. Cargá el primero arriba."
            : "Sin año lectivo activo."
        }
      />
    </section>
  );
}

export default Cursos;
