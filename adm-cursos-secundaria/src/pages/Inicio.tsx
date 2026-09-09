import { useEffect, useState } from "react";
import { api, type DbStatus } from "../api";

function Inicio() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);

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
      {dbStatus && (
        <p className="mt-6 text-xs text-sky">
          Listo · {dbStatus.tables} tablas · FK {dbStatus.foreign_keys}
        </p>
      )}
    </div>
  );
}

export default Inicio;
