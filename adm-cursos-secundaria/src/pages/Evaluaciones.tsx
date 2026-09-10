import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  evaluacionWriteSchema,
  type Curso,
  type Evaluacion,
  type EvaluacionWrite,
  type TipoEvaluacion,
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
  normalizeDecimalText,
} from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";
import { DataTable, tableFeaturesBase } from "../ui/DataTable";

const helper = createColumnHelper<typeof tableFeaturesBase, EvalRow>();
const EMPTY: EvalRow[] = [];

type EvalRow = Evaluacion & {
  curso: string;
  tipo: string;
  origen: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function esRecuperatorio(tipos: TipoEvaluacion[], idTipo: string): boolean {
  return tipos.find((t) => String(t.id) === idTipo)?.codigo === "recuperatorio";
}

function sugerirTitulo(
  tipos: TipoEvaluacion[],
  idTipo: string,
  existentes: Evaluacion[],
  idCurso: number,
  editingId: number | null,
): string {
  const tipo = tipos.find((t) => String(t.id) === idTipo);
  if (!tipo) return "";
  const n =
    existentes.filter(
      (e) => e.id_curso === idCurso && e.id_tipo_evaluacion === tipo.id && e.id !== editingId,
    ).length + 1;
  return `${tipo.nombre} ${n}`;
}

type FormState = {
  editingId: number | null;
  idCurso: string;
  idTipo: string;
  titulo: string;
  fecha: string;
  tema: string;
  ponderacion: string;
  idOrigen: string;
};

function formVacio(cursos: Curso[], tipos: TipoEvaluacion[]): FormState {
  return {
    editingId: null,
    idCurso: cursos[0] ? String(cursos[0].id) : "",
    idTipo: tipos[0] ? String(tipos[0].id) : "",
    titulo: "",
    fecha: hoyIso(),
    tema: "",
    ponderacion: "1",
    idOrigen: "",
  };
}

function EvaluacionForm({
  cursos,
  tipos,
  origenes,
  cursoFijo,
  form,
  setForm,
  formError,
  saving,
  recu,
  onSubmit,
  onCancel,
}: {
  cursos: Curso[];
  tipos: TipoEvaluacion[];
  origenes: Evaluacion[];
  cursoFijo: boolean;
  form: FormState;
  setForm: (next: FormState) => void;
  formError: string | null;
  saving: boolean;
  recu: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
      <h3 className="text-sm font-medium text-navy">
        {form.editingId ? "Editar evaluación" : "Nueva evaluación"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!cursoFijo && (
          <Field label="Curso">
            <select
              required
              className={inputClass}
              value={form.idCurso}
              onChange={(e) => setForm({ ...form, idCurso: e.target.value, idOrigen: "" })}
            >
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
        )}
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
        <Field label="Fecha">
          <input
            required
            type="date"
            className={inputClass}
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
        </Field>
        <Field label="Título">
          <input
            required
            className={inputClass}
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Escrito 1"
          />
        </Field>
        <Field label="Tema">
          <input
            className={inputClass}
            value={form.tema}
            onChange={(e) => setForm({ ...form, tema: e.target.value })}
            placeholder="Opcional"
          />
        </Field>
        <Field label="Ponderación">
          <input
            required
            className={inputClass}
            value={form.ponderacion}
            onChange={(e) => setForm({ ...form, ponderacion: e.target.value })}
            placeholder="1"
          />
        </Field>
        {recu && (
          <Field label="Recupera de">
            <select
              required
              className={inputClass}
              value={form.idOrigen}
              onChange={(e) => setForm({ ...form, idOrigen: e.target.value })}
            >
              <option value="">
                {origenes.length === 0 ? "No hay evaluaciones en este curso" : "Elegir origen…"}
              </option>
              {origenes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo} · {formatFecha(e.fecha)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {formError && <p className="text-sm text-crimson">{formError}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={btnPrimary}
          disabled={saving || (!cursoFijo && cursos.length === 0)}
        >
          {form.editingId ? "Guardar cambios" : "Agregar evaluación"}
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

function payloadFromForm(form: FormState, recu: boolean): EvaluacionWrite {
  return {
    id_curso: Number(form.idCurso),
    id_tipo_evaluacion: Number(form.idTipo),
    id_evaluacion_origen: recu && form.idOrigen ? Number(form.idOrigen) : null,
    titulo: form.titulo.trim(),
    fecha: form.fecha,
    tema: blankToNull(form.tema),
    ponderacion: normalizeDecimalText(form.ponderacion) || "1",
  };
}

export function EvaluacionesCursoPanel({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  const [tipos, setTipos] = useState<TipoEvaluacion[]>([]);
  const [rows, setRows] = useState<Evaluacion[]>([]);
  const [form, setForm] = useState<FormState>(formVacio([], []));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prevSugerido = useRef("");

  const reload = useCallback(async () => {
    try {
      const [t, evals] = await Promise.all([
        api.listTiposEvaluacion(),
        api.listEvaluacionesDeCurso(cursoId),
      ]);
      setTipos(t);
      setRows(evals);
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

  const recu = esRecuperatorio(tipos, form.idTipo);
  const origenes = rows.filter((e) => e.id !== form.editingId);
  const suggested = sugerirTitulo(tipos, form.idTipo, rows, cursoId, form.editingId);

  useEffect(() => {
    if (!suggested) return;
    setForm((current) => {
      if (current.titulo === "" || current.titulo === prevSugerido.current) {
        prevSugerido.current = suggested;
        return { ...current, titulo: suggested };
      }
      return current;
    });
    if (prevSugerido.current === "") prevSugerido.current = suggested;
  }, [suggested]);

  function resetForm() {
    prevSugerido.current = "";
    setForm({ ...formVacio([], tipos), idCurso: String(cursoId) });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = evaluacionWriteSchema.safeParse(payloadFromForm(form, recu));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    if (recu && !form.idOrigen) {
      setFormError("Elegí la evaluación que se recupera.");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateEvaluacion(form.editingId, parsed.data);
        toast.success("Evaluación actualizada");
      } else {
        await api.createEvaluacion(parsed.data);
        toast.success("Evaluación guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Evaluacion) {
    const ok = await confirmAction({
      title: "¿Borrar esta evaluación?",
      text: `${row.titulo} — ${cursoNombre} — ${formatFecha(row.fecha)}. Se borran las notas.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEvaluacion(row.id);
      toast.success("Evaluación borrada");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoEvaluacion>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);

  return (
    <div className="space-y-4 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Evaluaciones de este dictado</h3>
        <Link to="/evaluaciones" className={`${btnLink} no-underline`}>
          Ver todas
        </Link>
      </div>
      <EvaluacionForm
        cursos={[]}
        tipos={tipos}
        origenes={origenes}
        cursoFijo
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        recu={recu}
        onSubmit={onSubmit}
        onCancel={resetForm}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-sky">Todavía no hay evaluaciones. Ejemplo: Escrito 1 — 12/05.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border border-navy/10 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-navy">
                  {row.titulo} · {formatFecha(row.fecha)}
                </p>
                <p className="text-xs text-sky">
                  {tiposBy.get(row.id_tipo_evaluacion)?.nombre ?? "—"}
                  {row.tema ? ` · ${row.tema}` : ""} · pond. {row.ponderacion}
                </p>
              </div>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={btnLink}
                  onClick={() => {
                    prevSugerido.current = row.titulo;
                    setForm({
                      editingId: row.id,
                      idCurso: String(cursoId),
                      idTipo: String(row.id_tipo_evaluacion),
                      titulo: row.titulo,
                      fecha: row.fecha,
                      tema: row.tema ?? "",
                      ponderacion: row.ponderacion,
                      idOrigen: row.id_evaluacion_origen ? String(row.id_evaluacion_origen) : "",
                    });
                    setFormError(null);
                  }}
                >
                  Editar
                </button>
                <button type="button" className={btnDanger} onClick={() => void onDelete(row)}>
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

function Evaluaciones() {
  const { activo } = useAnioLectivo();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [tipos, setTipos] = useState<TipoEvaluacion[]>([]);
  const [rows, setRows] = useState<Evaluacion[]>([]);
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [form, setForm] = useState<FormState>(formVacio([], []));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prevSugerido = useRef("");

  const cursosBy = useMemo(() => {
    const map = new Map<number, Curso>();
    for (const c of cursos) map.set(c.id, c);
    return map;
  }, [cursos]);
  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoEvaluacion>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);

  const reload = useCallback(async () => {
    try {
      const t = await api.listTiposEvaluacion();
      setTipos(t);
      if (!activo) {
        setCursos([]);
        setRows([]);
        return;
      }
      const [dictados, evals] = await Promise.all([
        api.listCursos(activo.id),
        api.listEvaluaciones(activo.id),
      ]);
      setCursos(dictados);
      setRows(evals);
    } catch {
      /* Swal */
    }
  }, [activo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      idCurso: prev.idCurso || (cursos[0] ? String(cursos[0].id) : ""),
      idTipo: prev.idTipo || (tipos[0] ? String(tipos[0].id) : ""),
    }));
  }, [cursos, tipos]);

  const recu = esRecuperatorio(tipos, form.idTipo);
  const origenes = rows.filter(
    (e) => String(e.id_curso) === form.idCurso && e.id !== form.editingId,
  );
  const suggested = sugerirTitulo(
    tipos,
    form.idTipo,
    rows,
    Number(form.idCurso),
    form.editingId,
  );

  useEffect(() => {
    if (!suggested) return;
    setForm((current) => {
      if (current.titulo === "" || current.titulo === prevSugerido.current) {
        prevSugerido.current = suggested;
        return { ...current, titulo: suggested };
      }
      return current;
    });
  }, [suggested]);

  function resetForm() {
    prevSugerido.current = "";
    setForm(formVacio(cursos, tipos));
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = evaluacionWriteSchema.safeParse(payloadFromForm(form, recu));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    if (recu && !form.idOrigen) {
      setFormError("Elegí la evaluación que se recupera.");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateEvaluacion(form.editingId, parsed.data);
        toast.success("Evaluación actualizada");
      } else {
        await api.createEvaluacion(parsed.data);
        toast.success("Evaluación guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Evaluacion) {
    const curso = cursosBy.get(row.id_curso)?.nombre ?? "curso";
    const ok = await confirmAction({
      title: "¿Borrar esta evaluación?",
      text: `${row.titulo} — ${curso} — ${formatFecha(row.fecha)}. Se borran las notas.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEvaluacion(row.id);
      toast.success("Evaluación borrada");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  function startEdit(row: Evaluacion) {
    prevSugerido.current = row.titulo;
    setForm({
      editingId: row.id,
      idCurso: String(row.id_curso),
      idTipo: String(row.id_tipo_evaluacion),
      titulo: row.titulo,
      fecha: row.fecha,
      tema: row.tema ?? "",
      ponderacion: row.ponderacion,
      idOrigen: row.id_evaluacion_origen ? String(row.id_evaluacion_origen) : "",
    });
    setFormError(null);
  }

  const tableRows: EvalRow[] = useMemo(
    () =>
      rows
        .filter((row) => {
          if (filtroCurso && String(row.id_curso) !== filtroCurso) return false;
          if (filtroTipo && String(row.id_tipo_evaluacion) !== filtroTipo) return false;
          return true;
        })
        .map((row) => {
          const origen = row.id_evaluacion_origen
            ? rows.find((e) => e.id === row.id_evaluacion_origen)
            : undefined;
          return {
            ...row,
            curso: cursosBy.get(row.id_curso)?.nombre ?? "—",
            tipo: tiposBy.get(row.id_tipo_evaluacion)?.nombre ?? "—",
            origen: origen ? origen.titulo : "—",
          };
        }),
    [cursosBy, filtroCurso, filtroTipo, rows, tiposBy],
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("fecha", {
          header: "Fecha",
          cell: (ctx) => formatFecha(ctx.getValue()),
        }),
        helper.accessor("titulo", { header: "Título" }),
        helper.accessor("curso", { header: "Curso" }),
        helper.accessor("tipo", { header: "Tipo" }),
        helper.accessor("ponderacion", { header: "Pond." }),
        helper.accessor("tema", {
          header: "Tema",
          cell: (ctx) => ctx.getValue() ?? "—",
        }),
        helper.accessor("origen", { header: "Origen" }),
        helper.display({
          id: "acciones",
          header: "",
          cell: (ctx) => {
            const row = ctx.row.original;
            return (
              <span className="flex justify-end gap-1">
                <Link to={`/cursos/${row.id_curso}`} className={`${btnLink} no-underline`}>
                  Curso
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
    [rows, cursos, tipos],
  );

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Evaluaciones</h2>
        <p className="mt-1 text-sm text-sky">
          {activo
            ? `Exámenes y trabajos de ${activo.anio}. El calendario de exámenes sale de acá, no de Eventos.`
            : "Elegí un año lectivo en la cabecera."}
        </p>
      </div>

      {cursos.length === 0 && activo && (
        <p className="border border-navy/15 bg-cream/40 px-4 py-3 text-sm text-navy">
          Primero cargá al menos un curso.{" "}
          <Link to="/cursos" className="underline">
            Ir a Cursos
          </Link>
        </p>
      )}

      <EvaluacionForm
        cursos={cursos}
        tipos={tipos}
        origenes={origenes}
        cursoFijo={false}
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        recu={recu}
        onSubmit={onSubmit}
        onCancel={resetForm}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-sky">
          Curso{" "}
          <select
            className={`${inputClass} w-auto`}
            value={filtroCurso}
            onChange={(e) => setFiltroCurso(e.target.value)}
          >
            <option value="">Todos</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-sky">
          Tipo{" "}
          <select
            className={`${inputClass} w-auto`}
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
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
            ? "Todavía no hay evaluaciones este año. Cargá la primera arriba."
            : "Sin año lectivo activo."
        }
      />
    </section>
  );
}

export default Evaluaciones;
