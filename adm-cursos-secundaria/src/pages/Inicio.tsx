import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DbStatus } from "../api";
import { useAnioLectivo } from "../shell/AnioLectivoContext";

function Inicio() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const { activo } = useAnioLectivo();

  useEffect(() => {
    api.dbStatus().then(setDbStatus).catch(() => {
      /* El error de BD lo muestra el Swal en invokeChecked. */
    });
  }, []);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
      <img
        src="/logo.jpeg"
        alt="Tomás Mariano Sanchez Tejerina — English Teacher"
        className="h-auto w-[min(52vmin,22rem)] select-none"
        draggable={false}
      />
      <p className="mt-6 font-serif text-xl text-navy">
        {activo ? `Año lectivo ${activo.anio}` : "Sin año lectivo activo"}
      </p>
      <p className="mt-2 max-w-md text-center text-sm text-sky">
        Cargá escuelas, materias, cursos, nómina, horario y evaluaciones. Las notas se cargan
        en la planilla del dictado (1–10 o ausente).
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          to="/escuelas"
          className="bg-navy px-4 py-2 text-sm text-cream no-underline hover:bg-navy-mid"
        >
          Escuelas y materias
        </Link>
        <Link
          to="/cursos"
          className="border border-navy px-4 py-2 text-sm text-navy no-underline hover:bg-cream"
        >
          Cursos
        </Link>
        <Link
          to="/alumnos"
          className="border border-navy px-4 py-2 text-sm text-navy no-underline hover:bg-cream"
        >
          Alumnos
        </Link>
        <Link
          to="/horarios"
          className="border border-navy px-4 py-2 text-sm text-navy no-underline hover:bg-cream"
        >
          Horarios
        </Link>
        <Link
          to="/evaluaciones"
          className="border border-navy px-4 py-2 text-sm text-navy no-underline hover:bg-cream"
        >
          Evaluaciones
        </Link>
        <Link
          to="/notas"
          className="border border-navy px-4 py-2 text-sm text-navy no-underline hover:bg-cream"
        >
          Notas
        </Link>
      </div>
      {dbStatus && (
        <p className="mt-6 text-xs text-sky">
          Listo · {dbStatus.tables} tablas · FK {dbStatus.foreign_keys}
        </p>
      )}
    </div>
  );
}

export default Inicio;
