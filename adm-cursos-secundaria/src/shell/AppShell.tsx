import {
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  GraduationCap,
  Home,
  StickyNote,
  Users,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAlcance } from "./AlcanceContext";
import AnioLectivoControl from "./AnioLectivoControl";

const NAV = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/cursos", label: "Cursos", icon: BookOpen, end: false },
  { to: "/alumnos", label: "Alumnos", icon: Users, end: false },
  { to: "/escuelas", label: "Escuelas", icon: Building2, end: false },
  { to: "/horarios", label: "Horarios", icon: CalendarClock, end: false },
  { to: "/calendario", label: "Calendario", icon: CalendarDays, end: false },
  { to: "/evaluaciones", label: "Evaluaciones", icon: ClipboardList, end: false },
  { to: "/notas", label: "Notas", icon: GraduationCap, end: false },
  { to: "/observaciones", label: "Observaciones", icon: StickyNote, end: false },
  { to: "/asistencia", label: "Asistencia", icon: CheckSquare, end: false },
] as const;

function AppShell() {
  const { abrirReleer } = useAlcance();
  return (
    <div className="flex h-screen min-h-0 flex-col bg-paper text-navy">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-navy/15 bg-navy px-4 text-cream">
        <img
          src="/logo.jpeg"
          alt=""
          className="h-9 w-9 rounded-full object-cover"
          draggable={false}
        />
        <h1 className="font-serif text-lg tracking-wide">
          Administración de cursos escolares
        </h1>
        <AnioLectivoControl />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Menú principal"
          className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-navy/20 bg-navy-deep py-3 text-paper"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 px-4 py-2 text-sm no-underline transition-colors",
                    isActive
                      ? "bg-cream text-navy hover:bg-cream hover:text-navy"
                      : "text-paper hover:bg-navy-mid hover:text-paper",
                  ].join(" ")
                }
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {item.label}
              </NavLink>
            );
          })}
          <button
            type="button"
            className="mt-auto px-4 py-2 text-left text-xs text-paper/70 hover:bg-navy-mid hover:text-paper"
            onClick={abrirReleer}
          >
            Alcance de este cuaderno
          </button>
        </nav>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-paper">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
