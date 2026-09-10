import { Temporal } from "@js-temporal/polyfill";
import Decimal from "decimal.js";

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeDecimalText(value: string): string {
  return value.trim().replace(",", ".");
}

/** Promedio ponderado en pantalla; no se persiste. Ausentes y celdas vacías no entran. */
export function promedioPonderado(
  items: { valor: string | null; ausente: 0 | 1; ponderacion: string }[],
): Decimal | null {
  let suma = new Decimal(0);
  let pesos = new Decimal(0);
  for (const item of items) {
    if (item.ausente === 1 || item.valor === null || item.valor.trim() === "") continue;
    try {
      const v = new Decimal(item.valor);
      const p = new Decimal(item.ponderacion);
      if (!v.isFinite() || !p.isFinite() || p.lte(0)) continue;
      suma = suma.plus(v.times(p));
      pesos = pesos.plus(p);
    } catch {
      continue;
    }
  }
  if (pesos.lte(0)) return null;
  return suma.div(pesos);
}

export function formatDecimal(value: Decimal | null, places = 2): string {
  if (!value) return "—";
  return value.toDecimalPlaces(places).toFixed(places);
}

export function formatFecha(iso: string): string {
  try {
    const d = Temporal.PlainDate.from(iso);
    return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export function hoyIso(): string {
  return Temporal.Now.plainDateISO().toString();
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
