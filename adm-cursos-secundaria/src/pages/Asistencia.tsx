import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  asistenciaWriteSchema,
  type Alumno,
  type Asistencia,
  type Curso,
  type EstadoAsistencia,
} from "../api";
import { btnGhost, btnLink, btnPrimary, formatFecha, hoyIso, inputClass } from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";

function etiquetaAlumno(a: Alumno): string {
  return `${a.apellido}, ${a.nombre}`;
}

function PaseDeLista({
  cursoId,
  cursoNombre,
  fecha,
}: {
  cursoId: number;
  cursoNombre: string;
  fecha: string;
}) {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
  const [filas, setFilas] = useState<Asistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [nomina, catalogo, cargadas] = await Promise.all([
        api.listAlumnosDeCurso(cursoId),
        api.listEstadosAsistencia(),
        api.listAsistencias(cursoId, fecha),
      ]);
      setAlumnos(nomina);
      setEstados(catalogo);
      setFilas(cargadas);
    } catch {
      /* Swal */
    } finally {
      setLoading(false);
    }
  }, [cursoId, fecha]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const porAlumno = useMemo(() => {
    const map = new Map<number, Asistencia>();
    for (const a of filas) map.set(a.id_alumno, a);
    return map;
  }, [filas]);

  const conteo = useMemo(() => {
    const byCodigo = new Map<string, number>();
    for (const e of estados) byCodigo.set(e.codigo, 0);
    for (const a of filas) {
      const codigo = estados.find((e) => e.id === a.id_estado_asistencia)?.codigo;
      if (codigo) byCodigo.set(codigo, (byCodigo.get(codigo) ?? 0) + 1);
    }
    return byCodigo;
  }, [estados, filas]);

  async function marcar(alumno: Alumno, estado: EstadoAsistencia | null) {
    const actual = porAlumno.get(alumno.id);
    if (estado === null) {
      if (!actual) return;
      setSaving(true);
      try {
        await api.deleteAsistencia(actual.id);
        toast.success("Marca borrada", { toastId: "asis-ok", autoClose: 1200 });
        await reload();
      } catch {
        /* Swal */
      } finally {
        setSaving(false);
      }
      return;
    }
    if (actual?.id_estado_asistencia === estado.id) return;
    const payload = {
      id_curso: cursoId,
      id_alumno: alumno.id,
      fecha,
      id_estado_asistencia: estado.id,
    };
    const parsed = asistenciaWriteSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      await api.upsertAsistencia(parsed.data);
      toast.success("Asistencia guardada", { toastId: "asis-ok", autoClose: 1200 });
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function todosPresentes() {
    if (alumnos.length === 0) return;
    setSaving(true);
    try {
      await api.marcarAsistenciasPresentes(cursoId, fecha);
      toast.success("Todos presentes. Corregí los que falten.");
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-sky">Cargando lista…</p>;
  }

  if (alumnos.length === 0) {
    return (
      <p className="text-sm text-sky">
        Inscribí alumnos en {cursoNombre} para pasar lista.{" "}
        <Link to={`/cursos/${cursoId}`} className={`${btnLink} no-underline`}>
          Ir a la ficha
        </Link>
      </p>
    );
  }

  const sinMarcar = alumnos.length - filas.length;
  const resumen = estados
    .map((e) => `${conteo.get(e.codigo) ?? 0} ${e.nombre.toLowerCase()}`)
    .join(" · ");

  return (
    <div className={`space-y-3 ${saving ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-sky">
          {resumen} · {sinMarcar} sin marcar
        </p>
        <button type="button" className={btnPrimary} onClick={() => void todosPresentes()}>
          Marcar todos presentes
        </button>
      </div>
      <ul className="divide-y divide-navy/10 border border-navy/15">
        {alumnos.map((a) => {
          const actual = porAlumno.get(a.id);
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-medium text-navy">{etiquetaAlumno(a)}</span>
              <div className="flex flex-wrap gap-1">
                {estados.map((e) => {
                  const on = actual?.id_estado_asistencia === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={
                        on
                          ? "bg-navy px-2 py-1 text-xs text-cream"
                          : "border border-navy/30 px-2 py-1 text-xs text-navy hover:bg-cream"
                      }
                      onClick={() => void marcar(a, e)}
                    >
                      {e.nombre}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="px-2 py-1 text-xs text-sky hover:text-navy"
                  disabled={!actual}
                  onClick={() => void marcar(a, null)}
                >
                  Quitar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AsistenciaCursoPanel({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  const [fecha, setFecha] = useState(hoyIso);

  return (
    <div className="space-y-3 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Asistencia de este dictado</h3>
        <Link to="/asistencia" className={`${btnLink} no-underline`}>
          Abrir pase de lista
        </Link>
      </div>
      <label className="block max-w-xs space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-sky">Fecha</span>
        <input
          type="date"
          className={inputClass}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </label>
      <PaseDeLista cursoId={cursoId} cursoNombre={cursoNombre} fecha={fecha} />
    </div>
  );
}

function Asistencia() {
  const { activo } = useAnioLectivo();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [idCurso, setIdCurso] = useState("");
  const [fecha, setFecha] = useState(hoyIso);

  useEffect(() => {
    if (!activo) {
      setCursos([]);
      setIdCurso("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.listCursos(activo.id);
        if (cancelled) return;
        setCursos(rows);
        setIdCurso((prev) => prev || (rows[0] ? String(rows[0].id) : ""));
      } catch {
        /* Swal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activo]);

  const curso = cursos.find((c) => String(c.id) === idCurso) ?? null;

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Asistencia</h2>
        <p className="mt-1 text-sm text-sky">
          Pase de lista de esa hora de clase, no el libro del colegio. Elegí curso y fecha
          (hoy por defecto), marcá todos presentes y corregí.
        </p>
      </div>

      {!activo ? (
        <p className="text-sm text-sky">Activá un año lectivo para pasar lista.</p>
      ) : cursos.length === 0 ? (
        <p className="text-sm text-sky">
          No hay cursos en {activo.anio}.{" "}
          <Link to="/cursos" className={`${btnGhost} no-underline`}>
            Cargar cursos
          </Link>
        </p>
      ) : (
        <>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-sky">Curso</span>
              <select
                className={inputClass}
                value={idCurso}
                onChange={(e) => setIdCurso(e.target.value)}
              >
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-sky">
                Fecha {fecha ? `(${formatFecha(fecha)})` : ""}
              </span>
              <input
                type="date"
                className={inputClass}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>
          </div>
          {curso && fecha && (
            <PaseDeLista cursoId={curso.id} cursoNombre={curso.nombre} fecha={fecha} />
          )}
        </>
      )}
    </section>
  );
}

export default Asistencia;
