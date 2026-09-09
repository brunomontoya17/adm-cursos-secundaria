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

export function showDbError(message: string): void {
  void Swal.fire({
    ...SWAL_DB,
    icon: "error",
    title: "Error de base de datos",
    text: message,
  });
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
