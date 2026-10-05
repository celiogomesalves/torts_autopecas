import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { appwrite, account } from "@/integrations/appwrite/client";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  user_metadata?: {
    name?: string;
    full_name?: string;
  };
}

export interface AppSession {
  user: AppUser | null;
  $id?: string;
}

interface AuthCtx {
  session: AppSession | null;
  user: AppUser | null;
  loading: boolean;
  currentCompanyId: string | null;
  setCurrentCompanyId: (id: string | null) => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

const COMPANY_KEY = "ap.currentCompanyId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
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
    // Timeout de segurança
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 1000);

    // Obter sessão atual do Appwrite
    account
      .get()
      .then((u) => {
        const mappedUser: AppUser = {
          id: u.$id,
          email: u.email,
          name: u.name,
          user_metadata: { name: u.name, full_name: u.name },
        };
        setSession({ user: mappedUser, $id: u.$id });
      })
      .catch(() => {
        setSession(null);
        setCurrentCompanyIdState(null);
        try {
          localStorage.removeItem(COMPANY_KEY);
        } catch {
          /* ignore */
        }
      })
      .finally(() => {
        clearTimeout(safetyTimeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(safetyTimeout);
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
