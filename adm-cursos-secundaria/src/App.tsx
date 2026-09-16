import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
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

function App() {
  const [aviso, setAviso] = useState<"cargando" | "pendiente" | "ok">("cargando");
  const [releer, setReleer] = useState(false);

  const cargarAviso = useCallback(async () => {
    if (!isTauriRuntime()) {
      setAviso("ok");
      return;
    }
    try {
      const estado = await api.avisoPrivacidadEstado();
      setAviso(estado.aceptado === 1 ? "ok" : "pendiente");
    } catch {
      setAviso("pendiente");
    }
  }, []);

  useEffect(() => {
    void cargarAviso();
  }, [cargarAviso]);

  async function onEntendido() {
    try {
      await api.aceptarAvisoPrivacidad();
      setAviso("ok");
    } catch {
      /* Swal */
    }
  }

  if (aviso === "cargando") {
    return <div className="min-h-full bg-paper" />;
  }
  if (aviso === "pendiente") {
    return <AvisoAlcance variante="bloqueo" onCerrar={() => void onEntendido()} />;
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
