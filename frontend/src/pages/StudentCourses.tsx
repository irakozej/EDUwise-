import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type EnrolledCourse = {
  course_id: number;
  title: string;
  description: string | null;
  progress_pct: number;
  lessons_completed: number;
  lessons_total: number;
  avg_quiz_score: number | null;
};

export default function StudentCourses() {
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = useMemo(() => getAccessToken(), []);

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get<{ items: EnrolledCourse[] }>("/api/v1/me/courses");
        setCourses(res.data.items);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Courses</h1>
            <p className="mt-1 text-sm text-slate-500">Courses you are enrolled in</p>
          </div>
          <Link
            to="/student"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="font-semibold">❌ {error}</div>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              Loading…
            </div>
          )}

          {!loading && courses.length === 0 && (
            <div className="col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <div className="text-slate-400 text-3xl mb-2">📚</div>
              <div className="text-sm font-medium text-slate-600">You are not enrolled in any courses yet.</div>
              <div className="mt-1 text-xs text-slate-400">Ask your teacher to enroll you.</div>
            </div>
          )}

          {!loading &&
            courses.map((c) => (
              <Link
                key={c.course_id}
                to={`/student/courses/${c.course_id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition"
              >
                <div className="text-sm font-semibold text-slate-900">{c.title}</div>
                <div className="mt-1 text-sm text-slate-500 line-clamp-2">
                  {c.description || "No description"}
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Progress</span>
                    <span className="font-medium text-slate-700">{c.progress_pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-slate-900 transition-all"
                      style={{ width: `${c.progress_pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                    <span>{c.lessons_completed}/{c.lessons_total} lessons</span>
                    {c.avg_quiz_score !== null && (
                      <span>Avg quiz: {Math.round(c.avg_quiz_score)}%</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 text-xs font-medium text-slate-500">Open course →</div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
