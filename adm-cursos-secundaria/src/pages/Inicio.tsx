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
        Cargá las escuelas (primaria y/o secundaria) y las materias que das. Después se arman
        los cursos: un 3° grado y un 3° año pueden convivir en el mismo colegio.
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
