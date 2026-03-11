import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { setAccessToken, setRefreshToken } from "../lib/auth";

type LoginResponse = {
  access_token: string;
  token_type?: string;
  user?: { id: number; role: string; email: string; full_name: string };
};

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => email.trim().length > 3 && password.length >= 4 && !loading,
    [email, password, loading]
  );

  async function onSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/api/v1/auth/login", {
        email: email.trim(),
        password,
      });
      if (!res.data?.access_token) throw new Error("No token returned.");
      setAccessToken(res.data.access_token);
      if ((res.data as { refresh_token?: string }).refresh_token) {
        setRefreshToken((res.data as { refresh_token?: string }).refresh_token!);
      }

      let role = "student";
      try {
        const payload = JSON.parse(atob(res.data.access_token.split(".")[1]));
        role = payload.role ?? "student";
      } catch { /* fall back */ }

      if (role === "admin" || role === "co_admin") navigate("/admin");
      else if (role === "teacher") navigate("/teacher");
      else navigate("/student");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string; message?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.response?.data?.message || e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-white grid place-items-center font-bold text-sm tracking-tight">
            E
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-slate-900">EduWise</div>
            <div className="text-[11px] text-slate-400 -mt-0.5 tracking-wide">Learning Platform</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          <span className="text-xs text-slate-500 font-medium">All systems operational</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl grid gap-12 lg:grid-cols-2 lg:items-center">

          {/* Left: Branding */}
          <div className="hidden lg:flex flex-col gap-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 leading-tight">
                Welcome back to<br />
                <span className="text-slate-500">EduWise</span>
              </h1>
              <p className="mt-4 text-slate-500 leading-relaxed text-base max-w-sm">
                Your unified learning platform. Whether you're teaching, studying, or managing — everything you need is in one place.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                {
                  icon: (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  ),
                  label: "Courses & Lessons",
                  desc: "Rich content with assignments, quizzes, and certificates",
                },
                {
                  icon: (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  ),
                  label: "Smart Analytics",
                  desc: "AI-powered at-risk detection and progress insights",
                },
                {
                  icon: (
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  ),
                  label: "Direct Messaging",
                  desc: "Stay connected with teachers, students, and peers",
                },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-900 text-white">
                    {icon}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Login card */}
          <div className="mx-auto w-full max-w-sm">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">

              {/* Card header */}
              <div className="mb-6">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white mb-4">
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Welcome back — enter your credentials to continue.
                </p>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="shrink-0 mt-0.5 text-red-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Email address
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Password
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-slate-700 underline underline-offset-2">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-slate-400">
              EduWise · Secure Learning Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
