import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type LessonProgress = {
  lesson_id: number;
  lesson_title: string;
  progress_pct: number;
};

type ProgressData = {
  course: { id: number; title: string; teacher_id: number };
  student: { id: number; full_name: string; email: string };
  enrolled_status: string;
  progress: { avg_progress_pct: number; completed_lessons: number; lessons_total: number };
  lessons: LessonProgress[];
  quizzes: { published_total: number; attempts_total: number; avg_score_pct: number | null };
  events: { total: number; by_type: Record<string, number> };
};

function ProgressBar({ pct, color = "slate" }: { pct: number; color?: "slate" | "emerald" | "amber" | "rose" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const barColor =
    color === "emerald" ? "bg-emerald-500" :
    color === "amber" ? "bg-amber-400" :
    color === "rose" ? "bg-rose-500" :
    "bg-slate-900";

  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function riskColor(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 80) return "emerald";
  if (pct >= 40) return "amber";
  return "rose";
}

export default function TeacherStudentProgress() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>();
  const cId = Number(courseId);
  const sId = Number(studentId);

  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAccessToken()) { window.location.href = "/"; return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cId, sId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<ProgressData>(
        `/api/v1/teacher/courses/${cId}/students/${sId}/progress`
      );
      setData(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading student progress…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
          {error || "No data found."}
        </div>
        <Link to={`/teacher/courses/${cId}`} className="mt-4 inline-block text-sm text-slate-600 hover:text-slate-900 underline">
          ← Back to course
        </Link>
      </div>
    );
  }

  const avgPct = data.progress.avg_progress_pct ?? 0;
  const barColor = riskColor(avgPct);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
          <Link to="/teacher" className="hover:text-slate-900">Dashboard</Link>
          <span className="text-slate-300">/</span>
          <Link to={`/teacher/courses/${cId}`} className="hover:text-slate-900">{data.course.title}</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">{data.student.full_name}</span>
        </div>

        {/* Student header */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{data.student.full_name}</h1>
              <div className="mt-0.5 text-sm text-slate-500">{data.student.email}</div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  data.enrolled_status === "active"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {data.enrolled_status}
                </span>
                <span className="text-xs text-slate-400">in {data.course.title}</span>
              </div>
            </div>
            <button
              onClick={load}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 self-start"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Avg Progress</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{avgPct}%</div>
            <ProgressBar pct={avgPct} color={barColor} />
            <div className="mt-2 text-xs text-slate-500">
              {data.progress.completed_lessons} / {data.progress.lessons_total} lessons complete
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Quiz Performance</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {data.quizzes.avg_score_pct !== null ? `${data.quizzes.avg_score_pct}%` : "—"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {data.quizzes.attempts_total} attempts · {data.quizzes.published_total} published
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Events</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{data.events.total}</div>
            <div className="mt-1 text-xs text-slate-500">Tracked learning actions</div>
          </div>
        </div>

        {/* Lesson Progress */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Lesson Progress</h2>

          {data.lessons.length === 0 ? (
            <div className="text-sm text-slate-500">No lessons in this course yet.</div>
          ) : (
            <div className="space-y-3">
              {data.lessons.map((lesson) => {
                const pct = lesson.progress_pct;
                return (
                  <div key={lesson.lesson_id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate pr-4">{lesson.lesson_title}</span>
                      <span className={`shrink-0 text-xs font-semibold ${
                        pct >= 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-slate-500"
                      }`}>
                        {pct}%
                      </span>
                    </div>
                    <ProgressBar pct={pct} color={pct >= 100 ? "emerald" : pct >= 50 ? "amber" : "rose"} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Events Breakdown */}
        {data.events.total > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Activity Breakdown</h2>
            <div className="space-y-2">
              {Object.entries(data.events.by_type).map(([type, count]) => {
                const pct = Math.round((count / data.events.total) * 100);
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600 capitalize">{type.replace(/_/g, " ")}</span>
                      <span className="text-sm font-semibold text-slate-900">{count}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-slate-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <footer className="mt-10 text-xs text-slate-500">EduWise · Teacher view</footer>
      </div>
    </div>
  );
}
