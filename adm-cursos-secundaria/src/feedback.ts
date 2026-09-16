import Swal from "sweetalert2";

/** Swal sin bounce/animación. Sin debounce: cada error de BD se muestra al instante. */
const SWAL_DB = {
  animation: false,
  showClass: { popup: "", backdrop: "", icon: "" },
  hideClass: { popup: "", backdrop: "", icon: "" },
  confirmButtonColor: "#0b2540",
  buttonsStyling: true,
} as const;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function showInfo(title: string, text: string): Promise<void> {
  return Swal.fire({
    ...SWAL_DB,
    icon: "info",
    title,
    text,
  }).then(() => undefined);
}

export function showDbError(message: string): void {
  void Swal.fire({
    ...SWAL_DB,
    icon: "error",
    title: "Error de base de datos",
    text: message,
  });
}

export async function pickSelect(opts: {
  title: string;
  text?: string;
  confirmText: string;
  options: { value: string; label: string }[];
}): Promise<string | null> {
  if (opts.options.length === 0) return null;
  const inputOptions = Object.fromEntries(opts.options.map((o) => [o.value, o.label]));
  const result = await Swal.fire({
    ...SWAL_DB,
    icon: "question",
    title: opts.title,
    text: opts.text,
    input: "select",
    inputOptions,
    inputValue: opts.options[0]?.value,
    showCancelButton: true,
    confirmButtonText: opts.confirmText,
    cancelButtonText: "Cancelar",
  });
  if (!result.isConfirmed) return null;
  const value = String(result.value ?? "");
  return value.length > 0 ? value : null;
}

export async function confirmAction(opts: {
  title: string;
  text?: string;
  confirmText: string;
  danger?: boolean;
}): Promise<boolean> {
  const result = await Swal.fire({
    ...SWAL_DB,
    icon: opts.danger ? "warning" : "question",
    title: opts.title,
    text: opts.text,
    showCancelButton: true,
    confirmButtonText: opts.confirmText,
    cancelButtonText: "Cancelar",
    confirmButtonColor: opts.danger ? "#b43b42" : "#0b2540",
  });
  return result.isConfirmed;
}
