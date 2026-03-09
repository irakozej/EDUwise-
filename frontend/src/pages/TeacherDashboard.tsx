import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";
import NotificationBell from "../components/NotificationBell";
import MessagesPanel from "../components/MessagesPanel";

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
  const navigate = useNavigate();
  const [me, setMe] = useState<MeData | null>(null);
  const [courses, setCourses] = useState<TeachingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgUnread, setMsgUnread] = useState(0);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 text-white font-bold text-sm">
              E
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Teacher Dashboard</div>
              <div className="text-xs text-slate-400">{me ? me.full_name : "Your teaching overview"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowCreateForm(true); setCreateError(""); }}
              className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              + New Course
            </button>
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
            <button onClick={() => navigate("/profile")} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Profile</button>
            <button onClick={loadAll} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Refresh</button>
            <button onClick={logout} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Logout</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome back{me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage your courses and track student performance.</p>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-500">Courses</div>
            <div className="mt-2 text-4xl font-bold text-violet-900">{loading ? "…" : courses.length}</div>
            <div className="mt-1 text-xs text-violet-400">Active course listings</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-500">Students</div>
            <div className="mt-2 text-4xl font-bold text-sky-900">{loading ? "…" : totalStudents}</div>
            <div className="mt-1 text-xs text-sky-400">Total enrollments across all courses</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Role</div>
            <div className="mt-2 text-4xl font-bold capitalize text-emerald-900">{me?.role ?? "—"}</div>
            <div className="mt-1 text-xs text-emerald-400">Your platform role</div>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Your Courses</h2>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{courses.length} total</span>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 rounded-2xl border border-slate-200 bg-white animate-pulse" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div className="text-sm font-medium text-slate-600">No courses yet</div>
              <div className="mt-1 text-xs text-slate-400">Click "+ New Course" to create your first one.</div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course, idx) => {
                const accents = [
                  { headerBg: "bg-violet-600", badge: "bg-violet-100 text-violet-700", ring: "ring-violet-200" },
                  { headerBg: "bg-sky-600",    badge: "bg-sky-100 text-sky-700",       ring: "ring-sky-200" },
                  { headerBg: "bg-emerald-600",badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-200" },
                  { headerBg: "bg-amber-500",  badge: "bg-amber-100 text-amber-700",   ring: "ring-amber-200" },
                  { headerBg: "bg-rose-600",   badge: "bg-rose-100 text-rose-700",     ring: "ring-rose-200" },
                  { headerBg: "bg-indigo-600", badge: "bg-indigo-100 text-indigo-700", ring: "ring-indigo-200" },
                ];
                const a = accents[idx % accents.length];
                const initials = course.title.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();
                return (
                  <Link
                    key={course.course_id}
                    to={`/teacher/courses/${course.course_id}`}
                    className="group block rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all overflow-hidden"
                  >
                    {/* Colour header strip */}
                    <div className={`${a.headerBg} px-5 pt-5 pb-10 relative`}>
                      <div className="flex items-center justify-between">
                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 text-white text-sm font-bold">
                          {initials}
                        </div>
                        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          {course.enrollments} {course.enrollments === 1 ? "student" : "students"}
                        </span>
                      </div>
                    </div>

                    {/* Card body — overlaps the header */}
                    <div className="-mt-6 mx-4 mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="font-semibold text-slate-900 leading-snug group-hover:text-violet-700 transition-colors">
                        {course.title}
                      </div>
                      {course.description ? (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed">{course.description}</p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400 italic">No description</p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${a.badge}`}>
                          {course.enrollments} enrolled
                        </span>
                        <span className="text-xs font-medium text-slate-400 group-hover:text-violet-600 transition-colors">
                          Manage →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <footer className="mt-10 text-center text-xs text-slate-400">EduWise · Teacher view</footer>
      </div>

      {/* Messages Panel */}
      {msgOpen && (
        <MessagesPanel
          currentUserId={me?.id ?? 0}
          onClose={() => { setMsgOpen(false); setMsgUnread(0); }}
        />
      )}
    </div>
  );
}
