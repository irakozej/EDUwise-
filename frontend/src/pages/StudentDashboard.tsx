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

type CoursePeople = {
  course_id: number;
  course_title: string;
  people: { id: number; full_name: string; email: string; role: string }[];
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

  const [people, setPeople] = useState<CoursePeople[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "people">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgUnread, setMsgUnread] = useState(0);

  // AI study suggestions (lazy — load on demand)
  type AiSuggestion = { title: string; description: string; priority: "high" | "medium" | "low"; category: string };
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiSuggestionsOpen, setAiSuggestionsOpen] = useState(false);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  const [aiSuggestionsLoaded, setAiSuggestionsLoaded] = useState(false);
  const [aiSuggestionsError, setAiSuggestionsError] = useState("");

  const token = useMemo(() => getAccessToken(), []);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [d, r, peopleRes] = await Promise.all([
        api.get<DashboardData>("/api/v1/me/dashboard"),
        api.get<RiskData>("/api/v1/me/risk-score"),
        api.get<CoursePeople[]>("/api/v1/me/people").catch(() => ({ data: [] })),
      ]);

      setDashboard(d.data);
      setRisk(r.data);
      setPeople(peopleRes.data);
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

  async function loadAiSuggestions() {
    if (aiSuggestionsLoaded || aiSuggestionsLoading) return;
    setAiSuggestionsLoading(true);
    setAiSuggestionsError("");
    try {
      const res = await api.post<{ suggestions: AiSuggestion[] }>("/api/v1/me/ai-study-suggestions");
      setAiSuggestions(res.data.suggestions || []);
      setAiSuggestionsLoaded(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAiSuggestionsError(e?.response?.data?.detail || e?.message || "Failed to load suggestions");
    } finally {
      setAiSuggestionsLoading(false);
    }
  }

  function toggleAiSuggestions() {
    setAiSuggestionsOpen((prev) => {
      const next = !prev;
      if (next) loadAiSuggestions();
      return next;
    });
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

        </div>

        {/* Tab bar */}
        <div className="mt-6 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 w-fit shadow-sm">
          {(["overview", "people"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-5 py-2 text-sm font-medium capitalize transition ${
                activeTab === tab ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              {tab === "overview" ? "Overview" : "People"}
            </button>
          ))}
        </div>

        {/* People tab */}
        {activeTab === "people" && (
          <div className="mt-6 space-y-5">
            {loading && <div className="text-sm text-slate-400">Loading…</div>}
            {!loading && people.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No courses found. Enroll in a course to see people.
              </div>
            )}
            {people.map((group) => (
              <div key={group.course_id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <span className="text-sm font-semibold text-slate-800">{group.course_title}</span>
                  <span className="ml-2 text-xs text-slate-400">{group.people.length} {group.people.length === 1 ? "person" : "people"}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.people.map((person) => (
                    <div key={person.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        person.role === "teacher"
                          ? "bg-violet-100 text-violet-700"
                          : "bg-sky-100 text-sky-700"
                      }`}>
                        {person.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{person.full_name}</div>
                        <div className="text-xs text-slate-400 truncate">{person.email}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        person.role === "teacher"
                          ? "bg-violet-50 text-violet-700 border border-violet-200"
                          : "bg-sky-50 text-sky-700 border border-sky-200"
                      }`}>
                        {person.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Main grid — Overview tab only */}
        {activeTab === "overview" && <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* AI Study Suggestions */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Collapsed header — always visible */}
            <button
              onClick={toggleAiSuggestions}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="text-left min-w-0">
                  <div className="text-sm font-semibold text-slate-900">AI Study Recommendations</div>
                  <div className="text-xs text-slate-400">Personalised suggestions based on your progress</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">AI</span>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform ${aiSuggestionsOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>

            {/* Expanded content */}
            {aiSuggestionsOpen && (
              <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                {aiSuggestionsLoading && (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  </div>
                )}

                {aiSuggestionsError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {aiSuggestionsError}
                    <button
                      onClick={() => { setAiSuggestionsLoaded(false); loadAiSuggestions(); }}
                      className="ml-3 underline text-rose-600 hover:text-rose-800"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!aiSuggestionsLoading && !aiSuggestionsError && aiSuggestions.length === 0 && aiSuggestionsLoaded && (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No suggestions generated. Enroll in a course to get started.
                  </div>
                )}

                {!aiSuggestionsLoading && aiSuggestions.length > 0 && (
                  <div className="space-y-3">
                    {aiSuggestions.map((s, idx) => {
                      const priorityStyle =
                        s.priority === "high" ? "bg-rose-100 text-rose-700" :
                        s.priority === "medium" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-600";
                      const categoryStyle =
                        s.category === "review" ? "bg-violet-100 text-violet-700" :
                        s.category === "practice" ? "bg-sky-100 text-sky-700" :
                        s.category === "assess" ? "bg-emerald-100 text-emerald-700" :
                        "bg-indigo-100 text-indigo-700";
                      return (
                        <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-medium text-sm text-slate-900 leading-snug">{s.title}</div>
                            <div className="flex shrink-0 gap-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${priorityStyle}`}>{s.priority}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${categoryStyle}`}>{s.category}</span>
                            </div>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{s.description}</p>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => { setAiSuggestionsLoaded(false); setAiSuggestions([]); loadAiSuggestions(); }}
                      className="mt-1 text-xs text-sky-600 hover:underline"
                    >
                      Refresh suggestions
                    </button>
                  </div>
                )}
              </div>
            )}
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
        </div>}

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