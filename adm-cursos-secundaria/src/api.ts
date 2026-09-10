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

/** ISO 8601: 1 lunes … 7 domingo. */
export const DIAS_SEMANA = [
  { id: 1, nombre: "Lunes", corto: "Lun" },
  { id: 2, nombre: "Martes", corto: "Mar" },
  { id: 3, nombre: "Miércoles", corto: "Mié" },
  { id: 4, nombre: "Jueves", corto: "Jue" },
  { id: 5, nombre: "Viernes", corto: "Vie" },
  { id: 6, nombre: "Sábado", corto: "Sáb" },
  { id: 7, nombre: "Domingo", corto: "Dom" },
] as const;

export function nombreDia(dia: number): string {
  return DIAS_SEMANA.find((d) => d.id === dia)?.nombre ?? String(dia);
}

export const JURISDICCION_CODIGOS = ["pba", "caba", "otra"] as const;
export const NIVEL_CODIGOS = ["primaria", "secundaria"] as const;
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
export const nivelCodigoSchema = z.enum(NIVEL_CODIGOS);
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

export const nivelSchema = z.object({
  id: idSchema,
  codigo: nivelCodigoSchema,
  nombre: nombreSchema,
});

export const cicloSchema = z.object({
  id: idSchema,
  id_nivel: idSchema,
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

export const escuelaWriteSchema = escuelaSchema.omit({ id: true }).extend({
  nombre: z.string().min(1, "El nombre es obligatorio."),
  email: z.string().email("El email no es válido.").nullable(),
});
export const materiaWriteSchema = materiaSchema.omit({ id: true }).extend({
  nombre: z.string().min(1, "El nombre es obligatorio."),
});
export const cursoWriteSchema = cursoSchema.omit({ id: true }).extend({
  nombre: z.string().min(1, "El nombre es obligatorio."),
});
export const alumnoWriteSchema = alumnoSchema.omit({ id: true }).extend({
  nombre: z.string().min(1, "El nombre es obligatorio."),
  apellido: z.string().min(1, "El apellido es obligatorio."),
  email: z.string().email("El email no es válido.").nullable(),
});
export const alumnoCursoWriteSchema = alumnoCursoSchema.omit({ id: true });
export const horarioWriteSchema = horarioSchema.omit({ id: true }).superRefine((h, ctx) => {
  try {
    if (Temporal.PlainTime.from(h.hora_fin).since(Temporal.PlainTime.from(h.hora_inicio)).sign <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "La hora de fin debe ser posterior a la de inicio.",
        path: ["hora_fin"],
      });
    }
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "Hora inválida.",
      path: ["hora_inicio"],
    });
  }
});
export const eventoWriteSchema = eventoSchema.omit({ id: true }).extend({
  titulo: z.string().min(1, "El título es obligatorio."),
});
export const evaluacionWriteSchema = evaluacionSchema.omit({ id: true }).extend({
  titulo: z.string().min(1, "El título es obligatorio."),
  ponderacion: decimalTextSchema.refine((value) => {
    try {
      return new Decimal(value).gt(0);
    } catch {
      return false;
    }
  }, "La ponderación debe ser mayor que 0."),
});
export const notaWriteSchema = notaObjectSchema
  .omit({ id: true })
  .extend({
    valor: decimalTextSchema
      .refine((value) => {
        try {
          const d = new Decimal(value);
          return d.gte(1) && d.lte(10);
        } catch {
          return false;
        }
      }, "La nota tiene que estar entre 1 y 10.")
      .nullable(),
  })
  .superRefine(notaAusenteRule);
export const observacionWriteSchema = observacionSchema.omit({ id: true }).extend({
  texto: z.string().min(1, "El texto es obligatorio."),
});
export const asistenciaWriteSchema = asistenciaSchema.omit({ id: true });

export type Flag01 = z.infer<typeof flag01Schema>;
export type Turno = z.infer<typeof turnoSchema>;
export type Division = z.infer<typeof divisionSchema>;
export type Nivel = z.infer<typeof nivelSchema>;
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

const voidResultSchema = z.null();

/** Comandos Tauri: argumentos de invoke en snake_case (`rename_all` en Rust). */
export const api = {
  greet: (name: string) => invokeChecked("greet", z.string(), { name }),
  dbStatus: () => invokeChecked("db_status", dbStatusSchema),
  listJurisdicciones: () =>
    invokeChecked("list_jurisdicciones", z.array(jurisdiccionSchema)),
  listTurnos: () => invokeChecked("list_turnos", z.array(turnoSchema)),
  listDivisiones: () => invokeChecked("list_divisiones", z.array(divisionSchema)),
  listNiveles: () => invokeChecked("list_niveles", z.array(nivelSchema)),
  listCiclos: () => invokeChecked("list_ciclos", z.array(cicloSchema)),
  listTiposEvaluacion: () =>
    invokeChecked("list_tipos_evaluacion", z.array(tipoEvaluacionSchema)),
  listTiposEvento: () => invokeChecked("list_tipos_evento", z.array(tipoEventoSchema)),
  listEstadosAsistencia: () =>
    invokeChecked("list_estados_asistencia", z.array(estadoAsistenciaSchema)),
  listTiposObservacion: () =>
    invokeChecked("list_tipos_observacion", z.array(tipoObservacionSchema)),
  listEscuelas: () => invokeChecked("list_escuelas", z.array(escuelaSchema)),
  createEscuela: (escuela: EscuelaWrite) =>
    invokeChecked("create_escuela", escuelaSchema, { escuela }),
  updateEscuela: (id: number, escuela: EscuelaWrite) =>
    invokeChecked("update_escuela", escuelaSchema, { id, escuela }),
  deleteEscuela: (id: number) => invokeChecked("delete_escuela", voidResultSchema, { id }),
  listMaterias: () => invokeChecked("list_materias", z.array(materiaSchema)),
  createMateria: (materia: MateriaWrite) =>
    invokeChecked("create_materia", materiaSchema, { materia }),
  updateMateria: (id: number, materia: MateriaWrite) =>
    invokeChecked("update_materia", materiaSchema, { id, materia }),
  deleteMateria: (id: number) => invokeChecked("delete_materia", voidResultSchema, { id }),
  listAniosLectivos: () =>
    invokeChecked("list_anios_lectivos", z.array(anioLectivoSchema)),
  createAnioLectivo: (anio: number) =>
    invokeChecked("create_anio_lectivo", anioLectivoSchema, { anio }),
  activarAnioLectivo: (id: number) =>
    invokeChecked("activar_anio_lectivo", anioLectivoSchema, { id }),
  listCursos: (id_anio_lectivo: number) =>
    invokeChecked("list_cursos", z.array(cursoSchema), { id_anio_lectivo }),
  getCurso: (id: number) => invokeChecked("get_curso", cursoSchema, { id }),
  createCurso: (curso: CursoWrite) => invokeChecked("create_curso", cursoSchema, { curso }),
  updateCurso: (id: number, curso: CursoWrite) =>
    invokeChecked("update_curso", cursoSchema, { id, curso }),
  deleteCurso: (id: number) => invokeChecked("delete_curso", voidResultSchema, { id }),
  listAlumnos: () => invokeChecked("list_alumnos", z.array(alumnoSchema)),
  getAlumno: (id: number) => invokeChecked("get_alumno", alumnoSchema, { id }),
  createAlumno: (alumno: AlumnoWrite) =>
    invokeChecked("create_alumno", alumnoSchema, { alumno }),
  updateAlumno: (id: number, alumno: AlumnoWrite) =>
    invokeChecked("update_alumno", alumnoSchema, { id, alumno }),
  deleteAlumno: (id: number) => invokeChecked("delete_alumno", voidResultSchema, { id }),
  listAlumnosDeCurso: (id_curso: number) =>
    invokeChecked("list_alumnos_de_curso", z.array(alumnoSchema), { id_curso }),
  listInscripciones: (id_anio_lectivo: number) =>
    invokeChecked("list_inscripciones", z.array(alumnoCursoSchema), { id_anio_lectivo }),
  inscribirAlumno: (id_alumno: number, id_curso: number) =>
    invokeChecked("inscribir_alumno", alumnoCursoSchema, { id_alumno, id_curso }),
  desinscribirAlumno: (id_alumno: number, id_curso: number) =>
    invokeChecked("desinscribir_alumno", voidResultSchema, { id_alumno, id_curso }),
  listHorarios: (id_anio_lectivo: number) =>
    invokeChecked("list_horarios", z.array(horarioSchema), { id_anio_lectivo }),
  listHorariosDeCurso: (id_curso: number) =>
    invokeChecked("list_horarios_de_curso", z.array(horarioSchema), { id_curso }),
  createHorario: (horario: HorarioWrite) =>
    invokeChecked("create_horario", horarioSchema, { horario }),
  updateHorario: (id: number, horario: HorarioWrite) =>
    invokeChecked("update_horario", horarioSchema, { id, horario }),
  deleteHorario: (id: number) => invokeChecked("delete_horario", voidResultSchema, { id }),
  listEvaluaciones: (id_anio_lectivo: number) =>
    invokeChecked("list_evaluaciones", z.array(evaluacionSchema), { id_anio_lectivo }),
  listEvaluacionesDeCurso: (id_curso: number) =>
    invokeChecked("list_evaluaciones_de_curso", z.array(evaluacionSchema), { id_curso }),
  getEvaluacion: (id: number) => invokeChecked("get_evaluacion", evaluacionSchema, { id }),
  createEvaluacion: (evaluacion: EvaluacionWrite) =>
    invokeChecked("create_evaluacion", evaluacionSchema, { evaluacion }),
  updateEvaluacion: (id: number, evaluacion: EvaluacionWrite) =>
    invokeChecked("update_evaluacion", evaluacionSchema, { id, evaluacion }),
  deleteEvaluacion: (id: number) =>
    invokeChecked("delete_evaluacion", voidResultSchema, { id }),
  listNotasDeCurso: (id_curso: number) =>
    invokeChecked("list_notas_de_curso", z.array(notaSchema), { id_curso }),
  upsertNota: (nota: NotaWrite) =>
    invokeChecked("upsert_nota", notaSchema.nullable(), { nota }),
  deleteNota: (id: number) => invokeChecked("delete_nota", voidResultSchema, { id }),
  listAsistencias: (id_curso: number, fecha: string) =>
    invokeChecked("list_asistencias", z.array(asistenciaSchema), { id_curso, fecha }),
  upsertAsistencia: (asistencia: AsistenciaWrite) =>
    invokeChecked("upsert_asistencia", asistenciaSchema, { asistencia }),
  marcarAsistenciasPresentes: (id_curso: number, fecha: string) =>
    invokeChecked("marcar_asistencias_presentes", z.array(asistenciaSchema), {
      id_curso,
      fecha,
    }),
  deleteAsistencia: (id: number) =>
    invokeChecked("delete_asistencia", voidResultSchema, { id }),
  listEventos: (id_anio_lectivo: number) =>
    invokeChecked("list_eventos", z.array(eventoSchema), { id_anio_lectivo }),
  listEventosDeCurso: (id_curso: number) =>
    invokeChecked("list_eventos_de_curso", z.array(eventoSchema), { id_curso }),
  createEvento: (evento: EventoWrite) =>
    invokeChecked("create_evento", eventoSchema, { evento }),
  updateEvento: (id: number, evento: EventoWrite) =>
    invokeChecked("update_evento", eventoSchema, { id, evento }),
  deleteEvento: (id: number) => invokeChecked("delete_evento", voidResultSchema, { id }),
  listObservaciones: (id_anio_lectivo: number) =>
    invokeChecked("list_observaciones", z.array(observacionSchema), { id_anio_lectivo }),
  listObservacionesDeCurso: (id_curso: number) =>
    invokeChecked("list_observaciones_de_curso", z.array(observacionSchema), { id_curso }),
  listObservacionesDeAlumno: (id_alumno: number, id_anio_lectivo: number) =>
    invokeChecked("list_observaciones_de_alumno", z.array(observacionSchema), {
      id_alumno,
      id_anio_lectivo,
    }),
  createObservacion: (observacion: ObservacionWrite) =>
    invokeChecked("create_observacion", observacionSchema, { observacion }),
  updateObservacion: (id: number, observacion: ObservacionWrite) =>
    invokeChecked("update_observacion", observacionSchema, { id, observacion }),
  deleteObservacion: (id: number) =>
    invokeChecked("delete_observacion", voidResultSchema, { id }),
};
