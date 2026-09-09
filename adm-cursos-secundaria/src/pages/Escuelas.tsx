import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import {
  api,
  escuelaWriteSchema,
  materiaWriteSchema,
  type Escuela,
  type EscuelaWrite,
  type Jurisdiccion,
  type Materia,
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
import { DataTable, tableFeaturesBase } from "../ui/DataTable";

const escuelaHelper = createColumnHelper<typeof tableFeaturesBase, EscuelaRow>();
const materiaHelper = createColumnHelper<typeof tableFeaturesBase, Materia>();
const EMPTY_ESCUELAS: EscuelaRow[] = [];
const EMPTY_MATERIAS: Materia[] = [];

type EscuelaRow = Escuela & { jurisdiccion: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sky">{label}</span>
      {children}
    </label>
  );
}

function firstIssue(message: string | undefined, fallback: string): string {
  return message && message.length > 0 ? message : fallback;
}

function EscuelasPanel({
  jurisdicciones,
}: {
  jurisdicciones: Jurisdiccion[];
}) {
  const [rows, setRows] = useState<Escuela[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [idJurisdiccion, setIdJurisdiccion] = useState("");
  const [nombre, setNombre] = useState("");
  const [nombreCorto, setNombreCorto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<number, Jurisdiccion>();
    for (const j of jurisdicciones) map.set(j.id, j);
    return map;
  }, [jurisdicciones]);

  const reload = useCallback(async () => {
    try {
      setRows(await api.listEscuelas());
    } catch {
      /* Swal */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!idJurisdiccion && jurisdicciones[0]) {
      setIdJurisdiccion(String(jurisdicciones[0].id));
    }
  }, [idJurisdiccion, jurisdicciones]);

  function resetForm() {
    setEditingId(null);
    setNombre("");
    setNombreCorto("");
    setDireccion("");
    setTelefono("");
    setEmail("");
    setFormError(null);
    if (jurisdicciones[0]) setIdJurisdiccion(String(jurisdicciones[0].id));
  }

  function startEdit(row: Escuela) {
    setEditingId(row.id);
    setIdJurisdiccion(String(row.id_jurisdiccion));
    setNombre(row.nombre);
    setNombreCorto(row.nombre_corto ?? "");
    setDireccion(row.direccion ?? "");
    setTelefono(row.telefono ?? "");
    setEmail(row.email ?? "");
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const payload: EscuelaWrite = {
      id_jurisdiccion: Number(idJurisdiccion),
      nombre: nombre.trim(),
      nombre_corto: blankToNull(nombreCorto),
      direccion: blankToNull(direccion),
      telefono: blankToNull(telefono),
      email: blankToNull(email),
    };
    const parsed = escuelaWriteSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(firstIssue(parsed.error.issues[0]?.message, "Datos inválidos"));
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateEscuela(editingId, parsed.data);
        toast.success("Escuela actualizada");
      } else {
        await api.createEscuela(parsed.data);
        toast.success("Escuela guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Escuela) {
    const ok = await confirmAction({
      title: "¿Borrar escuela?",
      text: row.nombre,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEscuela(row.id);
      toast.success("Escuela borrada");
      if (editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const tableRows: EscuelaRow[] = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        jurisdiccion: byId.get(row.id_jurisdiccion)?.nombre ?? "—",
      })),
    [byId, rows],
  );

  const columns = useMemo(
    () =>
      escuelaHelper.columns([
        escuelaHelper.accessor("nombre", { header: "Nombre" }),
        escuelaHelper.accessor("nombre_corto", {
          header: "Corto",
          cell: (ctx) => ctx.getValue() ?? "—",
        }),
        escuelaHelper.accessor("jurisdiccion", { header: "Jurisdicción" }),
        escuelaHelper.display({
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
    // startEdit/onDelete son estables por cierre sobre estado actual
    [rows],
  );

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl text-navy">Escuelas</h2>
      <p className="text-sm text-sky">
        Lugares donde dictás (primaria, secundaria o ambas). No es el padrón del colegio.
      </p>

      <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
        <h3 className="text-sm font-medium text-navy">
          {editingId ? "Editar escuela" : "Nueva escuela"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jurisdicción">
            <select
              required
              className={inputClass}
              value={idJurisdiccion}
              onChange={(e) => setIdJurisdiccion(e.target.value)}
            >
              {jurisdicciones.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre">
            <input
              required
              className={inputClass}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ENET Nº 1"
            />
          </Field>
          <Field label="Nombre corto">
            <input
              className={inputClass}
              value={nombreCorto}
              onChange={(e) => setNombreCorto(e.target.value)}
              placeholder="ENET"
            />
          </Field>
          <Field label="Teléfono">
            <input
              className={inputClass}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Field>
          <Field label="Dirección">
            <input
              className={inputClass}
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
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
        </div>
        {formError && <p className="text-sm text-crimson">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {editingId ? "Guardar cambios" : "Agregar escuela"}
          </button>
          {editingId && (
            <button type="button" className={btnGhost} onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <DataTable
        columns={columns}
        data={tableRows.length > 0 ? tableRows : EMPTY_ESCUELAS}
        empty="Todavía no hay escuelas. Cargá dónde dictás."
      />
    </section>
  );
}

function MateriasPanel() {
  const [rows, setRows] = useState<Materia[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      setRows(await api.listMaterias());
    } catch {
      /* Swal */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setNombre("");
    setFormError(null);
  }

  function startEdit(row: Materia) {
    setEditingId(row.id);
    setNombre(row.nombre);
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = materiaWriteSchema.safeParse({ nombre: nombre.trim() });
    if (!parsed.success) {
      setFormError(firstIssue(parsed.error.issues[0]?.message, "El nombre es obligatorio."));
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateMateria(editingId, parsed.data);
        toast.success("Materia actualizada");
      } else {
        await api.createMateria(parsed.data);
        toast.success("Materia guardada");
      }
      resetForm();
      await reload();
    } catch {
      /* Swal */
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row: Materia) {
    const ok = await confirmAction({
      title: "¿Borrar materia?",
      text: row.nombre,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteMateria(row.id);
      toast.success("Materia borrada");
      if (editingId === row.id) resetForm();
      await reload();
    } catch {
      /* Swal */
    }
  }

  const columns = useMemo(
    () =>
      materiaHelper.columns([
        materiaHelper.accessor("nombre", { header: "Nombre" }),
        materiaHelper.display({
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
    [rows],
  );

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl text-navy">Materias</h2>
      <p className="text-sm text-sky">
        Lo que dictás vos: English, Plástica, Música… El maestro de grado puede usar «Grado»
        (un grupo) o las áreas que quiera separar.
      </p>

      <form className="grid gap-3 border border-navy/15 bg-cream/40 p-4" onSubmit={onSubmit}>
        <h3 className="text-sm font-medium text-navy">
          {editingId ? "Editar materia" : "Nueva materia"}
        </h3>
        <Field label="Nombre">
          <input
            required
            className={inputClass}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="English"
          />
        </Field>
        {formError && <p className="text-sm text-crimson">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={saving}>
            {editingId ? "Guardar cambios" : "Agregar materia"}
          </button>
          {editingId && (
            <button type="button" className={btnGhost} onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <DataTable
        columns={columns}
        data={rows.length > 0 ? rows : EMPTY_MATERIAS}
        empty="Todavía no hay materias. Cargá lo que dictás."
      />
    </section>
  );
}

function Escuelas() {
  const [jurisdicciones, setJurisdicciones] = useState<Jurisdiccion[]>([]);

  useEffect(() => {
    api
      .listJurisdicciones()
      .then(setJurisdicciones)
      .catch(() => {
        /* Swal */
      });
  }, []);

  return (
    <div className="grid gap-10 p-6 lg:grid-cols-2">
      <EscuelasPanel jurisdicciones={jurisdicciones} />
      <MateriasPanel />
    </div>
  );
}

export default Escuelas;
