import { Temporal } from "@js-temporal/polyfill";
import Decimal from "decimal.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type Curso,
  type DbStatus,
  type Evaluacion,
  type Evento,
  type Horario,
  type TipoEvaluacion,
  type TipoEvento,
} from "../api";
import {
  btnLink,
  formatDecimal,
  formatFecha,
  formatFechaConDia,
  hoyIso,
  promedioPonderado,
} from "../form";
import { useAlcance } from "../shell/AlcanceContext";
import { useAnioLectivo } from "../shell/AnioLectivoContext";

const atajoInicio =
  "border border-navy px-3 py-1.5 text-sm text-navy no-underline hover:bg-cream link:text-navy visited:text-navy";

const VENTANA_PROXIMAS_DIAS = 14;

function etiquetaCurso(cursos: Curso[], id: number | null | undefined): string {
  if (id == null) return "Todos los dictados";
  return cursos.find((c) => c.id === id)?.nombre ?? "Curso";
}

function truncar(nombre: string, max = 18): string {
  return nombre.length > max ? `${nombre.slice(0, max - 1)}…` : nombre;
}

type PromedioCurso = {
  id: number;
  nombre: string;
  corto: string;
  promedio: number;
};

function Inicio() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const { activo } = useAnioLectivo();
  const { abrirReleer } = useAlcance();
  const hoy = hoyIso();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [tiposEvento, setTiposEvento] = useState<TipoEvento[]>([]);
  const [tiposEval, setTiposEval] = useState<TipoEvaluacion[]>([]);
  const [promedios, setPromedios] = useState<PromedioCurso[] | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.dbStatus();
      setDbStatus(status);
      if (!activo) {
        setCursos([]);
        setHorarios([]);
        setEventos([]);
        setEvaluaciones([]);
        return;
      }
      const [dictados, bloques, evts, evals, tEvt, tEval] = await Promise.all([
        api.listCursos(activo.id),
        api.listHorarios(activo.id),
        api.listEventos(activo.id),
        api.listEvaluaciones(activo.id),
        api.listTiposEvento(),
        api.listTiposEvaluacion(),
      ]);
      setCursos(dictados);
      setHorarios(bloques);
      setEventos(evts);
      setEvaluaciones(evals);
      setTiposEvento(tEvt);
      setTiposEval(tEval);
    } catch {
      /* Swal */
    } finally {
      setLoading(false);
    }
  }, [activo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!activo || cursos.length === 0) {
      setPromedios(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const filas = await Promise.all(
          cursos.map(async (curso) => {
            const [nomina, evals, notas] = await Promise.all([
              api.listAlumnosDeCurso(curso.id),
              api.listEvaluacionesDeCurso(curso.id),
              api.listNotasDeCurso(curso.id),
            ]);
            const notaBy = new Map(notas.map((n) => [`${n.id_alumno}:${n.id_evaluacion}`, n]));
            const alumnosConNota = nomina
              .map((a) =>
                promedioPonderado(
                  evals.map((e) => {
                    const n = notaBy.get(`${a.id}:${e.id}`);
                    return {
                      valor: n?.valor ?? null,
                      ausente: n?.ausente === 1 ? 1 : 0,
                      ponderacion: e.ponderacion,
                    };
                  }),
                ),
              )
              .filter((v): v is NonNullable<typeof v> => v !== null);
            if (alumnosConNota.length === 0) return null;
            const suma = alumnosConNota.reduce((acc, v) => acc.plus(v), new Decimal(0));
            const promedio = suma.div(alumnosConNota.length);
            return {
              id: curso.id,
              nombre: curso.nombre,
              corto: truncar(curso.nombre),
              promedio: Number(promedio.toDecimalPlaces(2).toString()),
            } satisfies PromedioCurso;
          }),
        );
        if (!cancelled) setPromedios(filas.filter((f): f is PromedioCurso => f !== null));
      } catch {
        if (!cancelled) setPromedios([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activo, cursos]);

  const diaHoy = useMemo(() => Temporal.PlainDate.from(hoy).dayOfWeek, [hoy]);
  const hastaProximas = useMemo(
    () => Temporal.PlainDate.from(hoy).add({ days: VENTANA_PROXIMAS_DIAS }).toString(),
    [hoy],
  );

  const bloquesHoy = useMemo(
    () =>
      horarios
        .filter((h) => h.dia_semana === diaHoy)
        .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [diaHoy, horarios],
  );
  const eventosHoy = useMemo(
    () => eventos.filter((e) => e.fecha === hoy).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? "")),
    [eventos, hoy],
  );
  const evalsHoy = useMemo(
    () =>
      evaluaciones
        .filter((e) => e.fecha === hoy)
        .sort((a, b) => a.titulo.localeCompare(b.titulo, "es")),
    [evaluaciones, hoy],
  );
  const proximas = useMemo(
    () =>
      evaluaciones
        .filter((e) => e.fecha > hoy && e.fecha <= hastaProximas)
        .sort((a, b) => (a.fecha === b.fecha ? a.titulo.localeCompare(b.titulo, "es") : a.fecha.localeCompare(b.fecha))),
    [evaluaciones, hastaProximas, hoy],
  );

  const tiposEventoBy = useMemo(() => {
    const map = new Map<number, TipoEvento>();
    for (const t of tiposEvento) map.set(t.id, t);
    return map;
  }, [tiposEvento]);
  const tiposEvalBy = useMemo(() => {
    const map = new Map<number, TipoEvaluacion>();
    for (const t of tiposEval) map.set(t.id, t);
    return map;
  }, [tiposEval]);

  return (
    <section className="space-y-8 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <img
          src="/logo.jpeg"
          alt="Tomás Mariano Sanchez Tejerina — English Teacher"
          className="h-16 w-16 shrink-0 rounded-full object-cover"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-sky">
            {activo ? `Año lectivo ${activo.anio}` : "Sin año lectivo activo"}
          </p>
          <h2 className="font-serif text-2xl text-navy">Hoy, {formatFechaConDia(hoy)}</h2>
          <p className="mt-1 text-sm text-sky">
            {activo
              ? "Qué toca hoy y las evaluaciones de los próximos 14 días. El año se cambia en la cabecera."
              : "Activá un año lectivo en la cabecera para ver el día."}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-sky">Cargando el día…</p>
      ) : !activo ? (
        <p className="border border-navy/15 bg-cream/40 px-4 py-3 text-sm text-navy">
          No hay año lectivo activo. Creá o activá uno en la cabecera.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 border border-navy/15 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-navy">Horario de hoy</h3>
                <Link to="/horarios" className={`${btnLink} no-underline`}>
                  Ver semana
                </Link>
              </div>
              {bloquesHoy.length === 0 ? (
                <p className="text-sm text-sky">Hoy no hay bloques cargados en el horario.</p>
              ) : (
                <ul className="space-y-2">
                  {bloquesHoy.map((h) => {
                    const curso = etiquetaCurso(cursos, h.id_curso);
                    return (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 border border-navy/10 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-navy">
                            {h.hora_inicio}–{h.hora_fin} · {curso}
                          </p>
                          {h.aula ? <p className="text-xs text-sky">Aula {h.aula}</p> : null}
                        </div>
                        <span className="flex gap-1">
                          <Link
                            to={`/asistencia?curso=${h.id_curso}&fecha=${hoy}`}
                            className={`${btnLink} no-underline`}
                          >
                            Pase de lista
                          </Link>
                          <Link to={`/cursos/${h.id_curso}`} className={`${btnLink} no-underline`}>
                            Curso
                          </Link>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-3 border border-navy/15 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium text-navy">Hoy en el calendario</h3>
                <Link to="/calendario" className={`${btnLink} no-underline`}>
                  Calendario
                </Link>
              </div>
              {eventosHoy.length === 0 && evalsHoy.length === 0 ? (
                <p className="text-sm text-sky">No hay eventos ni evaluaciones para hoy.</p>
              ) : (
                <ul className="space-y-2">
                  {eventosHoy.map((e) => (
                    <li key={`evt-${e.id}`} className="border border-navy/10 px-3 py-2 text-sm">
                      <p className="font-medium text-navy">
                        {tiposEventoBy.get(e.id_tipo_evento)?.nombre ?? "Evento"}
                        {e.hora ? ` · ${e.hora}` : ""} · {e.titulo}
                      </p>
                      <p className="text-xs text-sky">{etiquetaCurso(cursos, e.id_curso)}</p>
                    </li>
                  ))}
                  {evalsHoy.map((e) => (
                    <li key={`eval-${e.id}`} className="border border-navy/10 px-3 py-2 text-sm">
                      <p className="font-medium text-navy">
                        {tiposEvalBy.get(e.id_tipo_evaluacion)?.nombre ?? "Evaluación"} · {e.titulo}
                      </p>
                      <p className="text-xs text-sky">{etiquetaCurso(cursos, e.id_curso)}</p>
                      <Link to="/evaluaciones" className={`${btnLink} no-underline`}>
                        Ir a evaluaciones
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-3 border border-navy/15 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-navy">Próximas evaluaciones</h3>
              <Link to="/evaluaciones" className={`${btnLink} no-underline`}>
                Ver todas
              </Link>
            </div>
            <p className="text-xs text-sky">Hasta {formatFecha(hastaProximas)} (14 días).</p>
            {proximas.length === 0 ? (
              <p className="text-sm text-sky">No hay evaluaciones en los próximos 14 días.</p>
            ) : (
              <ul className="space-y-2">
                {proximas.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-navy/10 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-navy">
                        {formatFechaConDia(e.fecha)} · {tiposEvalBy.get(e.id_tipo_evaluacion)?.nombre ?? "Evaluación"}{" "}
                        · {e.titulo}
                      </p>
                      <p className="text-xs text-sky">{etiquetaCurso(cursos, e.id_curso)}</p>
                    </div>
                    <Link to={`/cursos/${e.id_curso}`} className={`${btnLink} no-underline`}>
                      Curso
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 border border-navy/15 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-navy">Promedio por curso</h3>
              <Link to="/notas" className={`${btnLink} no-underline`}>
                Planillas
              </Link>
            </div>
            {cursos.length === 0 ? (
              <p className="text-sm text-sky">Cargá un curso para ver promedios.</p>
            ) : promedios === null ? (
              <p className="text-sm text-sky">Calculando promedios…</p>
            ) : promedios.length === 0 ? (
              <p className="text-sm text-sky">
                Todavía no hay notas numéricas para armar el gráfico. El resumen de arriba no
                depende de esto.
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={promedios} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#8b9da7" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="corto" tick={{ fill: "#0b2540", fontSize: 12 }} />
                    <YAxis domain={[1, 10]} tick={{ fill: "#0b2540", fontSize: 12 }} width={32} />
                    <Tooltip
                      formatter={(value) => [
                        formatDecimal(new Decimal(typeof value === "number" ? value : Number(value)), 2),
                        "Promedio",
                      ]}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as PromedioCurso | undefined;
                        return row?.nombre ?? "";
                      }}
                    />
                    <Bar dataKey="promedio" fill="#0b2540" name="Promedio" maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to="/escuelas" className={atajoInicio}>
          Escuelas y materias
        </Link>
        <Link to="/cursos" className={atajoInicio}>
          Cursos
        </Link>
        <Link to="/alumnos" className={atajoInicio}>
          Alumnos
        </Link>
        <Link to="/horarios" className={atajoInicio}>
          Horarios
        </Link>
        <Link to="/evaluaciones" className={atajoInicio}>
          Evaluaciones
        </Link>
        <Link to="/notas" className={atajoInicio}>
          Notas
        </Link>
        <Link to="/asistencia" className={atajoInicio}>
          Asistencia
        </Link>
        <Link to="/calendario" className={atajoInicio}>
          Calendario
        </Link>
        <Link to="/observaciones" className={atajoInicio}>
          Observaciones
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-sky">
        {dbStatus ? (
          <p>
            Listo · {dbStatus.tables} tablas · FK {dbStatus.foreign_keys}
          </p>
        ) : null}
        <button type="button" className={`${btnLink} text-xs`} onClick={abrirReleer}>
          Alcance de este cuaderno
        </button>
      </div>
    </section>
  );
}

export default Inicio;
