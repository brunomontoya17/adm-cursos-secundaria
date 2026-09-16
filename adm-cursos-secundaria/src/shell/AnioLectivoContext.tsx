import { Temporal } from "@js-temporal/polyfill";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "react-toastify";
import { api, type AnioLectivo } from "../api";
import { confirmAction, pickSelect, showInfo } from "../feedback";

type AnioLectivoContextValue = {
  anios: AnioLectivo[];
  activo: AnioLectivo | null;
  loading: boolean;
  siguienteAnio: number;
  reload: () => Promise<void>;
  activar: (id: number) => Promise<void>;
  crearSiguiente: () => Promise<void>;
  limpiarAnioInactivo: () => Promise<void>;
};

const AnioLectivoContext = createContext<AnioLectivoContextValue | null>(null);

export function AnioLectivoProvider({ children }: { children: ReactNode }) {
  const [anios, setAnios] = useState<AnioLectivo[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const rows = await api.listAniosLectivos();
      setAnios(rows);
    } catch {
      /* Swal en invokeChecked */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activo = anios.find((row) => row.activo === 1) ?? null;
  const maxAnio = anios.reduce((max, row) => Math.max(max, row.anio), 0);
  const siguienteAnio = (maxAnio || Temporal.Now.plainDateISO().year) + (maxAnio ? 1 : 0);

  const activar = useCallback(
    async (id: number) => {
      const target = anios.find((row) => row.id === id);
      if (!target || target.activo === 1) return;
      const ok = await confirmAction({
        title: `¿Activar el año ${target.anio}?`,
        text: "Los listados usarán este año lectivo.",
        confirmText: "Activar",
      });
      if (!ok) return;
      try {
        await api.activarAnioLectivo(id);
        toast.success(`Año lectivo ${target.anio} activo`);
        await reload();
      } catch {
        /* Swal */
      }
    },
    [anios, reload],
  );

  const crearSiguiente = useCallback(async () => {
    const anio = siguienteAnio;
    const ok = await confirmAction({
      title: `¿Crear el año lectivo ${anio}?`,
      text: "Queda inactivo hasta que lo elijas en el selector.",
      confirmText: "Crear",
    });
    if (!ok) return;
    try {
      await api.createAnioLectivo(anio);
      toast.success(`Año lectivo ${anio} creado`);
      await reload();
    } catch {
      /* Swal */
    }
  }, [reload, siguienteAnio]);

  const limpiarAnioInactivo = useCallback(async () => {
    const inactivos = anios.filter((row) => row.activo === 0);
    if (inactivos.length === 0) {
      await showInfo(
        "No hay un año inactivo",
        "Activá otro año lectivo para poder limpiar el anterior. Las personas no se borran.",
      );
      return;
    }
    let target = inactivos[0];
    if (inactivos.length > 1) {
      const picked = await pickSelect({
        title: "¿Qué año limpiar?",
        text: "Solo años que no están activos.",
        confirmText: "Seguir",
        options: inactivos.map((row) => ({ value: String(row.id), label: String(row.anio) })),
      });
      if (!picked) return;
      const found = inactivos.find((row) => String(row.id) === picked);
      if (!found) return;
      target = found;
    }
    const ok = await confirmAction({
      title: `¿Limpiar el año ${target.anio}?`,
      text: `Se borran notas, asistencia, observaciones, evaluaciones, eventos de curso, horarios e inscripciones de ${target.anio}. Las personas y los dictados quedan; el año sigue existiendo. No se toca el año activo.`,
      confirmText: "Limpiar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.limpiarAnioLectivo(target.id);
      toast.success(`Año ${target.anio} limpio`);
      await reload();
    } catch {
      /* Swal */
    }
  }, [anios, reload]);

  const value = useMemo(
    () => ({
      anios,
      activo,
      loading,
      siguienteAnio,
      reload,
      activar,
      crearSiguiente,
      limpiarAnioInactivo,
    }),
    [activo, activar, anios, crearSiguiente, limpiarAnioInactivo, loading, reload, siguienteAnio],
  );

  return <AnioLectivoContext.Provider value={value}>{children}</AnioLectivoContext.Provider>;
}

export function useAnioLectivo(): AnioLectivoContextValue {
  const ctx = useContext(AnioLectivoContext);
  if (!ctx) {
    throw new Error("useAnioLectivo requiere AnioLectivoProvider");
  }
  return ctx;
}
