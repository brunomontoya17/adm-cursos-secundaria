import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api, ApiError, type CandadoEstado } from "./api";
import { isTauriRuntime } from "./feedback";
import Inicio from "./pages/Inicio";
import Cursos from "./pages/Cursos";
import CursoFicha from "./pages/CursoFicha";
import Alumnos from "./pages/Alumnos";
import Escuelas from "./pages/Escuelas";
import Horarios from "./pages/Horarios";
import Evaluaciones from "./pages/Evaluaciones";
import Notas from "./pages/Notas";
import Asistencia from "./pages/Asistencia";
import Calendario from "./pages/Calendario";
import Observaciones from "./pages/Observaciones";
import { AlcanceProvider } from "./shell/AlcanceContext";
import AppShell from "./shell/AppShell";
import { AnioLectivoProvider } from "./shell/AnioLectivoContext";
import { AvisoAlcance } from "./ui/AvisoAlcance";
import { Candado } from "./ui/Candado";

function mensajeCandado(err: unknown): string {
  if (err instanceof ApiError) {
    const cause = err.cause;
    if (typeof cause === "string" && cause.trim()) return cause;
    if (cause instanceof Error && cause.message.trim()) return cause.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "No se pudo abrir el cuaderno.";
}

function App() {
  const [aviso, setAviso] = useState<"cargando" | "pendiente" | "ok">("cargando");
  const [candado, setCandado] = useState<CandadoEstado | null>(null);
  const [candadoError, setCandadoError] = useState<string | null>(null);
  const [candadoSaving, setCandadoSaving] = useState(false);
  const [releer, setReleer] = useState(false);

  const cargarAviso = useCallback(async () => {
    if (!isTauriRuntime()) {
      setAviso("ok");
      setCandado({ fase: "abierto", intentos_restantes: 3, migra: 0 });
      return;
    }
    try {
      const estado = await api.avisoPrivacidadEstado();
      setAviso(estado.aceptado === 1 ? "ok" : "pendiente");
    } catch {
      setAviso("pendiente");
    }
  }, []);

  const cargarCandado = useCallback(async () => {
    if (!isTauriRuntime()) {
      setCandado({ fase: "abierto", intentos_restantes: 3, migra: 0 });
      return;
    }
    try {
      setCandado(await api.candadoEstado());
      setCandadoError(null);
    } catch (err) {
      setCandadoError(mensajeCandado(err));
      setCandado({ fase: "desbloquear", intentos_restantes: 0, migra: 0 });
    }
  }, []);

  useEffect(() => {
    void cargarAviso();
  }, [cargarAviso]);

  useEffect(() => {
    if (aviso === "ok") void cargarCandado();
  }, [aviso, cargarCandado]);

  async function onEntendido() {
    try {
      await api.aceptarAvisoPrivacidad();
      setAviso("ok");
    } catch {
      /* Swal */
    }
  }

  async function onCrear(clave: string, repetir: string) {
    setCandadoSaving(true);
    setCandadoError(null);
    try {
      setCandado(await api.crearClave(clave, repetir));
    } catch (err) {
      setCandadoError(mensajeCandado(err));
      await cargarCandado();
    } finally {
      setCandadoSaving(false);
    }
  }

  async function onDesbloquear(clave: string) {
    setCandadoSaving(true);
    setCandadoError(null);
    try {
      setCandado(await api.desbloquear(clave));
    } catch (err) {
      setCandadoError(mensajeCandado(err));
      await cargarCandado();
    } finally {
      setCandadoSaving(false);
    }
  }

  if (aviso === "cargando") {
    return <div className="min-h-full bg-paper" />;
  }
  if (aviso === "pendiente") {
    return <AvisoAlcance variante="bloqueo" onCerrar={() => void onEntendido()} />;
  }
  if (!candado) {
    return <div className="min-h-full bg-paper" />;
  }
  if (candado.fase === "crear" || candado.fase === "desbloquear") {
    return (
      <Candado
        fase={candado.fase}
        migra={candado.migra === 1}
        intentosRestantes={candado.intentos_restantes}
        onCrear={(c, r) => void onCrear(c, r)}
        onDesbloquear={(c) => void onDesbloquear(c)}
        error={candadoError}
        saving={candadoSaving}
      />
    );
  }

  return (
    <AlcanceProvider abrirReleer={() => setReleer(true)}>
      <AnioLectivoProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Inicio />} />
            <Route path="cursos" element={<Cursos />} />
            <Route path="cursos/:id" element={<CursoFicha />} />
            <Route path="alumnos" element={<Alumnos />} />
            <Route path="escuelas" element={<Escuelas />} />
            <Route path="horarios" element={<Horarios />} />
            <Route path="calendario" element={<Calendario />} />
            <Route path="evaluaciones" element={<Evaluaciones />} />
            <Route path="notas" element={<Notas />} />
            <Route path="observaciones" element={<Observaciones />} />
            <Route path="asistencia" element={<Asistencia />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AnioLectivoProvider>
      {releer ? (
        <div className="fixed inset-0 z-50 overflow-auto bg-paper">
          <AvisoAlcance variante="releer" onCerrar={() => setReleer(false)} />
        </div>
      ) : null}
    </AlcanceProvider>
  );
}

export default App;
