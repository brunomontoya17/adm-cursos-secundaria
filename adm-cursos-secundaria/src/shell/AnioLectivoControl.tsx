import { useAnioLectivo } from "./AnioLectivoContext";

function AnioLectivoControl() {
  const { anios, activo, loading, siguienteAnio, activar, crearSiguiente, limpiarAnioInactivo } =
    useAnioLectivo();

  return (
    <div className="ml-auto flex items-center gap-2 text-sm text-cream">
      <label className="flex items-center gap-2">
        <span className="hidden sm:inline">Año lectivo</span>
        <select
          aria-label="Año lectivo activo"
          className="border border-cream/40 bg-navy-deep px-2 py-1 text-cream outline-none"
          disabled={loading || anios.length === 0}
          value={activo?.id ?? ""}
          onChange={(event) => {
            const id = Number(event.target.value);
            if (Number.isFinite(id)) void activar(id);
          }}
        >
          {anios.length === 0 ? (
            <option value="">—</option>
          ) : (
            anios.map((row) => (
              <option key={row.id} value={row.id}>
                {row.anio}
                {row.activo === 1 ? " · activo" : ""}
              </option>
            ))
          )}
        </select>
      </label>
      {!loading && (
        <>
          <button
            type="button"
            className="border border-cream/40 px-2 py-1 text-cream hover:bg-navy-mid"
            onClick={() => void crearSiguiente()}
          >
            Crear {siguienteAnio}
          </button>
          <button
            type="button"
            className="border border-cream/40 px-2 py-1 text-cream hover:bg-navy-mid"
            onClick={() => void limpiarAnioInactivo()}
          >
            Limpiar año
          </button>
        </>
      )}
    </div>
  );
}

export default AnioLectivoControl;
