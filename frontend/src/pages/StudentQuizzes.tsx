import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type Course = { id: number; title: string; teacher_id: number };
type Module = { id: number; course_id: number; title: string; order_index: number };
type Lesson = { id: number; module_id: number; title: string; order_index: number };

type QuizOut = { id: number; lesson_id: number; title: string; is_published: boolean };

type RecommendationsData = { student_id: number; course_ids?: number[]; recommendations: unknown[] };

export default function StudentQuizzes() {
  const token = useMemo(() => getAccessToken(), []);
  const [quizzes, setQuizzes] = useState<QuizOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const [coursesRes, recsRes] = await Promise.all([
          api.get<Course[]>("/api/v1/courses"),
          api.get<RecommendationsData>("/api/v1/me/recommendations"),
        ]);

        const enrolledIds = recsRes.data.course_ids || [];
        const enrolledCourses = (coursesRes.data || []).filter((c) => enrolledIds.includes(c.id));

        const found: QuizOut[] = [];

        for (const course of enrolledCourses) {
          const mods = await api.get<Module[]>(`/api/v1/courses/${course.id}/modules`);
          for (const mod of mods.data || []) {
            const lessons = await api.get<Lesson[]>(`/api/v1/modules/${mod.id}/lessons`);
            for (const lesson of lessons.data || []) {
              const qs = await api.get<QuizOut[]>(`/api/v1/lessons/${lesson.id}/quizzes`);
              // backend already hides unpublished from students; still filter just in case:
              for (const q of qs.data || []) {
                if (q.is_published) found.push(q);
              }
            }
          }
        }

        // Deduplicate by id
        const unique = Array.from(new Map(found.map((q) => [q.id, q])).values());
        setQuizzes(unique);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to load quizzes");
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
            <h1 className="text-2xl font-semibold text-slate-900">Quizzes</h1>
            <p className="mt-1 text-sm text-slate-500">Published quizzes from your enrolled courses</p>
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

        <div className="mt-6 space-y-3">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">Loading…</div>
          )}

          {!loading && quizzes.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              No published quizzes yet.
            </div>
          )}

          {!loading &&
            quizzes.map((q) => (
              <Link
                key={q.id}
                to={`/student/quizzes/${q.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md"
              >
                <div className="text-sm font-semibold text-slate-900">{q.title}</div>
                <div className="mt-1 text-sm text-slate-500">Quiz ID: {q.id} • Lesson ID: {q.lesson_id}</div>
                <div className="mt-4 text-xs font-medium text-slate-500">Start quiz →</div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}