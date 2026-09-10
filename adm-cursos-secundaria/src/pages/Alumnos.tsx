import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  alumnoWriteSchema,
  type Alumno,
  type AlumnoCurso,
  type AlumnoWrite,
  type Curso,
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

const helper = createColumnHelper<typeof tableFeaturesBase, AlumnoRow>();
const EMPTY: AlumnoRow[] = [];

type AlumnoRow = Alumno & { cursos: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function etiquetaPersona(row: Alumno): string {
  return `${row.apellido}, ${row.nombre}`;
}

function Alumnos() {
  const { activo } = useAnioLectivo();
  const [rows, setRows] = useState<Alumno[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [inscripciones, setInscripciones] = useState<AlumnoCurso[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [idCursoAlta, setIdCursoAlta] = useState("");
  const [idCursoInscribir, setIdCursoInscribir] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cursosBy = useMemo(() => {
    const map = new Map<number, Curso>();
    for (const c of cursos) map.set(c.id, c);
    return map;
  }, [cursos]);

  const inscDe = useCallback(
    (idAlumno: number) => inscripciones.filter((i) => i.id_alumno === idAlumno),
    [inscripciones],
  );

  const reload = useCallback(async () => {
    try {
      const personas = await api.listAlumnos();
      setRows(personas);
      if (!activo) {
        setCursos([]);
        setInscripciones([]);
        return;
      }
      const [dictados, insc] = await Promise.all([
        api.listCursos(activo.id),
        api.listInscripciones(activo.id),
      ]);
      setCursos(dictados);
      setInscripciones(insc);
    } catch {
      /* Swal */
    }
  }, [activo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setNombre("");
    setApellido("");
    setDni("");
    setEmail("");
    setTelefono("");
    setFechaNacimiento("");
    setIdCursoAlta("");
    setIdCursoInscribir("");
    setFormError(null);
  }

  function startEdit(row: Alumno) {
    setEditingId(row.id);
    setNombre(row.nombre);
    setApellido(row.apellido);
    setDni(row.dni ?? "");
    setEmail(row.email ?? "");
    setTelefono(row.telefono ?? "");
    setFechaNacimiento(row.fecha_nacimiento ?? "");
    setIdCursoAlta("");
    setIdCursoInscribir("");
    setFormError(null);
  }

  function payload(): AlumnoWrite {
    return {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      dni: blankToNull(dni),
      email: blankToNull(email),
      telefono: blankToNull(telefono),
      fecha_nacimiento: blankToNull(fechaNacimiento),
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = alumnoWriteSchema.safeParse(payload());
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateAlumno(editingId, parsed.data);
        toast.success("Alumno actualizado");
      } else {
        const creado = await api.createAlumno(parsed.data);
        const cursoId = Number(idCursoAlta);
        if (Number.isFinite(cursoId) && cursoId > 0) {
          await api.inscribirAlumno(creado.id, cursoId);
        }
        toast.success("Alumno guardado");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Alumno) {
    const ok = await confirmAction({
      title: "¿Borrar esta persona?",
      text: `${etiquetaPersona(row)}. Se borran inscripciones, notas, asistencias y observaciones.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteAlumno(row.id);
      toast.success("Alumno borrado");
      if (editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  async function onInscribir() {
    if (!editingId) return;
    const cursoId = Number(idCursoInscribir);
    if (!Number.isFinite(cursoId) || cursoId <= 0) {
      setFormError("Elegí un curso para inscribir.");
      return;
    }
    setFormError(null);
    try {
      await api.inscribirAlumno(editingId, cursoId);
      toast.success("Inscripción guardada");
      setIdCursoInscribir("");
      await reload();
    } catch {
      /* Swal */
    }
  }

  async function onDarDeBaja(row: Alumno, curso: Curso) {
    const ok = await confirmAction({
      title: "¿Dar de baja de este dictado?",
      text: `${etiquetaPersona(row)} deja ${curso.nombre}. Se borran notas, asistencias y observaciones de ese curso.`,
      confirmText: "Dar de baja",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.desinscribirAlumno(row.id, curso.id);
      toast.success("Baja de la nómina");
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tableRows: AlumnoRow[] = useMemo(
    () =>
      rows.map((row) => {
        const nombres = inscDe(row.id)
          .map((i) => cursosBy.get(i.id_curso)?.nombre)
          .filter((n): n is string => Boolean(n));
        return {
          ...row,
          cursos: nombres.length > 0 ? nombres.join(" · ") : "Sin dictado este año",
        };
      }),
    [cursosBy, inscDe, rows],
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("apellido", { header: "Apellido" }),
        helper.accessor("nombre", { header: "Nombre" }),
        helper.accessor("dni", {
          header: "DNI",
          cell: (ctx) => ctx.getValue() ?? "—",
        }),
        helper.accessor("cursos", { header: "Cursos" }),
        helper.display({
          id: "acciones",
          header: "",
          cell: (ctx) => {
            const row = ctx.row.original;
            return (
              <span className="flex justify-end gap-1">
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
    [rows, inscripciones, cursos],
  );

  const editando = rows.find((r) => r.id === editingId) ?? null;
  const inscEditando = editando ? inscDe(editando.id) : [];
  const cursosDisponibles = cursos.filter(
    (c) => !inscEditando.some((i) => i.id_curso === c.id),
  );

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Alumnos</h2>
        <p className="mt-1 text-sm text-sky">
          Personas de tus dictados. El mismo chico puede estar en más de una materia.{" "}
          {activo
            ? `Inscripciones de ${activo.anio}.`
            : "Elegí un año lectivo en la cabecera para inscribir."}
        </p>
      </div>

      {cursos.length === 0 && activo && (
        <p className="border border-navy/15 bg-cream/40 px-4 py-3 text-sm text-navy">
          Todavía no hay cursos en este año.{" "}
          <Link to="/cursos" className="underline">
            Ir a Cursos
          </Link>
        </p>
      )}

      <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
        <h3 className="text-sm font-medium text-navy">
          {editingId ? "Editar persona" : "Nueva persona"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Apellido">
            <input
              required
              className={inputClass}
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              placeholder="Pérez"
            />
          </Field>
          <Field label="Nombre">
            <input
              required
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan"
            />
          </Field>
          <Field label="DNI">
            <input
              className={inputClass}
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              placeholder="Opcional"
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Teléfono">
            <input
              className={inputClass}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Field>
          <Field label="Fecha de nacimiento">
            <input
              className={inputClass}
              type="date"
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
            />
          </Field>
          {!editingId && (
            <Field label="Inscribir en (opcional)">
              <select
                className={inputClass}
                value={idCursoAlta}
                onChange={(e) => setIdCursoAlta(e.target.value)}
              >
                <option value="">Sin inscribir todavía</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {formError && <p className="text-sm text-crimson">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {editingId ? "Guardar cambios" : "Agregar alumno"}
          </button>
          {editingId && (
            <button type="button" className={btnGhost} onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {editando && (
        <div className="space-y-3 border border-navy/15 p-4">
          <h3 className="text-sm font-medium text-navy">
            Dictados de {etiquetaPersona(editando)}
            {activo ? ` · ${activo.anio}` : ""}
          </h3>
          {inscEditando.length === 0 ? (
            <p className="text-sm text-sky">No está inscripto en ningún dictado de este año.</p>
          ) : (
            <ul className="space-y-1">
              {inscEditando.map((i) => {
                const curso = cursosBy.get(i.id_curso);
                if (!curso) return null;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/cursos/${curso.id}`} className="text-navy no-underline hover:underline">
                      {curso.nombre}
                    </Link>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => void onDarDeBaja(editando, curso)}
                    >
                      Dar de baja
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-sky">
                Inscribir en
              </span>
              <select
                className={inputClass}
                value={idCursoInscribir}
                onChange={(e) => setIdCursoInscribir(e.target.value)}
                disabled={cursosDisponibles.length === 0}
              >
                <option value="">
                  {cursosDisponibles.length === 0 ? "No quedan dictados" : "Elegir curso…"}
                </option>
                {cursosDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={!idCursoInscribir}
              onClick={() => void onInscribir()}
            >
              Inscribir
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={tableRows.length > 0 ? tableRows : EMPTY}
        empty="Todavía no hay alumnos. Cargá la primera persona arriba."
      />
    </section>
  );
}

export default Alumnos;
