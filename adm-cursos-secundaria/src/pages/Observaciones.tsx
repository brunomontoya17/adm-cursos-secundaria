import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  observacionWriteSchema,
  type Alumno,
  type AlumnoCurso,
  type Curso,
  type Observacion,
  type ObservacionWrite,
  type TipoObservacion,
} from "../api";
import { confirmAction } from "../feedback";
import { btnDanger, btnGhost, btnLink, btnPrimary, formatFecha, hoyIso, inputClass } from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";
import { DataTable, tableFeaturesBase } from "../ui/DataTable";

const helper = createColumnHelper<typeof tableFeaturesBase, ObsRow>();
const EMPTY: ObsRow[] = [];

type ObsRow = Observacion & {
  alumno: string;
  curso: string;
  tipo: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function etiquetaPersona(row: Pick<Alumno, "apellido" | "nombre">): string {
  return `${row.apellido}, ${row.nombre}`;
}

type FormState = {
  editingId: number | null;
  idCurso: string;
  idAlumno: string;
  idTipo: string;
  fecha: string;
  texto: string;
};

function formVacio(cursos: Curso[], tipos: TipoObservacion[], alumnos: Alumno[]): FormState {
  return {
    editingId: null,
    idCurso: cursos[0] ? String(cursos[0].id) : "",
    idAlumno: alumnos[0] ? String(alumnos[0].id) : "",
    idTipo: tipos[0] ? String(tipos[0].id) : "",
    fecha: hoyIso(),
    texto: "",
  };
}

function payloadFromForm(form: FormState): ObservacionWrite {
  return {
    id_alumno: Number(form.idAlumno),
    id_curso: Number(form.idCurso),
    id_tipo_observacion: Number(form.idTipo),
    fecha: form.fecha,
    texto: form.texto.trim(),
  };
}

function ObservacionForm({
  cursos,
  alumnos,
  tipos,
  cursoFijo,
  alumnoFijo,
  form,
  setForm,
  formError,
  saving,
  onSubmit,
  onCancel,
}: {
  cursos: Curso[];
  alumnos: Alumno[];
  tipos: TipoObservacion[];
  cursoFijo: boolean;
  alumnoFijo: boolean;
  form: FormState;
  setForm: (next: FormState) => void;
  formError: string | null;
  saving: boolean;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
      <h3 className="text-sm font-medium text-navy">
        {form.editingId ? "Editar observación" : "Nueva observación"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!cursoFijo && (
          <Field label="Curso">
            <select
              required
              className={inputClass}
              value={form.idCurso}
              onChange={(e) => setForm({ ...form, idCurso: e.target.value, idAlumno: "" })}
            >
              <option value="">{cursos.length === 0 ? "Sin cursos" : "Elegir curso…"}</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!alumnoFijo && (
          <Field label="Alumno">
            <select
              required
              className={inputClass}
              value={form.idAlumno}
              onChange={(e) => setForm({ ...form, idAlumno: e.target.value })}
            >
              <option value="">
                {alumnos.length === 0 ? "Sin nómina en este curso" : "Elegir alumno…"}
              </option>
              {alumnos.map((a) => (
                <option key={a.id} value={a.id}>
                  {etiquetaPersona(a)}
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
      </div>
      <Field label="Texto">
        <textarea
          required
          className={`${inputClass} min-h-[4.5rem]`}
          value={form.texto}
          onChange={(e) => setForm({ ...form, texto: e.target.value })}
          placeholder="Seguimiento — habló con la familia…"
        />
      </Field>
      {formError && <p className="text-sm text-crimson">{formError}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={btnPrimary}
          disabled={
            saving ||
            (!cursoFijo && cursos.length === 0) ||
            (!alumnoFijo && alumnos.length === 0)
          }
        >
          {form.editingId ? "Guardar cambios" : "Agregar observación"}
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

export function ObservacionesCursoPanel({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  const [tipos, setTipos] = useState<TipoObservacion[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [rows, setRows] = useState<Observacion[]>([]);
  const [form, setForm] = useState<FormState>(formVacio([], [], []));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [t, nomina, obs] = await Promise.all([
        api.listTiposObservacion(),
        api.listAlumnosDeCurso(cursoId),
        api.listObservacionesDeCurso(cursoId),
      ]);
      setTipos(t);
      setAlumnos(nomina);
      setRows(obs);
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
      idAlumno: prev.idAlumno || (alumnos[0] ? String(alumnos[0].id) : ""),
      idTipo: prev.idTipo || (tipos[0] ? String(tipos[0].id) : ""),
    }));
  }, [alumnos, cursoId, tipos]);

  function resetForm() {
    setForm({ ...formVacio([], tipos, alumnos), idCurso: String(cursoId) });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = observacionWriteSchema.safeParse(payloadFromForm(form));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateObservacion(form.editingId, parsed.data);
        toast.success("Observación actualizada");
      } else {
        await api.createObservacion(parsed.data);
        toast.success("Observación guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Observacion) {
    const alumno = alumnos.find((a) => a.id === row.id_alumno);
    const ok = await confirmAction({
      title: "¿Borrar esta observación?",
      text: `${alumno ? etiquetaPersona(alumno) : "Alumno"} — ${cursoNombre} — ${formatFecha(row.fecha)}.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteObservacion(row.id);
      toast.success("Observación borrada");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoObservacion>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);
  const alumnosBy = useMemo(() => {
    const map = new Map<number, Alumno>();
    for (const a of alumnos) map.set(a.id, a);
    return map;
  }, [alumnos]);

  return (
    <div className="space-y-4 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Observaciones de este dictado</h3>
        <Link to="/observaciones" className={`${btnLink} no-underline`}>
          Ver todas
        </Link>
      </div>
      {alumnos.length === 0 ? (
        <p className="text-sm text-sky">Cargá la nómina para anotar observaciones.</p>
      ) : (
        <ObservacionForm
          cursos={[]}
          alumnos={alumnos}
          tipos={tipos}
          cursoFijo
          alumnoFijo={false}
          form={form}
          setForm={setForm}
          formError={formError}
          saving={saving}
          onSubmit={onSubmit}
          onCancel={resetForm}
        />
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-sky">Todavía no hay observaciones. Ejemplo: seguimiento — 09/09.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const alumno = alumnosBy.get(row.id_alumno);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 border border-navy/10 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-navy">
                    {alumno ? etiquetaPersona(alumno) : "Alumno"} · {formatFecha(row.fecha)}
                  </p>
                  <p className="text-xs text-sky">
                    {tiposBy.get(row.id_tipo_observacion)?.nombre ?? "—"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-navy">{row.texto}</p>
                </div>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className={btnLink}
                    onClick={() => {
                      setForm({
                        editingId: row.id,
                        idCurso: String(cursoId),
                        idAlumno: String(row.id_alumno),
                        idTipo: String(row.id_tipo_observacion),
                        fecha: row.fecha,
                        texto: row.texto,
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
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ObservacionesAlumnoPanel({
  alumno,
  cursos,
}: {
  alumno: Alumno;
  cursos: Curso[];
}) {
  const { activo } = useAnioLectivo();
  const [tipos, setTipos] = useState<TipoObservacion[]>([]);
  const [rows, setRows] = useState<Observacion[]>([]);
  const [form, setForm] = useState<FormState>(formVacio(cursos, [], []));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!activo) {
      setRows([]);
      return;
    }
    try {
      const [t, obs] = await Promise.all([
        api.listTiposObservacion(),
        api.listObservacionesDeAlumno(alumno.id, activo.id),
      ]);
      setTipos(t);
      setRows(obs);
    } catch {
      /* Swal */
    }
  }, [activo, alumno.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      idAlumno: String(alumno.id),
      idCurso: prev.idCurso || (cursos[0] ? String(cursos[0].id) : ""),
      idTipo: prev.idTipo || (tipos[0] ? String(tipos[0].id) : ""),
    }));
  }, [alumno.id, cursos, tipos]);

  function resetForm() {
    setForm({ ...formVacio(cursos, tipos, []), idAlumno: String(alumno.id) });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = observacionWriteSchema.safeParse(payloadFromForm(form));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateObservacion(form.editingId, parsed.data);
        toast.success("Observación actualizada");
      } else {
        await api.createObservacion(parsed.data);
        toast.success("Observación guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Observacion) {
    const curso = cursos.find((c) => c.id === row.id_curso)?.nombre ?? "curso";
    const ok = await confirmAction({
      title: "¿Borrar esta observación?",
      text: `${etiquetaPersona(alumno)} — ${curso} — ${formatFecha(row.fecha)}.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteObservacion(row.id);
      toast.success("Observación borrada");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoObservacion>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);
  const cursosBy = useMemo(() => {
    const map = new Map<number, Curso>();
    for (const c of cursos) map.set(c.id, c);
    return map;
  }, [cursos]);

  return (
    <div className="space-y-3 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-navy">
          Observaciones de {etiquetaPersona(alumno)}
          {activo ? ` · ${activo.anio}` : ""}
        </h3>
        <Link
          to={`/observaciones?alumno=${alumno.id}`}
          className={`${btnLink} no-underline`}
        >
          Ver en listado
        </Link>
      </div>
      {cursos.length === 0 ? (
        <p className="text-sm text-sky">Inscribilo en un dictado de este año para anotar.</p>
      ) : (
        <ObservacionForm
          cursos={cursos}
          alumnos={[]}
          tipos={tipos}
          cursoFijo={false}
          alumnoFijo
          form={form}
          setForm={setForm}
          formError={formError}
          saving={saving}
          onSubmit={onSubmit}
          onCancel={resetForm}
        />
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-sky">Todavía no hay observaciones de esta persona este año.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-2 border border-navy/10 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-navy">
                  {cursosBy.get(row.id_curso)?.nombre ?? "Curso"} · {formatFecha(row.fecha)}
                </p>
                <p className="text-xs text-sky">
                  {tiposBy.get(row.id_tipo_observacion)?.nombre ?? "—"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-navy">{row.texto}</p>
              </div>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={btnLink}
                  onClick={() => {
                    setForm({
                      editingId: row.id,
                      idCurso: String(row.id_curso),
                      idAlumno: String(alumno.id),
                      idTipo: String(row.id_tipo_observacion),
                      fecha: row.fecha,
                      texto: row.texto,
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

function Observaciones() {
  const { activo } = useAnioLectivo();
  const [searchParams] = useSearchParams();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [inscripciones, setInscripciones] = useState<AlumnoCurso[]>([]);
  const [tipos, setTipos] = useState<TipoObservacion[]>([]);
  const [rows, setRows] = useState<Observacion[]>([]);
  const [filtroCurso, setFiltroCurso] = useState(searchParams.get("curso") ?? "");
  const [filtroAlumno, setFiltroAlumno] = useState(searchParams.get("alumno") ?? "");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [form, setForm] = useState<FormState>(formVacio([], [], []));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cursosBy = useMemo(() => {
    const map = new Map<number, Curso>();
    for (const c of cursos) map.set(c.id, c);
    return map;
  }, [cursos]);
  const alumnosBy = useMemo(() => {
    const map = new Map<number, Alumno>();
    for (const a of alumnos) map.set(a.id, a);
    return map;
  }, [alumnos]);
  const tiposBy = useMemo(() => {
    const map = new Map<number, TipoObservacion>();
    for (const t of tipos) map.set(t.id, t);
    return map;
  }, [tipos]);

  const nominaDelCurso = useMemo(() => {
    if (!form.idCurso) return [];
    const ids = new Set(
      inscripciones.filter((i) => String(i.id_curso) === form.idCurso).map((i) => i.id_alumno),
    );
    return alumnos.filter((a) => ids.has(a.id));
  }, [alumnos, form.idCurso, inscripciones]);

  const reload = useCallback(async () => {
    try {
      const t = await api.listTiposObservacion();
      setTipos(t);
      if (!activo) {
        setCursos([]);
        setAlumnos([]);
        setInscripciones([]);
        setRows([]);
        return;
      }
      const [dictados, personas, insc, obs] = await Promise.all([
        api.listCursos(activo.id),
        api.listAlumnos(),
        api.listInscripciones(activo.id),
        api.listObservaciones(activo.id),
      ]);
      setCursos(dictados);
      setAlumnos(personas);
      setInscripciones(insc);
      setRows(obs);
    } catch {
      /* Swal */
    }
  }, [activo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const cursoQ = searchParams.get("curso") ?? "";
    const alumnoQ = searchParams.get("alumno") ?? "";
    if (cursoQ) setFiltroCurso(cursoQ);
    if (alumnoQ) setFiltroAlumno(alumnoQ);
    setForm((prev) => {
      if (prev.editingId) {
        return {
          ...prev,
          idTipo: prev.idTipo || (tipos[0] ? String(tipos[0].id) : ""),
        };
      }
      const alumnoId = prev.idAlumno || alumnoQ;
      const inscAlumno = alumnoId
        ? inscripciones.filter((i) => String(i.id_alumno) === alumnoId)
        : [];
      let cursoId = prev.idCurso || cursoQ;
      if (
        inscAlumno.length > 0 &&
        (!cursoId || !inscAlumno.some((i) => String(i.id_curso) === cursoId))
      ) {
        cursoId = String(inscAlumno[0].id_curso);
      }
      if (!cursoId && cursos[0]) cursoId = String(cursos[0].id);
      return {
        ...prev,
        idCurso: cursoId,
        idAlumno: alumnoId,
        idTipo: prev.idTipo || (tipos[0] ? String(tipos[0].id) : ""),
      };
    });
  }, [cursos, inscripciones, searchParams, tipos]);

  function resetForm() {
    setForm(formVacio(cursos, tipos, []));
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = observacionWriteSchema.safeParse(payloadFromForm(form));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateObservacion(form.editingId, parsed.data);
        toast.success("Observación actualizada");
      } else {
        await api.createObservacion(parsed.data);
        toast.success("Observación guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Observacion) {
    const persona = alumnosBy.get(row.id_alumno);
    const curso = cursosBy.get(row.id_curso)?.nombre ?? "curso";
    const ok = await confirmAction({
      title: "¿Borrar esta observación?",
      text: `${persona ? etiquetaPersona(persona) : "Alumno"} — ${curso} — ${formatFecha(row.fecha)}.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteObservacion(row.id);
      toast.success("Observación borrada");
      if (form.editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  function startEdit(row: Observacion) {
    setForm({
      editingId: row.id,
      idCurso: String(row.id_curso),
      idAlumno: String(row.id_alumno),
      idTipo: String(row.id_tipo_observacion),
      fecha: row.fecha,
      texto: row.texto,
    });
    setFormError(null);
  }

  const alumnosFiltro = useMemo(() => {
    if (!filtroCurso) return alumnos;
    const ids = new Set(
      inscripciones.filter((i) => String(i.id_curso) === filtroCurso).map((i) => i.id_alumno),
    );
    return alumnos.filter((a) => ids.has(a.id));
  }, [alumnos, filtroCurso, inscripciones]);

  const tableRows: ObsRow[] = useMemo(
    () =>
      rows
        .filter((row) => {
          if (filtroCurso && String(row.id_curso) !== filtroCurso) return false;
          if (filtroAlumno && String(row.id_alumno) !== filtroAlumno) return false;
          if (filtroTipo && String(row.id_tipo_observacion) !== filtroTipo) return false;
          if (filtroFecha && row.fecha !== filtroFecha) return false;
          return true;
        })
        .map((row) => {
          const persona = alumnosBy.get(row.id_alumno);
          return {
            ...row,
            alumno: persona ? etiquetaPersona(persona) : "—",
            curso: cursosBy.get(row.id_curso)?.nombre ?? "—",
            tipo: tiposBy.get(row.id_tipo_observacion)?.nombre ?? "—",
          };
        }),
    [alumnosBy, cursosBy, filtroAlumno, filtroCurso, filtroFecha, filtroTipo, rows, tiposBy],
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("fecha", {
          header: "Fecha",
          cell: (ctx) => formatFecha(ctx.getValue()),
        }),
        helper.accessor("alumno", { header: "Alumno" }),
        helper.accessor("curso", { header: "Curso" }),
        helper.accessor("tipo", { header: "Tipo" }),
        helper.accessor("texto", {
          header: "Texto",
          cell: (ctx) => {
            const t = ctx.getValue();
            return t.length > 80 ? `${t.slice(0, 80)}…` : t;
          },
        }),
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
    [alumnos, cursos, tipos, rows],
  );

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Observaciones</h2>
        <p className="mt-1 text-sm text-sky">
          {activo
            ? `Anotaciones de ${activo.anio} sobre un alumno en ese dictado (académica, conducta, seguimiento, reunión con familia).`
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

      <ObservacionForm
        cursos={cursos}
        alumnos={nominaDelCurso}
        tipos={tipos}
        cursoFijo={false}
        alumnoFijo={false}
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        onSubmit={onSubmit}
        onCancel={resetForm}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-sky">
          Curso{" "}
          <select
            className={`${inputClass} w-auto`}
            value={filtroCurso}
            onChange={(e) => {
              setFiltroCurso(e.target.value);
              setFiltroAlumno("");
            }}
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
          Alumno{" "}
          <select
            className={`${inputClass} w-auto`}
            value={filtroAlumno}
            onChange={(e) => setFiltroAlumno(e.target.value)}
          >
            <option value="">Todos</option>
            {alumnosFiltro.map((a) => (
              <option key={a.id} value={a.id}>
                {etiquetaPersona(a)}
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
        <label className="text-sm text-sky">
          Fecha{" "}
          <input
            type="date"
            className={`${inputClass} w-auto`}
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
          />
        </label>
        {(filtroCurso || filtroAlumno || filtroTipo || filtroFecha) && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              setFiltroCurso("");
              setFiltroAlumno("");
              setFiltroTipo("");
              setFiltroFecha("");
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={tableRows.length > 0 ? tableRows : EMPTY}
        empty={
          activo
            ? "Todavía no hay observaciones este año. Cargá la primera arriba."
            : "Sin año lectivo activo."
        }
      />
    </section>
  );
}

export default Observaciones;
