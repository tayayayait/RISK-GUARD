import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

type LoginMode = "sign-in" | "sign-up";

export default function Login() {
  const { user, loading, error: configurationError, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<LoginMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const redirectPath = (
    location.state as { from?: { pathname?: string; search?: string } } | null
  )?.from;
  const destination = redirectPath?.pathname
    ? `${redirectPath.pathname}${redirectPath.search ?? ""}`
    : "/";

  if (!loading && user) {
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setMessage("");

    if (!email.trim() || password.length < 8) {
      setFormError("이메일과 8자 이상의 비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signIn(email, password);
        navigate(destination, { replace: true });
      } else {
        const result = await signUp(email, password);
        if (result.confirmationRequired) {
          setMessage("확인 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.");
          setMode("sign-in");
          setPassword("");
        } else {
          navigate(destination, { replace: true });
        }
      }
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "인증 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface shadow-lg lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden bg-primary-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8" />
            <span className="text-heading-2">RISK-GUARD</span>
          </div>
          <div>
            <p className="mb-4 text-label-md text-primary-100">안전 업무 기록을 한 계정에</p>
            <h1 className="max-w-md text-4xl font-bold leading-tight">
              분석부터 문서와 현장 기록까지 안전하게 이어서 작업하세요.
            </h1>
            <p className="mt-6 max-w-md text-body-md leading-7 text-primary-100">
              로그인한 사용자만 서비스를 이용하며, 저장한 작업은 다른 사용자와 분리되어 관리됩니다.
            </p>
          </div>
          <p className="text-caption text-primary-200">Supabase Auth · Row Level Security</p>
        </section>

        <section className="flex items-center p-7 sm:p-12">
          <div className="w-full">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-2 text-primary-900">
                <Shield className="h-7 w-7" />
                <span className="text-heading-3">RISK-GUARD</span>
              </div>
            </div>
            <p className="text-label-md text-primary-700">
              {mode === "sign-in" ? "계정 로그인" : "새 계정 만들기"}
            </p>
            <h2 className="mt-2 text-heading-1 text-neutral-900">
              {mode === "sign-in" ? "작업 기록을 이어서 확인하세요" : "안전 업무 공간을 시작하세요"}
            </h2>
            <p className="mt-3 text-body-sm leading-6 text-neutral-600">
              이메일과 비밀번호로 인증합니다. 기록은 로그인한 계정에만 표시됩니다.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="auth-email">이메일</Label>
                <div className="relative mt-2">
                  <Mail className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-neutral-400" />
                  <Input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 pl-10"
                    placeholder="worker@example.com"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="auth-password">비밀번호</Label>
                <div className="relative mt-2">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-neutral-400" />
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 pl-10"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              {(configurationError || formError) && (
                <p className="rounded-radius-md border border-danger-200 bg-danger-050 px-3 py-2 text-body-sm text-danger-700" role="alert">
                  {formError || configurationError}
                </p>
              )}
              {message && (
                <p className="rounded-radius-md border border-success-200 bg-success-050 px-3 py-2 text-body-sm text-success-700" role="status">
                  {message}
                </p>
              )}

              <Button type="submit" className="h-11 w-full" disabled={submitting || Boolean(configurationError)}>
                {submitting ? "처리 중..." : mode === "sign-in" ? "로그인" : "계정 만들기"}
                {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <button
              type="button"
              className="mt-6 w-full text-center text-body-sm text-primary-700 hover:text-primary-900"
              onClick={() => {
                setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
                setFormError("");
                setMessage("");
              }}
            >
              {mode === "sign-in" ? "처음이신가요? 계정 만들기" : "이미 계정이 있나요? 로그인"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
