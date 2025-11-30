import { createContext, useContext, useState, type ReactNode } from "react";

interface ScopeContextType {
  isGlobalView: boolean;
  setIsGlobalView: (value: boolean) => void;
  toggleScope: () => void;
}

const ScopeContext = createContext<ScopeContextType | undefined>(undefined);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [isGlobalView, setIsGlobalView] = useState(false);

  const toggleScope = () => {
    setIsGlobalView((prev) => !prev);
  };

  return (
    <ScopeContext.Provider value={{ isGlobalView, setIsGlobalView, toggleScope }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (context === undefined) {
    throw new Error("useScope must be used within a ScopeProvider");
  }
  return context;
}
