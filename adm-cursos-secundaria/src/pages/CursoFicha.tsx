import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  api,
  type Ciclo,
  type Curso,
  type Escuela,
  type Materia,
  type Nivel,
} from "../api";
import { confirmAction } from "../feedback";
import { btnDanger, btnGhost, btnPrimary } from "../form";

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-sky">{label}</dt>
      <dd className="mt-1 text-navy">{value}</dd>
    </div>
  );
}

function CursoFicha() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cursoId = Number(id);
  const [curso, setCurso] = useState<Curso | null>(null);
  const [escuela, setEscuela] = useState<Escuela | null>(null);
  const [materia, setMateria] = useState<Materia | null>(null);
  const [ciclo, setCiclo] = useState<Ciclo | null>(null);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [turno, setTurno] = useState<string>("—");
  const [division, setDivision] = useState<string>("—");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(cursoId) || cursoId <= 0) {
      setMissing(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await api.getCurso(cursoId);
        const [escuelas, materias, ciclos, niveles, turnos, divisiones] = await Promise.all([
          api.listEscuelas(),
          api.listMaterias(),
          api.listCiclos(),
          api.listNiveles(),
          api.listTurnos(),
          api.listDivisiones(),
        ]);
        if (cancelled) return;
        setCurso(row);
        setEscuela(escuelas.find((e) => e.id === row.id_escuela) ?? null);
        setMateria(materias.find((m) => m.id === row.id_materia) ?? null);
        const c = ciclos.find((item) => item.id === row.id_ciclo) ?? null;
        setCiclo(c);
        setNivel(c ? (niveles.find((n) => n.id === c.id_nivel) ?? null) : null);
        setTurno(turnos.find((t) => t.id === row.id_turno)?.nombre ?? "—");
        setDivision(divisiones.find((d) => d.id === row.id_division)?.nombre ?? "—");
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cursoId]);

  async function onDelete() {
    if (!curso) return;
    const ok = await confirmAction({
      title: "¿Borrar este dictado?",
      text: `${curso.nombre}. Se borran horarios, notas y demás datos de este curso.`,
      confirmText: "Borrar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCurso(curso.id);
      toast.success("Curso borrado");
      navigate("/cursos");
    } catch {
      /* Swal */
    }
  }

  if (missing) {
    return (
      <section className="space-y-4 p-6">
        <p className="text-navy">No se encontró el curso.</p>
        <Link to="/cursos" className={`${btnGhost} no-underline`}>
          Volver a cursos
        </Link>
      </section>
    );
  }

  if (!curso) {
    return (
      <section className="p-6">
        <p className="text-sm text-sky">Cargando…</p>
      </section>
    );
  }

  return (
    <section className="space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-sky">
            {nivel?.nombre ?? "Curso"}
          </p>
          <h2 className="font-serif text-2xl text-navy">{curso.nombre}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/cursos" className={`${btnGhost} no-underline`}>
            Volver
          </Link>
          <button type="button" className={btnPrimary} onClick={() => navigate("/cursos")}>
            Editar en el listado
          </button>
          <button type="button" className={btnDanger} onClick={() => void onDelete()}>
            Borrar
          </button>
        </div>
      </div>

      <dl className="grid gap-4 border border-navy/15 bg-cream/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Dato label="Escuela" value={escuela?.nombre ?? "—"} />
        <Dato label="Materia" value={materia?.nombre ?? "—"} />
        <Dato label="Nivel" value={nivel?.nombre ?? "—"} />
        <Dato label="Grado / año" value={ciclo?.nombre ?? "—"} />
        <Dato label="División" value={division} />
        <Dato label="Turno" value={turno} />
        <Dato label="Orientación" value={curso.orientacion ?? "—"} />
      </dl>

      <div className="grid gap-4 lg:grid-cols-3">
        <Placeholder titulo="Alumnos" detalle="Nómina de este dictado (paso 3)." />
        <Placeholder titulo="Horario" detalle="Día y hora de este dictado (paso 4)." />
        <Placeholder titulo="Próximas fechas" detalle="Evaluaciones y eventos (pasos 5 y 8)." />
      </div>
    </section>
  );
}

function Placeholder({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="border border-dashed border-navy/20 p-4">
      <h3 className="font-medium text-navy">{titulo}</h3>
      <p className="mt-1 text-sm text-sky">{detalle}</p>
    </div>
  );
}

export default CursoFicha;
