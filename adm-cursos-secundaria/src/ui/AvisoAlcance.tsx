import { AVISO_ALCANCE } from "../privacidad";
import { btnGhost, btnPrimary } from "../form";

export function AvisoAlcanceTexto() {
  return (
    <div className="space-y-3 text-sm text-navy">
      <p className="text-sky">{AVISO_ALCANCE.lead}</p>
      <ul className="list-disc space-y-2 pl-5">
        {AVISO_ALCANCE.puntos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export function AvisoAlcance({
  variante,
  onCerrar,
}: {
  variante: "bloqueo" | "releer";
  onCerrar: () => void;
}) {
  const accion = variante === "bloqueo" ? "Entendido" : "Cerrar";
  const classBtn = variante === "bloqueo" ? btnPrimary : btnGhost;
  return (
    <div className="flex min-h-full items-center justify-center bg-paper p-6 text-navy">
      <div className="w-full max-w-xl space-y-5 border border-navy/15 bg-cream/40 p-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpeg"
            alt=""
            className="h-10 w-10 rounded-full object-cover"
            draggable={false}
          />
          <h1 className="font-serif text-2xl">{AVISO_ALCANCE.titulo}</h1>
        </div>
        <AvisoAlcanceTexto />
        <button type="button" className={classBtn} onClick={onCerrar}>
          {accion}
        </button>
      </div>
    </div>
  );
}

export function LimiteTextoLibre({ children }: { children: string }) {
  return <p className="text-xs text-sky">{children}</p>;
}
