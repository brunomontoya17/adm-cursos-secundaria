export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** `input type="time"` a veces manda HH:MM:SS; el dominio es HH:MM. */
export function toHhMm(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^([01]\d|2[0-3]):[0-5]\d/);
  return match ? match[0].slice(0, 5) : trimmed;
}

export const inputClass =
  "w-full rounded-none border border-navy/20 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-navy";

export const btnPrimary =
  "inline-flex items-center justify-center bg-navy px-3 py-2 text-sm text-cream hover:bg-navy-mid disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center px-3 py-2 text-sm text-navy hover:bg-cream";

export const btnDanger =
  "inline-flex items-center justify-center px-2 py-1 text-sm text-crimson hover:bg-cream";

export const btnLink =
  "inline-flex items-center justify-center px-2 py-1 text-sm text-navy hover:bg-cream";
