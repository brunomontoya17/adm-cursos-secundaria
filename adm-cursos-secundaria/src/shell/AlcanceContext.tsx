import { createContext, useContext, type ReactNode } from "react";

type AlcanceContextValue = {
  abrirReleer: () => void;
};

const AlcanceContext = createContext<AlcanceContextValue | null>(null);

export function AlcanceProvider({
  children,
  abrirReleer,
}: {
  children: ReactNode;
  abrirReleer: () => void;
}) {
  return <AlcanceContext.Provider value={{ abrirReleer }}>{children}</AlcanceContext.Provider>;
}

export function useAlcance() {
  const ctx = useContext(AlcanceContext);
  if (!ctx) {
    throw new Error("useAlcance requiere AlcanceProvider");
  }
  return ctx;
}
