import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) setError("Invalid reset link. Please request a new one.");
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/api/v1/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => navigate("/"), 3000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-white text-xl font-bold shadow-lg mb-3">
            E
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            EDU<span className="text-sky-600">wise</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Set a new password</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {done ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Password updated!</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Your password has been changed. Redirecting to login…
                </p>
              </div>
              <Link
                to="/"
                className="block w-full rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-slate-800"
              >
                Go to login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-900">New password</h2>
              <p className="mt-1 text-sm text-slate-500">Choose a strong password with at least 6 characters.</p>

              <form onSubmit={submit} className="mt-5 space-y-4">
                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-slate-700">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    autoFocus
                    disabled={!token}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    disabled={!token}
                    className={`mt-1.5 w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-sky-100 disabled:opacity-50 ${
                      confirm && confirm !== password
                        ? "border-rose-300 bg-rose-50 focus:border-rose-400"
                        : "border-slate-200 bg-slate-50 focus:border-sky-400 focus:bg-white"
                    }`}
                  />
                  {confirm && confirm !== password && (
                    <p className="mt-1 text-xs text-rose-600">Passwords don't match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !token || !password || !confirm}
                  className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loading ? "Saving…" : "Set new password"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link to="/forgot-password" className="text-sm text-slate-500 hover:text-slate-900">
                  Request a new link
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
