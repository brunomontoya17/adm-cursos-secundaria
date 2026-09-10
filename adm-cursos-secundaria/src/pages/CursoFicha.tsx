import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  alumnoWriteSchema,
  type Alumno,
  type Ciclo,
  type Curso,
  type Escuela,
  type Materia,
  type Nivel,
} from "../api";
import { confirmAction } from "../feedback";
import { blankToNull, btnDanger, btnGhost, btnLink, btnPrimary, inputClass } from "../form";
import { DataTable, tableFeaturesBase } from "../ui/DataTable";
import { EvaluacionesCursoPanel } from "./Evaluaciones";
import { HorarioCursoPanel } from "./Horarios";
import { NotasCursoPanel } from "./Notas";

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-sky">{label}</dt>
      <dd className="mt-1 text-navy">{value}</dd>
    </div>
  );
}

function CursoFicha() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cursoId = Number(id);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [escuela, setEscuela] = useState<Escuela | null>(null);
  const [materia, setMateria] = useState<Materia | null>(null);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [turno, setTurno] = useState<string>("—");
  const [division, setDivision] = useState<string>("—");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(cursoId) || cursoId <= 0) {
      setMissing(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await api.getCurso(cursoId);
        const [escuelas, materias, ciclos, niveles, turnos, divisiones] = await Promise.all([
          api.listEscuelas(),
          api.listMaterias(),
          api.listCiclos(),
          api.listNiveles(),
          api.listTurnos(),
          api.listDivisiones(),
        ]);
        if (cancelled) return;
        setCurso(row);
        setEscuela(escuelas.find((e) => e.id === row.id_escuela) ?? null);
        setMateria(materias.find((m) => m.id === row.id_materia) ?? null);
        const c = ciclos.find((item) => item.id === row.id_ciclo) ?? null;
        setCiclo(c);
        setNivel(c ? (niveles.find((n) => n.id === c.id_nivel) ?? null) : null);
        setTurno(turnos.find((t) => t.id === row.id_turno)?.nombre ?? "—");
        setDivision(divisiones.find((d) => d.id === row.id_division)?.nombre ?? "—");
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursoId]);

  async function onDelete() {
    if (!curso) return;
    const ok = await confirmAction({
      title: "¿Borrar este dictado?",
      text: `${curso.nombre}. Se borran horarios, notas y demás datos de este curso.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCurso(curso.id);
      toast.success("Curso borrado");
      navigate("/cursos");
    } catch {
      /* Swal */
    }
  }

  if (missing) {
    return (
      <section className="space-y-4 p-6">
        <p className="text-navy">No se encontró el curso.</p>
        <Link to="/cursos" className={`${btnGhost} no-underline`}>
          Volver a cursos
        </Link>
      </section>
    );
  }

  if (!curso) {
    return (
      <section className="p-6">
        <p className="text-sm text-sky">Cargando…</p>
      </section>
    );
  }

  return (
    <section className="space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-sky">
            {nivel?.nombre ?? "Curso"}
          </p>
          <h2 className="font-serif text-2xl text-navy">{curso.nombre}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/cursos" className={`${btnGhost} no-underline`}>
            Volver
          </Link>
          <button type="button" className={btnPrimary} onClick={() => navigate("/cursos")}>
            Editar en el listado
          </button>
          <button type="button" className={btnDanger} onClick={() => void onDelete()}>
            Borrar
          </button>
        </div>
      </div>

      <dl className="grid gap-4 border border-navy/15 bg-cream/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Dato label="Escuela" value={escuela?.nombre ?? "—"} />
        <Dato label="Materia" value={materia?.nombre ?? "—"} />
        <Dato label="Nivel" value={nivel?.nombre ?? "—"} />
        <Dato label="Grado / año" value={ciclo?.nombre ?? "—"} />
        <Dato label="División" value={division} />
        <Dato label="Turno" value={turno} />
        <Dato label="Orientación" value={curso.orientacion ?? "—"} />
      </dl>

      <NominaCurso cursoId={curso.id} cursoNombre={curso.nombre} />

      <div className="grid gap-4 lg:grid-cols-2">
        <HorarioCursoPanel cursoId={curso.id} cursoNombre={curso.nombre} />
        <EvaluacionesCursoPanel cursoId={curso.id} cursoNombre={curso.nombre} />
      </div>

      <NotasCursoPanel cursoId={curso.id} cursoNombre={curso.nombre} />
    </section>
  );
}

const nominaHelper = createColumnHelper<typeof tableFeaturesBase, Alumno>();
const EMPTY_NOMINA: Alumno[] = [];

function NominaCurso({ cursoId, cursoNombre }: { cursoId: number; cursoNombre: string }) {
  const [nomina, setNomina] = useState<Alumno[]>([]);
  const [todos, setTodos] = useState<Alumno[]>([]);
  const [apellido, setApellido] = useState("");
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [idExistente, setIdExistente] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [deEste, personas] = await Promise.all([
        api.listAlumnosDeCurso(cursoId),
        api.listAlumnos(),
      ]);
      setNomina(deEste);
      setTodos(personas);
    } catch {
      /* Swal */
    }
  }, [cursoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const idsNomina = useMemo(() => new Set(nomina.map((a) => a.id)), [nomina]);
  const candidatos = useMemo(
    () => todos.filter((a) => !idsNomina.has(a.id)),
    [idsNomina, todos],
  );

  async function onAltaRapida(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = alumnoWriteSchema.safeParse({
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      dni: blankToNull(dni),
      email: null,
      telefono: null,
      fecha_nacimiento: null,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      const creado = await api.createAlumno(parsed.data);
      await api.inscribirAlumno(creado.id, cursoId);
      toast.success("Alumno en la nómina");
      setApellido("");
      setNombre("");
      setDni("");
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onElegirExistente(event: FormEvent) {
    event.preventDefault();
    const id = Number(idExistente);
    if (!Number.isFinite(id) || id <= 0) {
      setFormError("Elegí un alumno existente.");
      return;
    }
    setFormError(null);
    try {
      await api.inscribirAlumno(id, cursoId);
      toast.success("Inscripción guardada");
      setIdExistente("");
      await reload();
    } catch {
      /* Swal */
    }
  }

  async function onDarDeBaja(row: Alumno) {
    const ok = await confirmAction({
      title: "¿Dar de baja de este dictado?",
      text: `${row.apellido}, ${row.nombre} deja ${cursoNombre}. Se borran notas, asistencias y observaciones de este curso.`,
      confirmText: "Dar de baja",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.desinscribirAlumno(row.id, cursoId);
      toast.success("Baja de la nómina");
      await reload();
    } catch {
      /* Swal */
    }
  }

  const columns = useMemo(
    () =>
      nominaHelper.columns([
        nominaHelper.accessor("apellido", { header: "Apellido" }),
        nominaHelper.accessor("nombre", { header: "Nombre" }),
        nominaHelper.accessor("dni", {
          header: "DNI",
          cell: (ctx) => ctx.getValue() ?? "—",
        }),
        nominaHelper.display({
          id: "acciones",
          header: "",
          cell: (ctx) => {
            const row = ctx.row.original;
            return (
              <span className="flex justify-end">
                <button type="button" className={btnDanger} onClick={() => void onDarDeBaja(row)}>
                  Dar de baja
                </button>
              </span>
            );
          },
        }),
      ]),
    [nomina],
  );

  return (
    <div className="space-y-4 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Alumnos de este dictado</h3>
        <Link to="/alumnos" className={`${btnLink} no-underline`}>
          Ver todas las personas
        </Link>
      </div>

      <form className="grid gap-3 sm:grid-cols-4" onSubmit={onAltaRapida}>
        <label className="space-y-1 sm:col-span-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sky">Apellido</span>
          <input
            required
            className={inputClass}
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            placeholder="Pérez"
          />
        </label>
        <label className="space-y-1 sm:col-span-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sky">Nombre</span>
          <input
            required
            className={inputClass}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Juan"
          />
        </label>
        <label className="space-y-1 sm:col-span-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sky">DNI</span>
          <input
            className={inputClass}
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className={btnPrimary} disabled={saving}>
            Alta en este curso
          </button>
        </div>
      </form>

      <form className="flex flex-wrap items-end gap-2" onSubmit={onElegirExistente}>
        <label className="min-w-[14rem] flex-1 space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sky">
            Elegir existente
          </span>
          <select
            className={inputClass}
            value={idExistente}
            onChange={(e) => setIdExistente(e.target.value)}
            disabled={candidatos.length === 0}
          >
            <option value="">
              {candidatos.length === 0 ? "No hay otras personas" : "Alumno ya cargado…"}
            </option>
            {candidatos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.apellido}, {a.nombre}
                {a.dni ? ` · ${a.dni}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={btnGhost} disabled={!idExistente}>
          Inscribir
        </button>
      </form>

      {formError && <p className="text-sm text-crimson">{formError}</p>}

      <DataTable
        columns={columns}
        data={nomina.length > 0 ? nomina : EMPTY_NOMINA}
        empty="Nadie en este dictado todavía. Alta rápida arriba o elegí una persona existente."
      />
    </div>
  );
}

export default CursoFicha;
