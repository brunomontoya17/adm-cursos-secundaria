/**
 * Contrato IPC del dominio.
 * Fuente de verdad de columnas: `database.sql`.
 * Rust espejo: `src-tauri/src/domain.rs` (mismos nombres snake_case).
 * Cada respuesta de Tauri se parsea con Zod antes de usarse en React.
 */
import { invoke } from "@tauri-apps/api/core";
import { Temporal } from "@js-temporal/polyfill";
import Decimal from "decimal.js";
import { z } from "zod";
import { isTauriRuntime, showDbError } from "./feedback";

export class ApiError extends Error {
  readonly command: string;
  readonly cause: unknown;

  constructor(command: string, cause: unknown) {
    const detail =
      cause instanceof z.ZodError
        ? cause.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : cause instanceof Error
          ? cause.message
          : String(cause);
    super(`${command}: ${detail}`);
    this.name = "ApiError";
    this.command = command;
    this.cause = cause;
  }
}

function rustDbMessage(err: ApiError): string {
  const cause = err.cause;
  if (typeof cause === "string" && cause.trim().length > 0) return cause;
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message;
  return err.message;
}

export async function invokeChecked<T>(
  command: string,
  schema: z.ZodType<T>,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    const raw = await invoke(command, args);
    return schema.parse(raw);
  } catch (err) {
    const wrapped = err instanceof ApiError ? err : new ApiError(command, err);
    const fromZod = wrapped.cause instanceof z.ZodError;
    if (!fromZod && isTauriRuntime()) {
      showDbError(rustDbMessage(wrapped));
    }
    throw wrapped;
  }
}

// ---------------------------------------------------------------------------
// Primitivos (alineados al SQL: fechas TEXT ISO, notas TEXT decimal, flags 0|1)
// ---------------------------------------------------------------------------

export const idSchema = z.number().int().positive();
export const flag01Schema = z.union([z.literal(0), z.literal(1)]);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha YYYY-MM-DD")
  .refine((value) => {
    try {
      Temporal.PlainDate.from(value);
      return true;
    } catch {
      return false;
    }
  }, "fecha ISO inválida");

export const isoTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora HH:MM");

export const decimalTextSchema = z.string().refine((value) => {
  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
}, "decimal inválido");

export const diaSemanaSchema = z.number().int().min(1).max(7);

export const JURISDICCION_CODIGOS = ["pba", "caba", "otra"] as const;
export const TIPO_EVENTO_CODIGOS = [
  "tema",
  "entrega",
  "reunion",
  "junta",
  "acto",
  "otro",
] as const;
export const TIPO_EVALUACION_CODIGOS = [
  "escrito",
  "oral",
  "tp",
  "integrador",
  "recuperatorio",
] as const;
export const TIPO_OBSERVACION_CODIGOS = [
  "academica",
  "conducta",
  "seguimiento",
  "reunion_familia",
] as const;
export const ESTADO_ASISTENCIA_CODIGOS = [
  "presente",
  "ausente",
  "tarde",
  "justificado",
] as const;

export const jurisdiccionCodigoSchema = z.enum(JURISDICCION_CODIGOS);
export const tipoEventoCodigoSchema = z.enum(TIPO_EVENTO_CODIGOS);
export const tipoEvaluacionCodigoSchema = z.enum(TIPO_EVALUACION_CODIGOS);
export const tipoObservacionCodigoSchema = z.enum(TIPO_OBSERVACION_CODIGOS);
export const estadoAsistenciaCodigoSchema = z.enum(ESTADO_ASISTENCIA_CODIGOS);

const nombreSchema = z.string().min(1);
const textoOpcionalSchema = z.string().min(1).nullable();

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export const turnoSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
});

export const divisionSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
});

export const cicloSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
  orden: z.number().int().positive(),
});

export const anioLectivoSchema = z.object({
  id: idSchema,
  anio: z.number().int(),
  activo: flag01Schema,
});

export const jurisdiccionSchema = z.object({
  id: idSchema,
  codigo: jurisdiccionCodigoSchema,
  nombre: nombreSchema,
});

export const tipoEventoSchema = z.object({
  id: idSchema,
  codigo: tipoEventoCodigoSchema,
  nombre: nombreSchema,
});

export const tipoEvaluacionSchema = z.object({
  id: idSchema,
  codigo: tipoEvaluacionCodigoSchema,
  nombre: nombreSchema,
});

export const tipoObservacionSchema = z.object({
  id: idSchema,
  codigo: tipoObservacionCodigoSchema,
  nombre: nombreSchema,
});

export const estadoAsistenciaSchema = z.object({
  id: idSchema,
  codigo: estadoAsistenciaCodigoSchema,
  nombre: nombreSchema,
});

// ---------------------------------------------------------------------------
// Maestras (solo lo que el profesor dicta)
// ---------------------------------------------------------------------------

export const escuelaSchema = z.object({
  id: idSchema,
  id_jurisdiccion: idSchema,
  nombre: nombreSchema,
  nombre_corto: textoOpcionalSchema,
  direccion: textoOpcionalSchema,
  telefono: textoOpcionalSchema,
  email: z.string().email().nullable(),
});

export const materiaSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
});

export const cursoSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
  id_escuela: idSchema,
  id_turno: idSchema,
  id_division: idSchema,
  id_ciclo: idSchema,
  id_materia: idSchema,
  id_anio_lectivo: idSchema,
  orientacion: textoOpcionalSchema,
});

export const alumnoSchema = z.object({
  id: idSchema,
  nombre: nombreSchema,
  apellido: nombreSchema,
  dni: textoOpcionalSchema,
  email: z.string().email().nullable(),
  telefono: textoOpcionalSchema,
  fecha_nacimiento: isoDateSchema.nullable(),
});

export const alumnoCursoSchema = z.object({
  id: idSchema,
  id_alumno: idSchema,
  id_curso: idSchema,
});

export const horarioSchema = z.object({
  id: idSchema,
  id_curso: idSchema,
  dia_semana: diaSemanaSchema,
  hora_inicio: isoTimeSchema,
  hora_fin: isoTimeSchema,
  aula: textoOpcionalSchema,
});

// ---------------------------------------------------------------------------
// Operativa
// ---------------------------------------------------------------------------

export const eventoSchema = z.object({
  id: idSchema,
  id_curso: idSchema.nullable(),
  id_tipo_evento: idSchema,
  fecha: isoDateSchema,
  hora: isoTimeSchema.nullable(),
  titulo: nombreSchema,
  descripcion: textoOpcionalSchema,
});

export const evaluacionSchema = z.object({
  id: idSchema,
  id_curso: idSchema,
  id_tipo_evaluacion: idSchema,
  id_evaluacion_origen: idSchema.nullable(),
  titulo: nombreSchema,
  fecha: isoDateSchema,
  tema: textoOpcionalSchema,
  ponderacion: decimalTextSchema,
});

const notaAusenteRule = (
  nota: { ausente: Flag01; valor: string | null },
  ctx: z.RefinementCtx,
) => {
  if (nota.ausente === 1 && nota.valor !== null) {
    ctx.addIssue({
      code: "custom",
      message: "ausente=1 implica valor null",
      path: ["valor"],
    });
  }
};

const notaObjectSchema = z.object({
  id: idSchema,
  id_evaluacion: idSchema,
  id_alumno: idSchema,
  valor: decimalTextSchema.nullable(),
  ausente: flag01Schema,
  comentario: textoOpcionalSchema,
});

export const notaSchema = notaObjectSchema.superRefine(notaAusenteRule);

export const observacionSchema = z.object({
  id: idSchema,
  id_alumno: idSchema,
  id_curso: idSchema,
  id_tipo_observacion: idSchema,
  fecha: isoDateSchema,
  texto: nombreSchema,
});

export const asistenciaSchema = z.object({
  id: idSchema,
  id_curso: idSchema,
  id_alumno: idSchema,
  fecha: isoDateSchema,
  id_estado_asistencia: idSchema,
});

export const dbStatusSchema = z.object({
  path: z.string().min(1),
  foreign_keys: flag01Schema,
  journal_mode: z.string().min(1),
  tables: z.number().int().nonnegative(),
});

export const escuelaWriteSchema = escuelaSchema.omit({ id: true });
export const materiaWriteSchema = materiaSchema.omit({ id: true });
export const cursoWriteSchema = cursoSchema.omit({ id: true });
export const alumnoWriteSchema = alumnoSchema.omit({ id: true });
export const alumnoCursoWriteSchema = alumnoCursoSchema.omit({ id: true });
export const horarioWriteSchema = horarioSchema.omit({ id: true });
export const eventoWriteSchema = eventoSchema.omit({ id: true });
export const evaluacionWriteSchema = evaluacionSchema.omit({ id: true });
export const notaWriteSchema = notaObjectSchema.omit({ id: true }).superRefine(notaAusenteRule);
export const observacionWriteSchema = observacionSchema.omit({ id: true });
export const asistenciaWriteSchema = asistenciaSchema.omit({ id: true });

export type Flag01 = z.infer<typeof flag01Schema>;
export type Turno = z.infer<typeof turnoSchema>;
export type Division = z.infer<typeof divisionSchema>;
export type Ciclo = z.infer<typeof cicloSchema>;
export type AnioLectivo = z.infer<typeof anioLectivoSchema>;
export type Jurisdiccion = z.infer<typeof jurisdiccionSchema>;
export type TipoEvento = z.infer<typeof tipoEventoSchema>;
export type TipoEvaluacion = z.infer<typeof tipoEvaluacionSchema>;
export type TipoObservacion = z.infer<typeof tipoObservacionSchema>;
export type EstadoAsistencia = z.infer<typeof estadoAsistenciaSchema>;
export type Escuela = z.infer<typeof escuelaSchema>;
export type Materia = z.infer<typeof materiaSchema>;
export type Curso = z.infer<typeof cursoSchema>;
export type Alumno = z.infer<typeof alumnoSchema>;
export type AlumnoCurso = z.infer<typeof alumnoCursoSchema>;
export type Horario = z.infer<typeof horarioSchema>;
export type Evento = z.infer<typeof eventoSchema>;
export type Evaluacion = z.infer<typeof evaluacionSchema>;
export type Nota = z.infer<typeof notaSchema>;
export type Observacion = z.infer<typeof observacionSchema>;
export type Asistencia = z.infer<typeof asistenciaSchema>;
export type DbStatus = z.infer<typeof dbStatusSchema>;
export type EscuelaWrite = z.infer<typeof escuelaWriteSchema>;
export type MateriaWrite = z.infer<typeof materiaWriteSchema>;
export type CursoWrite = z.infer<typeof cursoWriteSchema>;
export type AlumnoWrite = z.infer<typeof alumnoWriteSchema>;
export type AlumnoCursoWrite = z.infer<typeof alumnoCursoWriteSchema>;
export type HorarioWrite = z.infer<typeof horarioWriteSchema>;
export type EventoWrite = z.infer<typeof eventoWriteSchema>;
export type EvaluacionWrite = z.infer<typeof evaluacionWriteSchema>;
export type NotaWrite = z.infer<typeof notaWriteSchema>;
export type ObservacionWrite = z.infer<typeof observacionWriteSchema>;
export type AsistenciaWrite = z.infer<typeof asistenciaWriteSchema>;

/** Comandos Tauri existentes. Ampliar acá al agregar handlers en Rust. */
export const api = {
  greet: (name: string) => invokeChecked("greet", z.string(), { name }),
  dbStatus: () => invokeChecked("db_status", dbStatusSchema),
};
