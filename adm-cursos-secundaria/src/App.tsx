import { Navigate, Route, Routes } from "react-router-dom";
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
import Seccion from "./pages/Seccion";
import AppShell from "./shell/AppShell";
import { AnioLectivoProvider } from "./shell/AnioLectivoContext";

function App() {
  return (
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
          <Route path="observaciones" element={<Seccion titulo="Observaciones" />} />
          <Route path="asistencia" element={<Asistencia />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AnioLectivoProvider>
  );
}

export default App;
