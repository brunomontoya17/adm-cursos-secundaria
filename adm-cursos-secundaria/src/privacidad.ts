/** Copia del aviso de alcance (paso 12). El persistido es `{app_data_dir}/privacidad.json`. */

export const LIMITE_TEXTO_LIBRE =
  "Solo lo pedagógico de ese dictado: no diagnósticos, certificados, DNI, domicilio ni el relato de una reunión con la familia.";

export const LIMITE_COMENTARIO_NOTA =
  "El comentario de la nota no es el certificado médico ni un diagnóstico.";

export const LIMITE_ASISTENCIA_JUSTIFICADO =
  "Ausente justificado es solo el estado; no anotes el motivo médico.";

export function placeholderObservacion(codigo: string | undefined, fecha: string): string {
  if (codigo === "reunion_familia") {
    return fecha
      ? `Se reunió el ${fecha}`
      : "Se reunió el YYYY-MM-DD / Pendiente de reprogramar";
  }
  return "Tema visto, seguimiento del trabajo en clase…";
}

export const AVISO_ALCANCE = {
  titulo: "Este es tu cuaderno privado",
  lead: "No es la planilla oficial, el boletín ni el SIEE.",
  puntos: [
    "Se guarda en este equipo: nombre y apellido de tus alumnos, notas, asistencia y observaciones de ese dictado.",
    "No se envía a la escuela, al ministerio, a internet ni a un modelo de IA.",
    "No anotes diagnósticos, certificados, DNI, domicilio ni relatos de reuniones con la familia.",
    "Para borrar a una persona (inscripciones, notas, asistencia y observaciones): Alumnos → Borrar.",
  ],
} as const;
