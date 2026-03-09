import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import StudentPageNav from "../components/StudentPageNav";

type EnrolledCourse = {
  course_id: number;
  title: string;
  description: string | null;
  progress_pct: number;
  lessons_completed: number;
  lessons_total: number;
  avg_quiz_score: number | null;
};

type PrereqStatus = {
  met: boolean;
  missing: { course_id: number; title: string; progress_pct: number }[];
};

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-slate-400";
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function StudentCourses() {
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [prereqStatus, setPrereqStatus] = useState<Record<number, PrereqStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = useMemo(() => getAccessToken(), []);

  useEffect(() => {
    if (!token) { window.location.href = "/"; return; }
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get<{ items: EnrolledCourse[] }>("/api/v1/me/courses");
        const items = res.data.items;
        setCourses(items);
        const statuses = await Promise.allSettled(
          items.map((c) =>
            api.get<PrereqStatus>(`/api/v1/courses/${c.course_id}/prerequisite-status`)
              .then((r) => ({ id: c.course_id, data: r.data }))
          )
        );
        const map: Record<number, PrereqStatus> = {};
        statuses.forEach((s) => {
          if (s.status === "fulfilled") map[s.value.id] = s.value.data;
        });
        setPrereqStatus(map);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const completed = courses.filter((c) => c.progress_pct >= 100).length;
  const inProgress = courses.filter((c) => c.progress_pct > 0 && c.progress_pct < 100).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <StudentPageNav title="My Courses" subtitle="Courses you are enrolled in" />

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Stats row */}
        {!loading && courses.length > 0 && (
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs font-medium text-slate-500">Enrolled</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{courses.length}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs font-medium text-slate-500">In Progress</div>
              <div className="mt-1 text-2xl font-bold text-sky-700">{inProgress}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs font-medium text-slate-500">Completed</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{completed}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 rounded-2xl border border-slate-200 bg-white animate-pulse" />
            ))}
          </div>
        )}

        {!loading && courses.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="text-sm font-medium text-slate-700">No courses yet</div>
            <div className="mt-1 text-xs text-slate-400">Ask your teacher to enroll you in a course.</div>
          </div>
        )}

        {!loading && courses.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((c) => {
              const prereq = prereqStatus[c.course_id];
              const locked = prereq && !prereq.met;
              const pct = c.progress_pct;
              const statusColor = pct >= 100 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : pct > 0 ? "text-sky-700 bg-sky-50 border-sky-200"
                : "text-slate-500 bg-slate-100 border-slate-200";
              const statusLabel = pct >= 100 ? "Completed" : pct > 0 ? "In progress" : "Not started";

              return (
                <Link
                  key={c.course_id}
                  to={`/student/courses/${c.course_id}`}
                  className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors leading-snug">
                      {c.title}
                    </h2>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {locked && (
                    <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      Complete <strong className="ml-0.5">{prereq.missing[0]?.title}</strong> first
                    </div>
                  )}

                  {c.description && (
                    <p className="mb-3 text-xs text-slate-500 line-clamp-2 leading-relaxed">{c.description}</p>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{c.lessons_completed} / {c.lessons_total} lessons</span>
                      <span className="font-semibold text-slate-700">{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} />
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    {c.avg_quiz_score !== null ? (
                      <span className="text-xs text-slate-400">Quiz avg: <span className="font-medium text-slate-600">{Math.round(c.avg_quiz_score)}%</span></span>
                    ) : (
                      <span className="text-xs text-slate-300">No quizzes taken</span>
                    )}
                    <span className="text-xs font-medium text-slate-400 group-hover:text-sky-600 transition-colors">Open →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
