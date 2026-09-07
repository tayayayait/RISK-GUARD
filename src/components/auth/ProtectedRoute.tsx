import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6" aria-live="polite">
        <div className="flex items-center gap-3 text-body-sm text-neutral-600">
          <ShieldCheck className="h-5 w-5 animate-pulse text-primary-700" />
          로그인 상태를 확인하고 있습니다.
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
