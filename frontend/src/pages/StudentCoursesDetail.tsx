import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type Module = { id: number; course_id: number; title: string; order_index: number };
type Lesson = { id: number; module_id: number; title: string; content?: string; order_index: number };
type Resource = {
  id: number;
  lesson_id: number;
  title: string;
  resource_type: string;
  url?: string | null;
  text_body?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  format?: string | null;
};

type DashboardData = {
  progress: { avg_progress_pct: number; completed_progress_rows: number };
};

export default function StudentCourseDetail() {
  const { courseId } = useParams();
  const course_id = Number(courseId);

  const token = useMemo(() => getAccessToken(), []);

  const [modules, setModules] = useState<Module[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<number, Lesson[]>>({});
  const [resourcesByLesson, setResourcesByLesson] = useState<Record<number, Resource[]>>({});
  const [progressByLesson, setProgressByLesson] = useState<Record<number, number>>({});
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
        // Load modules
        const m = await api.get<Module[]>(`/api/v1/courses/${course_id}/modules`);
        const mods = (m.data || []).sort((a, b) => a.order_index - b.order_index);
        setModules(mods);

        const lessonsMap: Record<number, Lesson[]> = {};
        const resMap: Record<number, Resource[]> = {};

        // Load lessons for each module
        for (const mod of mods) {
          const l = await api.get<Lesson[]>(`/api/v1/modules/${mod.id}/lessons`);
          const lessons = (l.data || []).sort((a, b) => a.order_index - b.order_index);
          lessonsMap[mod.id] = lessons;

          // Load resources for each lesson
          for (const lesson of lessons) {
            const r = await api.get<Resource[]>(`/api/v1/lessons/${lesson.id}/resources`);
            resMap[lesson.id] = r.data || [];
          }
        }

        setLessonsByModule(lessonsMap);
        setResourcesByLesson(resMap);

        // OPTIONAL: if you already expose per-lesson progress on backend, we can fetch it.
        // For now, we let student set progress in UI and store locally until refreshed.
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || "Failed to load course content");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, course_id]);

  async function setProgress(lesson_id: number, pct: number) {
    const clamped = Math.max(0, Math.min(100, pct));
    try {
      await api.put(`/api/v1/lessons/${lesson_id}/progress`, { progress_pct: clamped });
      setProgressByLesson((prev) => ({ ...prev, [lesson_id]: clamped }));
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || "Failed to update progress");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Course</h1>
            <p className="mt-1 text-sm text-slate-500">Lessons, resources, and progress</p>
          </div>
          <Link
            to="/student/courses"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to courses
          </Link>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="font-semibold">❌ {error}</div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">Loading…</div>
        ) : (
          <div className="mt-6 space-y-4">
            {modules.map((mod) => (
              <div key={mod.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">{mod.title}</div>

                <div className="mt-4 space-y-3">
                  {(lessonsByModule[mod.id] || []).map((lesson) => {
                    const pct = progressByLesson[lesson.id] ?? 0;
                    const completed = pct >= 100;

                    return (
                      <div key={lesson.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {lesson.title}
                              </div>
                              {completed && (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                                  Completed
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Progress: <span className="font-medium text-slate-700">{pct}%</span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => setProgress(lesson.id, 25)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                25%
                              </button>
                              <button
                                onClick={() => setProgress(lesson.id, 50)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                50%
                              </button>
                              <button
                                onClick={() => setProgress(lesson.id, 75)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                75%
                              </button>
                              <button
                                onClick={() => setProgress(lesson.id, 100)}
                                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                              >
                                Mark complete (100%)
                              </button>
                            </div>
                          </div>

                          <div className="w-full sm:w-72">
                            <div className="text-xs font-medium text-slate-600">Resources</div>
                            <div className="mt-2 space-y-2">
                              {(resourcesByLesson[lesson.id] || []).length === 0 ? (
                                <div className="text-xs text-slate-500">No resources</div>
                              ) : (
                                (resourcesByLesson[lesson.id] || []).map((res) => (
                                  <div key={res.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-900">{res.title}</div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      {res.topic ? `Topic: ${res.topic} • ` : ""}
                                      {res.difficulty ? `Difficulty: ${res.difficulty} • ` : ""}
                                      {res.format ? `Format: ${res.format}` : ""}
                                    </div>

                                    {res.url ? (
                                      <a
                                        href={res.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-2 inline-block text-xs font-medium text-slate-900 underline"
                                      >
                                        Open resource
                                      </a>
                                    ) : null}
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="mt-3">
                              <Link
                                to="/student/quizzes"
                                className="text-xs font-medium text-slate-700 underline"
                              >
                                View quizzes →
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


