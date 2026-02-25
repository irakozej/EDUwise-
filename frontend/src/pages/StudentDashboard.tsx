import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";

type DashboardData = {
  student: { id: number; full_name: string; email: string };
  enrollments_active: number;
  lessons_total: number;
  progress: { avg_progress_pct: number; completed_progress_rows: number };
  quizzes: {
    published: number;
    attempts_total: number;
    avg_score_pct: number | null;
  };
  events: { total: number; by_type: Record<string, number> };
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

type Course = {
  id: number;
  title: string;
  description?: string | null;
  teacher_id?: number;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        "rounded-2xl border border-zinc-200 bg-white shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-500">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function StatValue({
  value,
  sub,
}: {
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="px-5 pb-5">
      <div className="text-3xl font-semibold tracking-tight text-zinc-900">
        {value}
      </div>
      {sub ? <div className="mt-1 text-sm text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Badge({
  text,
  tone,
}: {
  text: string;
  tone: "green" | "yellow" | "red" | "gray";
}) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : tone === "yellow"
      ? "bg-amber-50 text-amber-700 ring-amber-100"
      : tone === "red"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : "bg-zinc-100 text-zinc-700 ring-zinc-200";

  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        cls
      )}
    >
      {text}
    </span>
  );
}

function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return (
    <div
      className={classNames(
        "h-3 rounded bg-zinc-100 animate-pulse",
        w
      )}
    />
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 active:scale-[0.99]"
    >
      {children}
    </button>
  );
}

function LinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
    >
      {children}
    </a>
  );
}

function TitleTag({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
      {text}
    </span>
  );
}

export default function StudentDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [recs, setRecs] = useState<RecommendationsData | null>(null);

  const [coursesById, setCoursesById] = useState<Record<number, Course>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

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

      // ---- Active enrollments: show course titles from /api/v1/courses
      const courseIds =
        rec.data?.course_ids && rec.data.course_ids.length > 0
          ? rec.data.course_ids
          : Array.from(
              new Set(
                (rec.data?.recommendations || [])
                  .map((x) => x.course_id)
                  .filter((x): x is number => typeof x === "number")
              )
            );

      if (courseIds.length > 0) {
        const allCourses = await api.get<Course[]>("/api/v1/courses");
        const map: Record<number, Course> = {};
        for (const c of allCourses.data) map[c.id] = c;
        setCoursesById(map);
      } else {
        setCoursesById({});
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || "Failed to load data";
      setError(msg);
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

  const enrolledCourseIds = useMemo(() => {
    if (!recs) return [];
    if (recs.course_ids && recs.course_ids.length > 0) return recs.course_ids;

    const ids = Array.from(
      new Set(
        (recs.recommendations || [])
          .map((x) => x.course_id)
          .filter((x): x is number => typeof x === "number")
      )
    );
    return ids;
  }, [recs]);

  const enrolledCourses = useMemo(() => {
    return enrolledCourseIds
      .map((id) => coursesById[id])
      .filter((c): c is Course => !!c);
  }, [enrolledCourseIds, coursesById]);

  const avgProgressPct =
    dashboard?.progress?.avg_progress_pct ?? (loading ? null : 0);

  const quizAvg =
    dashboard?.quizzes?.avg_score_pct !== null &&
    dashboard?.quizzes?.avg_score_pct !== undefined
      ? `${dashboard.quizzes.avg_score_pct}%`
      : loading
      ? "…"
      : "—";

  const riskPct = risk ? `${Math.round(risk.risk_score * 100)}%` : loading ? "…" : "—";

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Student Dashboard
            </h1>
            <div className="mt-1 text-sm text-zinc-500">
              {dashboard?.student?.full_name ? (
                <>
                  <span className="font-medium text-zinc-700">
                    {dashboard.student.full_name}
                  </span>{" "}
                  <span className="text-zinc-400">•</span>{" "}
                  <span>{dashboard.student.email}</span>
                </>
              ) : (
                "Your learning overview"
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <PrimaryButton onClick={loadAll}>Refresh</PrimaryButton>
            <PrimaryButton onClick={logout}>Logout</PrimaryButton>
          </div>
        </header>

        {/* Error banner */}
        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <div className="font-semibold">❌ {error}</div>
            <div className="mt-1 text-sm text-rose-700">
              If this says “Not authenticated”, go back to the login page and login again.
            </div>
          </div>
        ) : null}

        {/* KPI grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Active Enrollments */}
          <Card>
            <CardHeader
              title="Active enrollments"
              subtitle="Courses you are enrolled in"
            />
            <div className="px-5 pb-5">
              <div className="text-3xl font-semibold tracking-tight text-zinc-900">
                {dashboard ? dashboard.enrollments_active : loading ? "…" : 0}
              </div>

              <div className="mt-3">
                {loading ? (
                  <div className="space-y-2">
                    <SkeletonLine />
                    <SkeletonLine w="w-2/3" />
                  </div>
                ) : enrolledCourses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {enrolledCourses.slice(0, 6).map((c) => (
                      <TitleTag key={c.id} text={c.title} />
                    ))}
                    {enrolledCourses.length > 6 ? (
                      <span className="text-xs text-zinc-500">
                        +{enrolledCourses.length - 6} more
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500">
                    No enrolled courses found yet.
                    <div className="mt-1 text-xs text-zinc-400">
                      Enroll in a course to see recommendations and progress here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Average progress */}
          <Card>
            <CardHeader title="Average progress" />
            <StatValue
              value={
                avgProgressPct === null
                  ? "…"
                  : `${Math.max(0, Math.min(100, avgProgressPct))}%`
              }
              sub={`${dashboard?.progress?.completed_progress_rows ?? 0} lessons completed`}
            />
          </Card>

          {/* Quiz average */}
          <Card>
            <CardHeader title="Quiz average" />
            <StatValue
              value={quizAvg}
              sub={`${dashboard?.quizzes?.attempts_total ?? 0} attempts`}
            />
          </Card>

          {/* Risk */}
          <Card>
            <div className="flex items-start justify-between gap-3 p-5">
              <div className="text-sm font-medium text-zinc-500">Risk</div>
              <Badge text={riskLabel} tone={riskTone} />
            </div>
            <div className="px-5 pb-5">
              <div className="text-3xl font-semibold tracking-tight text-zinc-900">
                {riskPct}
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                Based on performance + engagement signals
              </div>
            </div>
          </Card>
        </div>

        {/* Main sections */}
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Recommendations */}
          <Card>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                    Recommended next steps
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Recommendations are based only on your{" "}
                    <span className="font-medium text-zinc-700">enrolled courses</span>.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <SkeletonLine />
                      <div className="mt-2 space-y-2">
                        <SkeletonLine w="w-5/6" />
                        <SkeletonLine w="w-2/3" />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <SkeletonLine w="w-4/6" />
                      <div className="mt-2 space-y-2">
                        <SkeletonLine />
                        <SkeletonLine w="w-1/2" />
                      </div>
                    </div>
                  </div>
                ) : recs?.recommendations?.length ? (
                  recs.recommendations.slice(0, 6).map((r, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-zinc-900">
                          {r.title}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                          {r.topic ? <TitleTag text={`topic: ${r.topic}`} /> : null}
                          {r.difficulty ? (
                            <TitleTag text={`difficulty: ${r.difficulty}`} />
                          ) : null}
                          {r.format ? <TitleTag text={`format: ${r.format}`} /> : null}
                        </div>

                        <div className="mt-2 text-sm text-zinc-500">
                          {r.reason || "Recommended based on your learning signals"}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {r.url ? (
                          <LinkButton href={r.url}>Open</LinkButton>
                        ) : (
                          <span className="text-sm text-zinc-400">No link</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
                    No recommendations yet.
                    <div className="mt-1 text-xs text-zinc-400">
                      Try enrolling in a course, opening lessons, updating progress, or attempting a quiz.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Activity */}
          <Card>
            <div className="p-5">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                Activity
              </h2>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-medium text-zinc-500">Lessons total</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">
                    {dashboard ? dashboard.lessons_total : loading ? "…" : 0}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-medium text-zinc-500">Events tracked</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">
                    {dashboard ? dashboard.events.total : loading ? "…" : 0}
                  </div>

                  <div className="mt-4 border-t border-zinc-100 pt-3">
                    <div className="text-xs font-medium text-zinc-500">
                      Events breakdown
                    </div>

                    <div className="mt-2 space-y-2">
                      {loading ? (
                        <div className="space-y-2">
                          <SkeletonLine />
                          <SkeletonLine w="w-2/3" />
                        </div>
                      ) : dashboard ? (
                        Object.keys(dashboard.events.by_type || {}).length ? (
                          Object.entries(dashboard.events.by_type || {}).map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-zinc-600">{k}</span>
                              <span className="font-semibold text-zinc-900">{v}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-zinc-500">No events yet.</div>
                        )
                      ) : (
                        <div className="text-sm text-zinc-500">No data.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tiny explanation for supervisor demo */}
              <div className="mt-4 text-xs text-zinc-400">
                Tip: generate events by opening lessons, updating progress, and attempting quizzes.
              </div>
            </div>
          </Card>
        </div>

        <footer className="mt-8 text-xs text-zinc-400">EduWise • Student view</footer>
      </div>
    </div>
  );
}