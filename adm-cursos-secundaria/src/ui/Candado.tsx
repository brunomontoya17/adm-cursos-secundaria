import { useState, type FormEvent } from "react";
import { btnPrimary, inputClass } from "../form";

export function Candado({
  fase,
  migra,
  intentosRestantes,
  onCrear,
  onDesbloquear,
  error,
  saving,
}: {
  fase: "crear" | "desbloquear";
  migra: boolean;
  intentosRestantes: number;
  onCrear: (clave: string, repetir: string) => void;
  onDesbloquear: (clave: string) => void;
  error: string | null;
  saving: boolean;
}) {
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const bloqueado = fase === "desbloquear" && intentosRestantes <= 0;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (bloqueado || saving) return;
    if (fase === "crear") onCrear(clave, repetir);
    else onDesbloquear(clave);
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-paper p-6 text-navy">
      <form
        className="w-full max-w-xl space-y-5 border border-navy/15 bg-cream/40 p-6"
        onSubmit={onSubmit}
      >
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt=""
            className="h-10 w-10 rounded-full object-cover"
            draggable={false}
          />
          <h1 className="font-serif text-2xl">
            {fase === "crear" ? "Elegí una clave" : "Abrí tu cuaderno"}
          </h1>
        </div>
        {fase === "crear" ? (
          <p className="text-sm text-sky">
            {migra
              ? "Ya hay un cuaderno en este equipo. Se cifra con esta clave y deja de ser un SQLite legible."
              : "Esta clave abre el cuaderno en este equipo. No se envía a ningún lado."}{" "}
            Si la olvidás, no se puede abrir. No hay recuperación.
          </p>
        ) : (
          <p className="text-sm text-sky">
            El archivo está cifrado. Tres intentos por arranque; si fallan, cerrá la app y
            volvé a abrir.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sky">Clave</span>
          <input
            className={inputClass}
            type="password"
            autoComplete={fase === "crear" ? "new-password" : "current-password"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={8}
            required
            disabled={bloqueado || saving}
          />
        </label>
        {fase === "crear" ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-sky">
              Repetir clave
            </span>
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              minLength={8}
              required
              disabled={saving}
            />
          </label>
        ) : (
          <p className="text-xs text-sky">Intentos restantes: {intentosRestantes}</p>
        )}
        {error ? <p className="text-sm text-crimson">{error}</p> : null}
        <button type="submit" className={btnPrimary} disabled={bloqueado || saving}>
          {fase === "crear" ? "Cifrar y abrir" : "Abrir"}
        </button>
      </form>
    </div>
  );
}
