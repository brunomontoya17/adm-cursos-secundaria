import { Temporal } from "@js-temporal/polyfill";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  DIAS_SEMANA,
  eventoWriteSchema,
  type Curso,
  type Evaluacion,
  type Evento,
  type EventoWrite,
  type TipoEvaluacion,
  type TipoEvento,
} from "../api";
import { confirmAction } from "../feedback";
import {
  blankToNull,
  btnDanger,
  btnGhost,
  btnLink,
  btnPrimary,
  formatFecha,
  hoyIso,
  inputClass,
  toHhMm,
} from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function pideCurso(tipos: TipoEvento[], idTipo: string): boolean {
  const codigo = tipos.find((t) => String(t.id) === idTipo)?.codigo;
  return codigo === "tema" || codigo === "entrega";
}

function mesGrid(year: number, month: number): Temporal.PlainDate[] {
  const first = Temporal.PlainDate.from({ year, month, day: 1 });
  let d = first.subtract({ days: first.dayOfWeek - 1 });
  const cells: Temporal.PlainDate[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(d);
    d = d.add({ days: 1 });
  }
  return cells;
}

type FormState = {
  editingId: number | null;
  idCurso: string;
  idTipo: string;
  titulo: string;
  fecha: string;
  hora: string;
  descripcion: string;
};

function formVacio(tipos: TipoEvento[], fecha = hoyIso()): FormState {
  return {
    editingId: null,
    idCurso: "",
    idTipo: tipos[0] ? String(tipos[0].id) : "",
    titulo: "",
    fecha,
    hora: "",
    descripcion: "",
  };
}

function payloadFromForm(form: FormState): EventoWrite {
  return {
    id_curso: form.idCurso ? Number(form.idCurso) : null,
    id_tipo_evento: Number(form.idTipo),
    fecha: form.fecha,
    hora: blankToNull(toHhMm(form.hora)),
    titulo: form.titulo.trim(),
    descripcion: blankToNull(form.descripcion),
  };
}

function EventoForm({
  cursos,
  tipos,
  cursoFijo,
  form,
  setForm,
  formError,
  saving,
  cursoObligatorio,
  onSubmit,
  onCancel,
}: {
  cursos: Curso[];
  tipos: TipoEvento[];
  cursoFijo: boolean;
  form: FormState;
  setForm: (next: FormState) => void;
  formError: string | null;
  saving: boolean;
  cursoObligatorio: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
      <h3 className="text-sm font-medium text-navy">
        {form.editingId ? "Editar evento" : "Nuevo evento"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Tipo">
          <select
            required
            className={inputClass}
            value={form.idTipo}
            onChange={(e) => setForm({ ...form, idTipo: e.target.value })}
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Field>
        {!cursoFijo && (
          <Field label={cursoObligatorio ? "Curso" : "Curso (opcional)"}>
            <select
              required={cursoObligatorio}
              className={inputClass}
              value={form.idCurso}
              onChange={(e) => setForm({ ...form, idCurso: e.target.value })}
            >
              <option value="">{cursoObligatorio ? "Elegir curso…" : "Todos los dictados"}</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Fecha">
          <input
            required
            type="date"
            className={inputClass}
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
        </Field>
        <Field label="Hora (opcional)">
          <input
            type="time"
            className={inputClass}
            value={form.hora}
            onChange={(e) => setForm({ ...form, hora: e.target.value })}
          />
        </Field>
        <Field label="Título">
          <input
            required
            className={inputClass}
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="present perfect"
          />
        </Field>
        <Field label="Descripción">
          <input
            className={inputClass}
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Opcional"
          />
        </Field>
      </div>
      {formError && <p className="text-sm text-crimson">{formError}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btnPrimary} disabled={saving}>
          {form.editingId ? "Guardar cambios" : "Agregar evento"}
        </button>
        {form.editingId && (
          <button type="button" className={btnGhost} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function EventosCursoPanel({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  const [tipos, setTipos] = useState<TipoEvento[]>([]);
  const [rows, setRows] = useState<Evento[]>([]);
  const [form, setForm] = useState<FormState>(formVacio([]));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [t, ev] = await Promise.all([
        api.listTiposEvento(),
        api.listEventosDeCurso(cursoId),
      ]);
      setTipos(t);
      setRows(ev);
    } catch {
      /* Swal */
    }
  }, [cursoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      idCurso: String(cursoId),
      idTipo: prev.idTipo || (tipos[0] ? String(tipos[0].id) : ""),
    }));
  }, [cursoId, tipos]);

  const cursoObligatorio = pideCurso(tipos, form.idTipo);

  function resetForm() {
    setForm({ ...formVacio(tipos), idCurso: String(cursoId) });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (cursoObligatorio && !form.idCurso) {
      setFormError("Tema y entrega van siempre con un curso.");
      return;
    }
    const parsed = eventoWriteSchema.safeParse(payloadFromForm(form));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateEvento(form.editingId, parsed.data);
        toast.success("Evento actualizado");
      } else {
        await api.createEvento(parsed.data);
        toast.success("Evento guardado");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Evento) {
    const ok = await confirmAction({
      title: "¿Borrar este evento?",
      text: `${row.titulo} — ${cursoNombre} — ${formatFecha(row.fecha)}`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEvento(row.id);
      toast.success("Evento borrado");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoEvento>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);

  return (
    <div className="space-y-4 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Eventos de este dictado</h3>
        <Link to="/calendario" className={`${btnLink} no-underline`}>
          Ver el mes
        </Link>
      </div>
      <EventoForm
        cursos={[]}
        tipos={tipos}
        cursoFijo
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        cursoObligatorio
        onSubmit={onSubmit}
        onCancel={resetForm}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-sky">Sin eventos. Ejemplo: tema present perfect.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-navy">
                {formatFecha(e.fecha)}
                {e.hora ? ` ${e.hora}` : ""} · {tiposBy.get(e.id_tipo_evento)?.nombre ?? "Evento"}:{" "}
                {e.titulo}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={btnLink}
                  onClick={() => {
                    setForm({
                      editingId: e.id,
                      idCurso: String(cursoId),
                      idTipo: String(e.id_tipo_evento),
                      titulo: e.titulo,
                      fecha: e.fecha,
                      hora: e.hora ?? "",
                      descripcion: e.descripcion ?? "",
                    });
                    setFormError(null);
                  }}
                >
                  Editar
                </button>
                <button type="button" className={btnDanger} onClick={() => void onDelete(e)}>
                  Borrar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Calendario() {
  const { activo } = useAnioLectivo();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [tiposEvt, setTiposEvt] = useState<TipoEvento[]>([]);
  const [tiposEval, setTiposEval] = useState<TipoEvaluacion[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [evals, setEvals] = useState<Evaluacion[]>([]);
  const [form, setForm] = useState<FormState>(formVacio([]));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vista, setVista] = useState<{ year: number; month: number }>(() => {
    const hoy = Temporal.Now.plainDateISO();
    return { year: hoy.year, month: hoy.month };
  });

  const reload = useCallback(async () => {
    if (!activo) {
      setCursos([]);
      setEventos([]);
      setEvals([]);
      return;
    }
    try {
      const [dictados, te, tv, ev, evaluaciones] = await Promise.all([
        api.listCursos(activo.id),
        api.listTiposEvento(),
        api.listTiposEvaluacion(),
        api.listEventos(activo.id),
        api.listEvaluaciones(activo.id),
      ]);
      setCursos(dictados);
      setTiposEvt(te);
      setTiposEval(tv);
      setEventos(ev);
      setEvals(evaluaciones);
    } catch {
      /* Swal */
    }
  }, [activo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!activo) return;
    const hoy = Temporal.Now.plainDateISO();
    if (hoy.year === activo.anio) {
      setVista({ year: hoy.year, month: hoy.month });
    } else {
      setVista({ year: activo.anio, month: 3 });
    }
  }, [activo]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      idTipo: prev.idTipo || (tiposEvt[0] ? String(tiposEvt[0].id) : ""),
    }));
  }, [tiposEvt]);

  const cursosBy = useMemo(() => {
    const map = new Map<number, Curso>();
    for (const c of cursos) map.set(c.id, c);
    return map;
  }, [cursos]);

  const tiposEvtBy = useMemo(() => {
    const map = new Map<number, TipoEvento>();
    for (const t of tiposEvt) map.set(t.id, t);
    return map;
  }, [tiposEvt]);

  const tiposEvalBy = useMemo(() => {
    const map = new Map<number, TipoEvaluacion>();
    for (const t of tiposEval) map.set(t.id, t);
    return map;
  }, [tiposEval]);

  const cursoObligatorio = pideCurso(tiposEvt, form.idTipo);
  const celdas = useMemo(() => mesGrid(vista.year, vista.month), [vista]);

  type ItemDia =
    | { kind: "evento"; row: Evento }
    | { kind: "eval"; row: Evaluacion };

  const porFecha = useMemo(() => {
    const map = new Map<string, ItemDia[]>();
    const add = (fecha: string, item: ItemDia) => {
      const list = map.get(fecha) ?? [];
      list.push(item);
      map.set(fecha, list);
    };
    for (const e of eventos) add(e.fecha, { kind: "evento", row: e });
    for (const e of evals) add(e.fecha, { kind: "eval", row: e });
    return map;
  }, [eventos, evals]);

  const delMes = useMemo(() => {
    const prefix = `${String(vista.year).padStart(4, "0")}-${String(vista.month).padStart(2, "0")}`;
    const items: ItemDia[] = [];
    for (const [fecha, list] of porFecha) {
      if (fecha.startsWith(prefix)) items.push(...list);
    }
    items.sort((a, b) => {
      const fa = a.kind === "evento" ? a.row.fecha : a.row.fecha;
      const fb = b.kind === "evento" ? b.row.fecha : b.row.fecha;
      if (fa !== fb) return fa.localeCompare(fb);
      const ha = a.kind === "evento" ? (a.row.hora ?? "99:99") : "99:99";
      const hb = b.kind === "evento" ? (b.row.hora ?? "99:99") : "99:99";
      return ha.localeCompare(hb);
    });
    return items;
  }, [porFecha, vista]);

  function resetForm() {
    setForm(formVacio(tiposEvt, form.fecha || hoyIso()));
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (cursoObligatorio && !form.idCurso) {
      setFormError("Tema y entrega van siempre con un curso.");
      return;
    }
    const parsed = eventoWriteSchema.safeParse(payloadFromForm(form));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateEvento(form.editingId, parsed.data);
        toast.success("Evento actualizado");
      } else {
        await api.createEvento(parsed.data);
        toast.success("Evento guardado");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Evento) {
    const curso = row.id_curso ? (cursosBy.get(row.id_curso)?.nombre ?? "") : "todos los dictados";
    const ok = await confirmAction({
      title: "¿Borrar este evento?",
      text: `${row.titulo} — ${curso} — ${formatFecha(row.fecha)}`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEvento(row.id);
      toast.success("Evento borrado");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  function cargarEvento(e: Evento) {
    setForm({
      editingId: e.id,
      idCurso: e.id_curso ? String(e.id_curso) : "",
      idTipo: String(e.id_tipo_evento),
      titulo: e.titulo,
      fecha: e.fecha,
      hora: e.hora ?? "",
      descripcion: e.descripcion ?? "",
    });
    setFormError(null);
  }

  function mesAnterior() {
    const d = Temporal.PlainDate.from({ year: vista.year, month: vista.month, day: 1 }).subtract({
      months: 1,
    });
    setVista({ year: d.year, month: d.month });
  }

  function mesSiguiente() {
    const d = Temporal.PlainDate.from({ year: vista.year, month: vista.month, day: 1 }).add({
      months: 1,
    });
    setVista({ year: d.year, month: d.month });
  }

  const hoy = hoyIso();

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Calendario</h2>
        <p className="mt-1 text-sm text-sky">
          Temas, entregas, reuniones, juntas y actos. Las evaluaciones se ven acá de solo lectura;
          se cargan en Evaluaciones.
        </p>
      </div>

      {!activo ? (
        <p className="text-sm text-sky">Activá un año lectivo para ver el mes.</p>
      ) : (
        <>
          <EventoForm
            cursos={cursos}
            tipos={tiposEvt}
            cursoFijo={false}
            form={form}
            setForm={setForm}
            formError={formError}
            saving={saving}
            cursoObligatorio={cursoObligatorio}
            onSubmit={onSubmit}
            onCancel={resetForm}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={btnGhost} onClick={mesAnterior}>
              ← Anterior
            </button>
            <h3 className="font-serif text-xl text-navy">
              {MESES[vista.month - 1]} {vista.year}
            </h3>
            <button type="button" className={btnGhost} onClick={mesSiguiente}>
              Siguiente →
            </button>
          </div>

          <div className="overflow-x-auto border border-navy/15">
            <div className="grid min-w-[40rem] grid-cols-7">
              {DIAS_SEMANA.map((d) => (
                <div
                  key={d.id}
                  className="border-b border-navy/15 bg-cream/60 px-2 py-1 text-xs font-medium uppercase tracking-wide text-sky"
                >
                  {d.corto}
                </div>
              ))}
              {celdas.map((d) => {
                const iso = d.toString();
                const inMes = d.month === vista.month;
                const items = porFecha.get(iso) ?? [];
                const visibles = items.slice(0, 3);
                const extra = items.length - visibles.length;
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`min-h-[6.5rem] border-b border-r border-navy/10 px-1.5 py-1 text-left align-top ${
                      inMes ? "bg-paper" : "bg-cream/30 text-sky"
                    } ${iso === hoy ? "ring-1 ring-inset ring-navy" : ""}`}
                    onClick={() => setForm((prev) => ({ ...prev, fecha: iso, editingId: null }))}
                  >
                    <div className="text-xs font-medium text-navy">{d.day}</div>
                    <ul className="mt-1 space-y-0.5">
                      {visibles.map((item) =>
                        item.kind === "evento" ? (
                          <li key={`e-${item.row.id}`}>
                            <span
                              className="block truncate bg-cream px-1 text-[11px] text-navy"
                              title={item.row.titulo}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                cargarEvento(item.row);
                              }}
                            >
                              {tiposEvtBy.get(item.row.id_tipo_evento)?.nombre ?? "Evento"}:{" "}
                              {item.row.titulo}
                            </span>
                          </li>
                        ) : (
                          <li key={`v-${item.row.id}`}>
                            <Link
                              to="/evaluaciones"
                              className="block truncate border border-navy/20 px-1 text-[11px] text-navy no-underline"
                              title={item.row.titulo}
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              {tiposEvalBy.get(item.row.id_tipo_evaluacion)?.nombre ?? "Eval."}:{" "}
                              {item.row.titulo}
                            </Link>
                          </li>
                        ),
                      )}
                      {extra > 0 && <li className="text-[11px] text-sky">+{extra}</li>}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-navy">Lista del mes</h3>
            {delMes.length === 0 ? (
              <p className="text-sm text-sky">Nada cargado este mes.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {delMes.map((item) =>
                  item.kind === "evento" ? (
                    <li
                      key={`le-${item.row.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <span className="text-navy">
                        {formatFecha(item.row.fecha)}
                        {item.row.hora ? ` ${item.row.hora}` : ""} ·{" "}
                        {tiposEvtBy.get(item.row.id_tipo_evento)?.nombre ?? "Evento"}:{" "}
                        {item.row.titulo}
                        {item.row.id_curso
                          ? ` — ${cursosBy.get(item.row.id_curso)?.nombre ?? ""}`
                          : " — todos los dictados"}
                      </span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          className={btnLink}
                          onClick={() => cargarEvento(item.row)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => void onDelete(item.row)}
                        >
                          Borrar
                        </button>
                      </span>
                    </li>
                  ) : (
                    <li key={`lv-${item.row.id}`} className="text-navy">
                      {formatFecha(item.row.fecha)} ·{" "}
                      {tiposEvalBy.get(item.row.id_tipo_evaluacion)?.nombre ?? "Evaluación"}:{" "}
                      {item.row.titulo} — {cursosBy.get(item.row.id_curso)?.nombre ?? ""}{" "}
                      <Link to="/evaluaciones" className={`${btnLink} no-underline`}>
                        ver
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default Calendario;
