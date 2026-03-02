import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";
import NotificationBell from "../components/NotificationBell";
import MessagesPanel from "../components/MessagesPanel";

type DashboardData = {
  student: { id: number; full_name: string; email: string };
  courses_enrolled: number;
  progress: { avg_progress_pct: number | null; completed_lessons: number; total_lessons: number };
  quizzes: { attempts_total: number; avg_score_pct: number | null };
  events: { total: number; by_type: Record<string, number>; recent_activity: unknown[] };
};

type RiskData = {
  student_id: number;
  risk_score: number; // 0..1
  risk_label?: string;
  features?: Record<string, number>;
};

type Recommendation = {
  lesson_id?: number;
  resource_id?: number;
  title: string;
  reason?: string;
  url?: string | null;
  format?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  course_id?: number;
};

type RecommendationsData = {
  student_id: number;
  course_ids?: number[];
  recommendations: Recommendation[];
};

function classNames(...xs: Array<string | boolean | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function formatEventLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function StatCard({
  label,
  value,
  sub,
  icon,
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  to?: string;
}) {
  const Card = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        {icon ? (
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-slate-700">
            {icon}
          </div>
        ) : null}
      </div>
      {to ? <div className="mt-3 text-xs font-medium text-slate-500">Click to view →</div> : null}
    </div>
  );

  if (!to) return Card;

  return (
    <Link to={to} className="block">
      {Card}
    </Link>
  );
}

function Badge({ text, tone }: { text: string; tone: "green" | "yellow" | "red" | "gray" }) {
  const styles =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "yellow"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : tone === "red"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", styles)}>
      {text}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
      <div
        className="h-2 rounded-full bg-slate-900 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [recs, setRecs] = useState<RecommendationsData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgUnread, setMsgUnread] = useState(0);

  const token = useMemo(() => getAccessToken(), []);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [d, r, rec] = await Promise.all([
        api.get<DashboardData>("/api/v1/me/dashboard"),
        api.get<RiskData>("/api/v1/me/risk-score"),
        api.get<RecommendationsData>("/api/v1/me/recommendations"),
      ]);

      setDashboard(d.data);
      setRisk(r.data);
      setRecs(rec.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll message unread count every 30s
  useEffect(() => {
    function fetchMsgUnread() {
      api.get<{ count: number }>("/api/v1/me/messages/unread-count")
        .then((r) => setMsgUnread(r.data.count))
        .catch(() => {});
    }
    fetchMsgUnread();
    const id = setInterval(fetchMsgUnread, 30000);
    return () => clearInterval(id);
  }, []);

  function logout() {
    clearAccessToken();
    window.location.href = "/";
  }

  const riskTone: "green" | "yellow" | "red" | "gray" = (() => {
    const s = risk?.risk_score;
    if (s === undefined || s === null) return "gray";
    if (s >= 0.7) return "red";
    if (s >= 0.4) return "yellow";
    return "green";
  })();

  const riskLabel = (() => {
    if (!risk) return "Unknown";
    if (risk.risk_label) return risk.risk_label;
    if (risk.risk_score >= 0.7) return "High risk";
    if (risk.risk_score >= 0.4) return "Medium risk";
    return "Low risk";
  })();

  const avgProgressPct = Math.round(dashboard?.progress?.avg_progress_pct ?? 0);
  const riskPct = risk ? Math.round(risk.risk_score * 100) : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white font-bold">
              E
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Student Dashboard</h1>
              <div className="mt-0.5 text-sm text-slate-500">
                {dashboard?.student?.full_name ? (
                  <>
                    {dashboard.student.full_name} • {dashboard.student.email}
                  </>
                ) : (
                  "Your learning overview"
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Messages */}
            <button
              onClick={() => setMsgOpen(true)}
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Messages"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {msgUnread > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {msgUnread > 99 ? "99+" : msgUnread}
                </span>
              )}
            </button>
            <NotificationBell />
            <button
              onClick={() => navigate("/profile")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Profile
            </button>
            <button
              onClick={loadAll}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="font-semibold">{error}</div>
            <div className="mt-1 text-sm opacity-90">If this says “Not authenticated”, login again.</div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            to="/student/courses"
            label="Active enrollments"
            value={dashboard ? dashboard.courses_enrolled : loading ? "…" : 0}
            sub="Courses you’re currently enrolled in"
            icon={<span className="text-base">📚</span>}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <Link to="/student/courses" className="block">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-500">Average progress</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                    {dashboard ? `${avgProgressPct}%` : loading ? "…" : "0%"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {dashboard?.progress?.completed_lessons ?? 0} lessons completed
                  </div>
                  <ProgressBar pct={dashboard ? avgProgressPct : 0} />
                  <div className="mt-3 text-xs font-medium text-slate-500">Click to manage lessons →</div>
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-slate-700">
                  📈
                </div>
              </div>
            </Link>
          </div>

          <StatCard
            to="/student/quizzes"
            label="Quiz average"
            value={
              dashboard?.quizzes?.avg_score_pct !== null && dashboard?.quizzes?.avg_score_pct !== undefined
                ? `${dashboard.quizzes.avg_score_pct}%`
                : loading
                ? "…"
                : "—"
            }
            sub={`${dashboard?.quizzes?.attempts_total ?? 0} quiz attempts`}
            icon={<span className="text-base">🧠</span>}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-slate-500">Risk</div>
                  <Badge text={riskLabel} tone={riskTone} />
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {riskPct !== null ? `${riskPct}%` : loading ? "…" : "—"}
                </div>
                <div className="mt-1 text-xs text-slate-500">From performance + engagement signals</div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-slate-700">🛡️</div>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Recommended next steps</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Recommendations are based only on your{" "}
                  <span className="font-medium text-slate-700">enrolled courses</span>.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Personalized</span>
            </div>

            <div className="mt-4 space-y-3">
              {loading && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Loading recommendations…
                </div>
              )}

              {!loading && (recs?.recommendations?.length ?? 0) === 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No recommendations yet. Try opening a lesson or updating progress.
                </div>
              )}

              {recs?.recommendations?.slice(0, 6).map((r, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{r.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{r.reason || "Recommended based on your learning signals"}</div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.topic && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">Topic: {r.topic}</span>}
                      {r.difficulty && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">Difficulty: {r.difficulty}</span>}
                      {r.format && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">Format: {r.format}</span>}
                    </div>
                  </div>

                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">No link</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Activity</h2>
            <p className="mt-1 text-sm text-slate-500">Your learning totals</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-600">Events breakdown</div>

                {loading && <div className="mt-2 text-sm text-slate-500">Loading…</div>}

                {!loading && dashboard && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(dashboard.events.by_type || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{formatEventLabel(k)}</span>
                        <span className="font-semibold text-slate-900">{v}</span>
                      </div>
                    ))}
                    {Object.keys(dashboard.events.by_type || {}).length === 0 && (
                      <div className="mt-2 text-sm text-slate-500">No events yet.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-8 text-xs text-slate-500">EduWise • Student view</footer>
      </div>

      {/* Messages Panel */}
      {msgOpen && (
        <MessagesPanel
          currentUserId={dashboard?.student?.id ?? 0}
          onClose={() => { setMsgOpen(false); setMsgUnread(0); }}
        />
      )}
    </div>
  );
}