import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthMessage(error: unknown) {
  if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED") {
    return "Supabase 연결 정보가 설정되지 않았습니다.";
  }
  return error instanceof Error ? error.message : "로그인 상태를 확인하지 못했습니다.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    try {
      const client = getSupabaseClient();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!active || event === "INITIAL_SESSION") {
          return;
        }
        setUser(session?.user ?? null);
        setError("");
        setLoading(false);
      });
      unsubscribe = () => data.subscription.unsubscribe();

      void client.auth.getUser().then(({ data: userData, error: userError }) => {
        if (!active) {
          return;
        }
        if (userError) {
          setUser(null);
          setError("");
        } else {
          setUser(userData.user ?? null);
        }
        setLoading(false);
      });
    } catch (initializationError) {
      if (active) {
        setError(toAuthMessage(initializationError));
        setLoading(false);
      }
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();
    const { data, error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      throw signInError;
    }
    setUser(data.user);
    setError("");
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();
    const { data, error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (signUpError) {
      throw signUpError;
    }
    if (data.session) {
      setUser(data.user);
    }
    setError("");
    return { confirmationRequired: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      throw signOutError;
    }
    setUser(null);
    setError("");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, signIn, signUp, signOut }),
    [error, loading, signIn, signOut, signUp, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
