import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  notaWriteSchema,
  type Alumno,
  type Curso,
  type Evaluacion,
  type Nota,
  type TipoEvaluacion,
} from "../api";
import {
  blankToNull,
  btnGhost,
  btnLink,
  formatDecimal,
  formatFecha,
  inputClass,
  normalizeDecimalText,
  promedioPonderado,
} from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";
import Decimal from "decimal.js";

function etiquetaAlumno(a: Alumno): string {
  return `${a.apellido}, ${a.nombre}`;
}

function notaKey(idAlumno: number, idEvaluacion: number): string {
  return `${idAlumno}:${idEvaluacion}`;
}

function Planilla({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [evals, setEvals] = useState<Evaluacion[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [tipos, setTipos] = useState<TipoEvaluacion[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [nomina, evaluaciones, cargadas, tiposEval] = await Promise.all([
        api.listAlumnosDeCurso(cursoId),
        api.listEvaluacionesDeCurso(cursoId),
        api.listNotasDeCurso(cursoId),
        api.listTiposEvaluacion(),
      ]);
      setAlumnos(nomina);
      setEvals(
        [...evaluaciones].sort((a, b) =>
          a.fecha === b.fecha ? a.titulo.localeCompare(b.titulo, "es") : a.fecha.localeCompare(b.fecha),
        ),
      );
      setNotas(cargadas);
      setTipos(tiposEval);
    } catch {
      /* Swal */
    } finally {
      setLoading(false);
    }
  }, [cursoId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const notaBy = useMemo(() => {
    const map = new Map<string, Nota>();
    for (const n of notas) map.set(notaKey(n.id_alumno, n.id_evaluacion), n);
    return map;
  }, [notas]);

  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoEvaluacion>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);

  const promediosAlumno = useMemo(() => {
    const map = new Map<number, Decimal | null>();
    for (const a of alumnos) {
      map.set(
        a.id,
        promedioPonderado(
          evals.map((e) => {
            const n = notaBy.get(notaKey(a.id, e.id));
            return {
              valor: n?.valor ?? null,
              ausente: n?.ausente === 1 ? 1 : 0,
              ponderacion: e.ponderacion,
            };
          }),
        ),
      );
    }
    return map;
  }, [alumnos, evals, notaBy]);

  const promedioCurso = useMemo(() => {
    const vals = [...promediosAlumno.values()].filter((v): v is Decimal => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((acc, v) => acc.plus(v), new Decimal(0)).div(vals.length);
  }, [promediosAlumno]);

  const promediosEval = useMemo(() => {
    const map = new Map<number, Decimal | null>();
    for (const e of evals) {
      map.set(
        e.id,
        promedioPonderado(
          alumnos.map((a) => {
            const n = notaBy.get(notaKey(a.id, e.id));
            return {
              valor: n?.valor ?? null,
              ausente: n?.ausente === 1 ? 1 : 0,
              ponderacion: "1",
            };
          }),
        ),
      );
    }
    return map;
  }, [alumnos, evals, notaBy]);

  if (loading) {
    return <p className="text-sm text-sky">Cargando planilla…</p>;
  }

  if (alumnos.length === 0) {
    return (
      <p className="text-sm text-sky">
        Inscribí alumnos en {cursoNombre} para cargar notas.{" "}
        <Link to={`/cursos/${cursoId}`} className={`${btnLink} no-underline`}>
          Ir a la ficha
        </Link>
      </p>
    );
  }

  if (evals.length === 0) {
    return (
      <p className="text-sm text-sky">
        Cargá evaluaciones de este dictado para armar la planilla.{" "}
        <Link to="/evaluaciones" className={`${btnLink} no-underline`}>
          Evaluaciones
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-sky">
        Promedio del curso (ponderado, sin ausentes ni vacíos):{" "}
        <span className="font-medium text-navy">{formatDecimal(promedioCurso)}</span>
      </p>
      <div className="overflow-x-auto border border-navy/15">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-cream/60 text-left text-xs uppercase tracking-wide text-sky">
              <th className="sticky left-0 z-10 bg-cream px-3 py-2 font-medium text-navy">
                Alumno
              </th>
              {evals.map((e) => (
                <th key={e.id} className="min-w-[9.5rem] px-2 py-2 font-medium text-navy">
                  <div>{e.titulo}</div>
                  <div className="font-normal normal-case text-sky">
                    {formatFecha(e.fecha)} · {tiposBy.get(e.id_tipo_evaluacion)?.nombre ?? "—"} ·
                    pond. {e.ponderacion}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-navy">Promedio</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a) => (
              <tr key={a.id} className="border-t border-navy/10">
                <td className="sticky left-0 bg-paper px-3 py-2 font-medium text-navy">
                  {etiquetaAlumno(a)}
                </td>
                {evals.map((e) => (
                  <td key={e.id} className="px-2 py-2 align-top">
                    <CeldaNota
                      nota={notaBy.get(notaKey(a.id, e.id))}
                      idAlumno={a.id}
                      idEvaluacion={e.id}
                      onSaved={() => void reload()}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-navy">
                  {formatDecimal(promediosAlumno.get(a.id) ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-navy/20 bg-cream/40">
              <td className="sticky left-0 bg-cream px-3 py-2 text-xs uppercase tracking-wide text-sky">
                Promedio
              </td>
              {evals.map((e) => (
                <td key={e.id} className="px-2 py-2 text-navy">
                  {formatDecimal(promediosEval.get(e.id) ?? null)}
                </td>
              ))}
              <td className="px-3 py-2 font-medium text-navy">{formatDecimal(promedioCurso)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function CeldaNota({
  nota,
  idAlumno,
  idEvaluacion,
  onSaved,
}: {
  nota: Nota | undefined;
  idAlumno: number;
  idEvaluacion: number;
  onSaved: () => void;
}) {
  const [valor, setValor] = useState(nota?.valor ?? "");
  const [ausente, setAusente] = useState(nota?.ausente === 1);
  const [comentario, setComentario] = useState(nota?.comentario ?? "");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setValor(nota?.valor ?? "");
    setAusente(nota?.ausente === 1);
    setComentario(nota?.comentario ?? "");
    setLocalError(null);
  }, [nota]);

  async function commit(next?: { valor?: string; ausente?: boolean; comentario?: string }) {
    const vRaw = next?.valor !== undefined ? next.valor : valor;
    const aus = next?.ausente !== undefined ? next.ausente : ausente;
    const com = next?.comentario !== undefined ? next.comentario : comentario;
    const v = aus ? "" : normalizeDecimalText(vRaw);
    const payload = {
      id_evaluacion: idEvaluacion,
      id_alumno: idAlumno,
      valor: aus ? null : blankToNull(v),
      ausente: (aus ? 1 : 0) as 0 | 1,
      comentario: blankToNull(com),
    };
    const unchanged =
      (nota?.valor ?? null) === payload.valor &&
      (nota?.ausente ?? 0) === payload.ausente &&
      (nota?.comentario ?? null) === payload.comentario;
    if (unchanged) return;

    if (payload.valor !== null) {
      const parsed = notaWriteSchema.safeParse(payload);
      if (!parsed.success) {
        setLocalError(parsed.error.issues[0]?.message ?? "Nota inválida");
        return;
      }
    } else {
      setLocalError(null);
    }
    setLocalError(null);
    setSaving(true);
    try {
      if (payload.valor === null && payload.ausente === 0 && payload.comentario === null) {
        await api.upsertNota(payload);
        toast.success("Nota borrada", { toastId: "nota-ok", autoClose: 1200 });
      } else {
        const parsed = notaWriteSchema.safeParse(payload);
        if (!parsed.success) {
          setLocalError(parsed.error.issues[0]?.message ?? "Nota inválida");
          return;
        }
        await api.upsertNota(parsed.data);
        toast.success("Nota guardada", { toastId: "nota-ok", autoClose: 1200 });
      }
      onSaved();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`space-y-1 ${saving ? "opacity-60" : ""}`}>
      <input
        type="text"
        inputMode="decimal"
        className={`${inputClass} px-2 py-1 text-center disabled:bg-cream`}
        placeholder="—"
        disabled={ausente}
        value={ausente ? "" : valor}
        onChange={(e) => {
          setValor(e.target.value);
          setLocalError(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Nota"
      />
      <label className="flex items-center gap-1 text-xs text-sky">
        <input
          type="checkbox"
          checked={ausente}
          onChange={(e) => {
            const next = e.target.checked;
            setAusente(next);
            if (next) setValor("");
            void commit({ ausente: next, valor: next ? "" : valor });
          }}
        />
        Ausente
      </label>
      <input
        type="text"
        className={`${inputClass} px-2 py-1 text-xs`}
        placeholder="Comentario"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        onBlur={() => void commit()}
        aria-label="Comentario"
      />
      {localError && <p className="text-xs text-crimson">{localError}</p>}
    </div>
  );
}

export function NotasCursoPanel({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  return (
    <div className="space-y-3 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Notas de este dictado</h3>
        <Link to="/notas" className={`${btnLink} no-underline`}>
          Abrir planilla
        </Link>
      </div>
      <Planilla cursoId={cursoId} cursoNombre={cursoNombre} />
    </div>
  );
}

function Notas() {
  const { activo } = useAnioLectivo();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [idCurso, setIdCurso] = useState("");

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
        <h2 className="font-serif text-2xl text-navy">Notas</h2>
        <p className="mt-1 text-sm text-sky">
          Planilla del dictado: filas = alumnos inscriptos, columnas = evaluaciones. Escala 1–10
          o ausente. El promedio ponderado se calcula acá; no se guarda.
        </p>
      </div>

      {!activo ? (
        <p className="text-sm text-sky">Activá un año lectivo para ver las planillas.</p>
      ) : cursos.length === 0 ? (
        <p className="text-sm text-sky">
          No hay cursos en {activo.anio}.{" "}
          <Link to="/cursos" className={`${btnGhost} no-underline`}>
            Cargar cursos
          </Link>
        </p>
      ) : (
        <>
          <label className="block max-w-md space-y-1">
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
          {curso && <Planilla cursoId={curso.id} cursoNombre={curso.nombre} />}
        </>
      )}
    </section>
  );
}

export default Notas;
