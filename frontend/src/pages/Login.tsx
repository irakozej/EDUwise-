import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { setAccessToken } from "../lib/auth";

type LoginResponse = {
  access_token: string;
  token_type?: string;
  user?: { id: number; role: string; email: string; full_name: string };
  // if your backend returns different fields, this still works as long as access_token exists
};

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("student1@eduwise.com");
  const [password, setPassword] = useState("Passw0rd!");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 4 && !loading;
  }, [email, password, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post<LoginResponse>("/api/v1/auth/login", {
        email: email.trim(),
        password,
      });

      if (!res.data?.access_token) {
        throw new Error("Login succeeded but no token returned.");
      }

      setAccessToken(res.data.access_token);

      // If your backend includes role in response, you can route by role.
      // Otherwise, just send student to /student for your demo.
      const role = res.data.user?.role;
      if (role === "teacher") {
        navigate("/teacher"); // only if you have this route; otherwise comment it out
      } else {
        navigate("/student");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top subtle header */}
      <div className="mx-auto max-w-6xl px-4 pt-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">
              E
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight">EduWise</div>
              <div className="text-sm text-slate-500 -mt-0.5">Learning + Analytics</div>
            </div>
          </div>
          <div className="hidden sm:block text-sm text-slate-500">
             → student dashboard
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          {/* Left: marketing / value */}
          <div className="hidden lg:block">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Welcome back to EduWise Student Portal 
            </h1>
            <p className="mt-3 text-slate-600 leading-relaxed">
              Track progress, attempt quizzes, and get AI-powered learning recommendations
              based on your enrolled courses.
            </p>

            <div className="mt-8 grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Student Dashboard</div>
                <div className="mt-1 text-sm text-slate-600">
                  See enrollments, progress, quiz stats, activity and recommendations.
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Risk Score</div>
                <div className="mt-1 text-sm text-slate-600">
                  Early-warning analytics from learning engagement signals.
                </div>
              </div>
            </div>

            <div className="mt-8 text-xs text-slate-500">
              Tip: If you see “Not authenticated”, login again and refresh.
            </div>
          </div>

          {/* Right: login card */}
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Use your account credentials to continue.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Student
                </span>
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <div className="font-semibold">Login failed</div>
                  <div className="mt-1 opacity-90">{error}</div>
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Demo credentials</div>
                  <div className="mt-1">
                    Student: <span className="font-mono">Use your Email</span> /{" "}
                    <span className="font-mono">and Password to Login</span>
                  </div>
                  <div className="mt-1 opacity-80">
                    (If You don't have an account yet, please contact the administrator to create one for you.)
                  </div>
                </div>
              </form>
            </div>

            <div className="mt-4 text-center text-xs text-slate-500">
              EduWise • Student Portal
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}