import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type Course = { id: number; title: string; description?: string; teacher_id: number };

type RecommendationsData = {
  student_id: number;
  course_ids?: number[];
  recommendations: any[];
};

export default function StudentCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseIds, setCourseIds] = useState<number[]>([]);
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
        const [allCourses, recs] = await Promise.all([
          api.get<Course[]>("/api/v1/courses"),
          api.get<RecommendationsData>("/api/v1/me/recommendations"),
        ]);

        const ids = recs.data.course_ids || [];
        setCourseIds(ids);

        const enrolled = allCourses.data.filter((c) => ids.includes(c.id));
        setCourses(enrolled);
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || "Failed to load courses");
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

          {!loading && courseIds.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              You are not enrolled in any courses yet.
            </div>
          )}

          {!loading &&
            courses.map((c) => (
              <Link
                key={c.id}
                to={`/student/courses/${c.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md"
              >
                <div className="text-sm font-semibold text-slate-900">{c.title}</div>
                <div className="mt-1 text-sm text-slate-500">{c.description || "No description"}</div>
                <div className="mt-4 text-xs font-medium text-slate-500">Open course →</div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}