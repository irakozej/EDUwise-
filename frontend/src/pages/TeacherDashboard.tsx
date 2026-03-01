import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";
import NotificationBell from "../components/NotificationBell";

type TeachingCourse = {
  course_id: number;
  title: string;
  description: string | null;
  enrollments: number;
};

type MeData = {
  id: number;
  full_name: string;
  email: string;
  role: string;
};

export default function TeacherDashboard() {
  const [me, setMe] = useState<MeData | null>(null);
  const [courses, setCourses] = useState<TeachingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create course form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [meRes, teachingRes] = await Promise.all([
        api.get<MeData>("/api/v1/auth/me"),
        api.get<{ items: TeachingCourse[] }>("/api/v1/me/teaching"),
      ]);
      setMe(meRes.data);
      setCourses(teachingRes.data.items);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      window.location.href = "/";
      return;
    }
    loadAll();
  }, []);

  async function createCourse() {
    if (!newTitle.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      await api.post("/api/v1/courses", {
        title: newTitle.trim(),
        description: newDesc.trim() || null,
      });
      setNewTitle("");
      setNewDesc("");
      setShowCreateForm(false);
      await loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setCreateError(e?.response?.data?.detail || e?.message || "Failed to create course");
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    clearAccessToken();
    window.location.href = "/";
  }

  const totalStudents = courses.reduce((sum, c) => sum + c.enrollments, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white font-bold text-lg">
              E
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Teacher Dashboard</h1>
              <div className="mt-0.5 text-sm text-slate-500">
                {me ? `${me.full_name} · ${me.email}` : "Your teaching overview"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowCreateForm(true); setCreateError(""); }}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              + New Course
            </button>
            <NotificationBell />
            <button
              onClick={loadAll}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Courses</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {loading ? "…" : courses.length}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Students Enrolled</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {loading ? "…" : totalStudents}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Account Role</div>
            <div className="mt-1 text-2xl font-semibold capitalize text-slate-900">
              {me?.role ?? "—"}
            </div>
          </div>
        </div>

        {/* Create Course Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">Create New Course</h2>
              <p className="mt-1 text-sm text-slate-500">This will be added to your course list immediately.</p>

              {createError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {createError}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Title *</label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Introduction to Mathematics"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Description (optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief description of this course…"
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 resize-none"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => { setShowCreateForm(false); setNewTitle(""); setNewDesc(""); }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={createCourse}
                  disabled={!newTitle.trim() || creating}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Creating…" : "Create Course"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Course List */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Your Courses</h2>
            <span className="text-xs text-slate-500">{courses.length} total</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-slate-500">Loading courses…</div>
          ) : courses.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <div className="text-slate-400 text-3xl mb-3">📚</div>
              <div className="text-sm font-medium text-slate-600">No courses yet</div>
              <div className="mt-1 text-xs text-slate-400">Click "+ New Course" to create your first one.</div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <Link
                  key={course.course_id}
                  to={`/teacher/courses/${course.course_id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{course.title}</div>
                      {course.description ? (
                        <div className="mt-1 text-sm text-slate-500 line-clamp-2">{course.description}</div>
                      ) : (
                        <div className="mt-1 text-sm text-slate-400 italic">No description</div>
                      )}
                    </div>
                    <div className="shrink-0 grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-500 text-sm">
                      →
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {course.enrollments} {course.enrollments === 1 ? "student" : "students"}
                    </span>
                    <span className="text-xs text-slate-400">Click to manage →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <footer className="mt-10 text-xs text-slate-500">EduWise · Teacher view</footer>
      </div>
    </div>
  );
}
