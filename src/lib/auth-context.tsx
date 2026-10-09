import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  currentCompanyId: string | null;
  setCurrentCompanyId: (id: string | null) => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

const COMPANY_KEY = "ap.currentCompanyId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCompanyId, setCurrentCompanyIdState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem(COMPANY_KEY);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    // Listener PRIMEIRO (evita race conditions)
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setLoading(false);
      if (!s) {
        setCurrentCompanyIdState(null);
        try {
          localStorage.removeItem(COMPANY_KEY);
        } catch {
          /* ignore */
        }
      }
    });

    // Hidrata sessão atual
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((err) => {
        console.error("Erro ao obter sessão:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      sub.subscription.unsubscribe();
    };

  }, []);

  const setCurrentCompanyId = (id: string | null) => {
    setCurrentCompanyIdState(id);
    try {
      if (id) localStorage.setItem(COMPANY_KEY, id);
      else localStorage.removeItem(COMPANY_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        currentCompanyId,
        setCurrentCompanyId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
