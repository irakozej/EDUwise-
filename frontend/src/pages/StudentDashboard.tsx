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

type StreakData = {
  current_streak: number;
  longest_streak: number;
  total_study_days: number;
  last_study_date: string | null;
};

type XPData = {
  total_xp: number;
  level: number;
  xp_to_next_level: number;
  recent_events: { event_type: string; xp_earned: number; created_at: string }[];
};

type EarnedBadge = {
  badge_key: string;
  name: string;
  desc: string;
  icon: string;
  earned_at: string;
};

function classNames(...xs: Array<string | boolean | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function formatEventLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
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


export default function StudentDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [recs, setRecs] = useState<RecommendationsData | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [xp, setXp] = useState<XPData | null>(null);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgUnread, setMsgUnread] = useState(0);

  const token = useMemo(() => getAccessToken(), []);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [d, r, rec, streakRes, xpRes, badgesRes] = await Promise.all([
        api.get<DashboardData>("/api/v1/me/dashboard"),
        api.get<RiskData>("/api/v1/me/risk-score"),
        api.get<RecommendationsData>("/api/v1/me/recommendations"),
        api.get<StreakData>("/api/v1/me/streak").catch(() => null),
        api.get<XPData>("/api/v1/me/xp").catch(() => null),
        api.get<{ earned: EarnedBadge[] }>("/api/v1/me/badges").catch(() => null),
      ]);

      setDashboard(d.data);
      setRisk(r.data);
      setRecs(rec.data);
      if (streakRes) setStreak(streakRes.data);
      if (xpRes) setXp(xpRes.data);
      if (badgesRes) setBadges(badgesRes.data.earned ?? []);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-600 text-white font-bold text-sm">
              E
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Student Dashboard</div>
              <div className="text-xs text-slate-400">
                {dashboard?.student?.full_name ?? "Your learning overview"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <button onClick={() => navigate("/student/history")} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">History</button>
            <button onClick={() => navigate("/profile")} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Profile</button>
            <button onClick={loadAll} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Refresh</button>
            <button onClick={logout} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Logout</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back{dashboard?.student?.full_name ? `, ${dashboard.student.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Here's your learning overview for today.</p>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="font-semibold">{error}</div>
            <div className="mt-1 text-sm opacity-90">If this says “Not authenticated”, login again.</div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Enrollments */}
          <Link to="/student/courses" className="block rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-500">Courses</div>
                <div className="mt-1 text-3xl font-bold text-sky-900">{dashboard ? dashboard.courses_enrolled : loading ? "…" : 0}</div>
                <div className="mt-1 text-xs text-sky-600">Active enrollments</div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-600 text-lg"></div>
            </div>
          </Link>

          {/* Progress */}
          <Link to="/student/courses" className="block rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-violet-500">Progress</div>
                <div className="mt-1 text-3xl font-bold text-violet-900">{dashboard ? `${avgProgressPct}%` : loading ? "…" : "0%"}</div>
                <div className="mt-1 text-xs text-violet-600">{dashboard?.progress?.completed_lessons ?? 0} lessons done</div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-violet-200">
                  <div className="h-1.5 rounded-full bg-violet-500 transition-all" style={{ width: `${dashboard ? avgProgressPct : 0}%` }} />
                </div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-violet-600 text-lg"></div>
            </div>
          </Link>

          {/* Quiz */}
          <Link to="/student/quizzes" className="block rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Quiz Score</div>
                <div className="mt-1 text-3xl font-bold text-emerald-900">
                  {dashboard?.quizzes?.avg_score_pct != null ? `${dashboard.quizzes.avg_score_pct}%` : loading ? "…" : "—"}
                </div>
                <div className="mt-1 text-xs text-emerald-600">{dashboard?.quizzes?.attempts_total ?? 0} attempts</div>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 text-lg"></div>
            </div>
          </Link>

          {/* Risk */}
          <div className={`rounded-2xl border p-4 shadow-sm ${
            riskTone === "red" ? "border-rose-200 bg-rose-50" :
            riskTone === "yellow" ? "border-amber-200 bg-amber-50" :
            riskTone === "green" ? "border-emerald-200 bg-emerald-50" :
            "border-slate-200 bg-slate-50"
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${
                  riskTone === "red" ? "text-rose-500" : riskTone === "yellow" ? "text-amber-500" :
                  riskTone === "green" ? "text-emerald-500" : "text-slate-500"
                }`}>Risk Level</div>
                <div className={`mt-1 text-3xl font-bold ${
                  riskTone === "red" ? "text-rose-900" : riskTone === "yellow" ? "text-amber-900" :
                  riskTone === "green" ? "text-emerald-900" : "text-slate-900"
                }`}>{riskPct !== null ? `${riskPct}%` : loading ? "…" : "—"}</div>
                <div className="mt-1"><Badge text={riskLabel} tone={riskTone} /></div>
              </div>
              <div className="text-lg"></div>
            </div>
          </div>

          {/* Streak */}
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-orange-500">Study Streak</div>
                <div className="mt-1 text-3xl font-bold text-orange-900">
                  {streak ? `${streak.current_streak}` : loading ? "…" : "0"}
                  <span className="text-base font-normal text-orange-600 ml-1">days</span>
                </div>
                <div className="mt-1 text-xs text-orange-600">
                  Longest: {streak?.longest_streak ?? 0} days
                </div>
              </div>
              <div className="text-2xl">🔥</div>
            </div>
          </div>

          {/* XP */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">XP Points</div>
                <div className="mt-1 text-3xl font-bold text-amber-900">
                  {xp ? xp.total_xp : loading ? "…" : "0"}
                </div>
                <div className="mt-1 text-xs text-amber-600">Level {xp?.level ?? 1}</div>
                {xp && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-amber-200">
                    <div
                      className="h-1.5 rounded-full bg-amber-500 transition-all"
                      style={{ width: `${Math.min(100, Math.round(((xp.total_xp % 100) / 100) * 100))}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="text-2xl">⭐</div>
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Your Badges</h3>
          {loading ? (
            <div className="text-xs text-slate-400">Loading…</div>
          ) : badges.length === 0 ? (
            <p className="text-xs text-slate-400">Complete lessons and quizzes to earn badges.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <div
                  key={b.badge_key}
                  title={b.desc}
                  className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-800"
                >
                  <span>{b.icon}</span>
                  <span>{b.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main grid */}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Recommendations */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Recommended next steps</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Personalised for your <span className="font-medium text-slate-700">enrolled courses</span>
                </p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">AI-powered</span>
            </div>

            <div className="space-y-3">
              {loading && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading…</div>}
              {!loading && (recs?.recommendations?.length ?? 0) === 0 && (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  No recommendations yet. Try opening a lesson or updating progress.
                </div>
              )}
              {recs?.recommendations?.slice(0, 6).map((r, idx) => (
                <div key={idx} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{r.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{r.reason || "Based on your learning signals"}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.topic && <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">{r.topic}</span>}
                      {r.difficulty && <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">{r.difficulty}</span>}
                      {r.format && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{r.format}</span>}
                    </div>
                  </div>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer"
                      className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                      Open →
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 shrink-0">No link</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-1">Activity</h2>
            <p className="text-xs text-slate-500 mb-4">Your learning totals</p>

            {loading && <div className="text-sm text-slate-400">Loading…</div>}
            {!loading && dashboard && (
              <div className="space-y-2">
                {Object.entries(dashboard.events.by_type || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="text-xs text-slate-600">{formatEventLabel(k)}</span>
                    <span className="text-sm font-bold text-slate-900">{String(v)}</span>
                  </div>
                ))}
                {Object.keys(dashboard.events.by_type || {}).length === 0 && (
                  <div className="text-xs text-slate-400">No events recorded yet.</div>
                )}
                <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5">
                  <span className="text-xs font-medium text-sky-700">Total events</span>
                  <span className="text-sm font-bold text-sky-900">{dashboard.events.total}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-400">EduWise · Student view</footer>
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