import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  DIAS_SEMANA,
  horarioWriteSchema,
  nombreDia,
  type Curso,
  type Horario,
  type HorarioWrite,
} from "../api";
import { confirmAction } from "../feedback";
import {
  blankToNull,
  btnDanger,
  btnGhost,
  btnLink,
  btnPrimary,
  inputClass,
  toHhMm,
} from "../form";
import { useAnioLectivo } from "../shell/AnioLectivoContext";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function etiquetaBloque(h: Horario, cursoNombre?: string): string {
  const dia = nombreDia(h.dia_semana);
  const rango = `${h.hora_inicio}–${h.hora_fin}`;
  const aula = h.aula ? ` · aula ${h.aula}` : "";
  const curso = cursoNombre ? `${cursoNombre} · ` : "";
  return `${curso}${dia} ${rango}${aula}`;
}

type FormState = {
  editingId: number | null;
  idCurso: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  aula: string;
};

const FORM_VACIO: FormState = {
  editingId: null,
  idCurso: "",
  dia: "1",
  horaInicio: "14:00",
  horaFin: "15:20",
  aula: "",
};

function HorarioForm({
  cursos,
  cursoFijo,
  form,
  setForm,
  formError,
  saving,
  onSubmit,
  onCancel,
}: {
  cursos: Curso[];
  cursoFijo: boolean;
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
        {form.editingId ? "Editar bloque" : "Nuevo bloque"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {!cursoFijo && (
          <Field label="Curso">
            <select
              required
              className={inputClass}
              value={form.idCurso}
              onChange={(e) => setForm({ ...form, idCurso: e.target.value })}
            >
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Día">
          <select
            required
            className={inputClass}
            value={form.dia}
            onChange={(e) => setForm({ ...form, dia: e.target.value })}
          >
            {DIAS_SEMANA.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde">
          <input
            required
            type="time"
            className={inputClass}
            value={form.horaInicio}
            onChange={(e) => setForm({ ...form, horaInicio: toHhMm(e.target.value) })}
          />
        </Field>
        <Field label="Hasta">
          <input
            required
            type="time"
            className={inputClass}
            value={form.horaFin}
            onChange={(e) => setForm({ ...form, horaFin: toHhMm(e.target.value) })}
          />
        </Field>
        <Field label="Aula">
          <input
            className={inputClass}
            value={form.aula}
            onChange={(e) => setForm({ ...form, aula: e.target.value })}
            placeholder="Opcional"
          />
        </Field>
      </div>
      {formError && <p className="text-sm text-crimson">{formError}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btnPrimary} disabled={saving || (!cursoFijo && cursos.length === 0)}>
          {form.editingId ? "Guardar cambios" : "Agregar al horario"}
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

function BloqueCard({
  h,
  cursoNombre,
  mostrarCurso,
  mostrarDia,
  onEdit,
  onDelete,
}: {
  h: Horario;
  cursoNombre: string;
  mostrarCurso: boolean;
  mostrarDia?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-navy/15 bg-cream/40 p-2 text-sm">
      {mostrarDia && <p className="text-xs font-medium uppercase tracking-wide text-sky">{nombreDia(h.dia_semana)}</p>}
      {mostrarCurso && (
        <Link to={`/cursos/${h.id_curso}`} className="block font-medium text-navy no-underline hover:underline">
          {cursoNombre}
        </Link>
      )}
      <p className="text-navy">
        {h.hora_inicio}–{h.hora_fin}
      </p>
      {h.aula && <p className="text-xs text-sky">Aula {h.aula}</p>}
      <div className="mt-1 flex justify-end gap-1">
        <button type="button" className={btnLink} onClick={onEdit}>
          Editar
        </button>
        <button type="button" className={btnDanger} onClick={onDelete}>
          Borrar
        </button>
      </div>
    </div>
  );
}

export function HorarioCursoPanel({
  cursoId,
  cursoNombre,
}: {
  cursoId: number;
  cursoNombre: string;
}) {
  const [rows, setRows] = useState<Horario[]>([]);
  const [form, setForm] = useState<FormState>({ ...FORM_VACIO, idCurso: String(cursoId) });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRows(await api.listHorariosDeCurso(cursoId));
    } catch {
      /* Swal */
    }
  }, [cursoId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, idCurso: String(cursoId) }));
  }, [cursoId]);

  function resetForm() {
    setForm({ ...FORM_VACIO, idCurso: String(cursoId) });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const payload: HorarioWrite = {
      id_curso: cursoId,
      dia_semana: Number(form.dia),
      hora_inicio: toHhMm(form.horaInicio),
      hora_fin: toHhMm(form.horaFin),
      aula: blankToNull(form.aula),
    };
    const parsed = horarioWriteSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateHorario(form.editingId, parsed.data);
        toast.success("Horario actualizado");
      } else {
        await api.createHorario(parsed.data);
        toast.success("Bloque agregado");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(h: Horario) {
    const ok = await confirmAction({
      title: "¿Borrar este bloque?",
      text: etiquetaBloque(h, cursoNombre),
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteHorario(h.id);
      toast.success("Bloque borrado");
      if (form.editingId === h.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  return (
    <div className="space-y-4 border border-navy/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-navy">Horario de este dictado</h3>
        <Link to="/horarios" className={`${btnLink} no-underline`}>
          Ver la semana
        </Link>
      </div>
      <HorarioForm
        cursos={[]}
        cursoFijo
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        onSubmit={onSubmit}
        onCancel={resetForm}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-sky">Sin bloques todavía. Ejemplo: lunes 14:00–15:20.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((h) => (
            <li key={h.id}>
              <BloqueCard
                h={h}
                cursoNombre={cursoNombre}
                mostrarCurso={false}
                mostrarDia
                onEdit={() => {
                  setForm({
                    editingId: h.id,
                    idCurso: String(cursoId),
                    dia: String(h.dia_semana),
                    horaInicio: h.hora_inicio,
                    horaFin: h.hora_fin,
                    aula: h.aula ?? "",
                  });
                  setFormError(null);
                }}
                onDelete={() => void onDelete(h)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Horarios() {
  const { activo } = useAnioLectivo();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [rows, setRows] = useState<Horario[]>([]);
  const [filtroCurso, setFiltroCurso] = useState("");
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cursosBy = useMemo(() => {
    const map = new Map<number, Curso>();
    for (const c of cursos) map.set(c.id, c);
    return map;
  }, [cursos]);

  const reload = useCallback(async () => {
    if (!activo) {
      setCursos([]);
      setRows([]);
      return;
    }
    try {
      const [dictados, bloques] = await Promise.all([
        api.listCursos(activo.id),
        api.listHorarios(activo.id),
      ]);
      setCursos(dictados);
      setRows(bloques);
    } catch {
      /* Swal */
    }
  }, [activo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!form.idCurso && cursos[0]) {
      setForm((prev) => ({ ...prev, idCurso: String(cursos[0].id) }));
    }
  }, [cursos, form.idCurso]);

  function resetForm() {
    setForm({
      ...FORM_VACIO,
      idCurso: cursos[0] ? String(cursos[0].id) : "",
    });
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const payload: HorarioWrite = {
      id_curso: Number(form.idCurso),
      dia_semana: Number(form.dia),
      hora_inicio: toHhMm(form.horaInicio),
      hora_fin: toHhMm(form.horaFin),
      aula: blankToNull(form.aula),
    };
    const parsed = horarioWriteSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setSaving(true);
    try {
      if (form.editingId) {
        await api.updateHorario(form.editingId, parsed.data);
        toast.success("Horario actualizado");
      } else {
        await api.createHorario(parsed.data);
        toast.success("Bloque agregado");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(h: Horario) {
    const curso = cursosBy.get(h.id_curso)?.nombre;
    const ok = await confirmAction({
      title: "¿Borrar este bloque?",
      text: etiquetaBloque(h, curso),
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteHorario(h.id);
      toast.success("Bloque borrado");
      if (form.editingId === h.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const visibles = useMemo(
    () => (filtroCurso ? rows.filter((h) => String(h.id_curso) === filtroCurso) : rows),
    [filtroCurso, rows],
  );

  const porDia = useMemo(() => {
    const map = new Map<number, Horario[]>();
    for (const d of DIAS_SEMANA) map.set(d.id, []);
    for (const h of visibles) {
      map.get(h.dia_semana)?.push(h);
    }
    return map;
  }, [visibles]);

  function startEdit(h: Horario) {
    setForm({
      editingId: h.id,
      idCurso: String(h.id_curso),
      dia: String(h.dia_semana),
      horaInicio: h.hora_inicio,
      horaFin: h.hora_fin,
      aula: h.aula ?? "",
    });
    setFormError(null);
  }

  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-2xl text-navy">Horarios</h2>
        <p className="mt-1 text-sm text-sky">
          {activo
            ? `Tu semana de ${activo.anio}. No es el horario del colegio: son los bloques donde dictás.`
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

      <HorarioForm
        cursos={cursos}
        cursoFijo={false}
        form={form}
        setForm={setForm}
        formError={formError}
        saving={saving}
        onSubmit={onSubmit}
        onCancel={resetForm}
      />

      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[56rem] grid-cols-7 gap-2">
          {DIAS_SEMANA.map((d) => {
            const bloques = porDia.get(d.id) ?? [];
            return (
              <div key={d.id} className="min-w-0">
                <h3 className="border-b border-navy/20 pb-1 text-sm font-medium text-navy">
                  {d.nombre}
                </h3>
                <div className="mt-2 space-y-2">
                  {bloques.length === 0 ? (
                    <p className="text-xs text-sky">—</p>
                  ) : (
                    bloques.map((h) => (
                      <BloqueCard
                        key={h.id}
                        h={h}
                        cursoNombre={cursosBy.get(h.id_curso)?.nombre ?? "Curso"}
                        mostrarCurso
                        onEdit={() => startEdit(h)}
                        onDelete={() => void onDelete(h)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Horarios;
