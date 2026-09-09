import { Navigate, Route, Routes } from "react-router-dom";
import Inicio from "./pages/Inicio";
import Seccion from "./pages/Seccion";
import AppShell from "./shell/AppShell";

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="cursos" element={<Seccion titulo="Cursos" />} />
        <Route path="alumnos" element={<Seccion titulo="Alumnos" />} />
        <Route path="escuelas" element={<Seccion titulo="Escuelas" />} />
        <Route path="horarios" element={<Seccion titulo="Horarios" />} />
        <Route path="calendario" element={<Seccion titulo="Calendario" />} />
        <Route path="evaluaciones" element={<Seccion titulo="Evaluaciones" />} />
        <Route path="notas" element={<Seccion titulo="Notas" />} />
        <Route path="observaciones" element={<Seccion titulo="Observaciones" />} />
        <Route path="asistencia" element={<Seccion titulo="Asistencia" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
