import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";
import NotificationBell from "../components/NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  users: { total: number; students: number; teachers: number; admins: number; co_admins: number; inactive: number };
  courses: { total: number };
  enrollments: { total: number; active: number };
  quizzes: { total: number; attempts: number };
  activity: { total: number };
};

type AdminUser = {
  id: number;
  full_name: string;
  email: string;
  role: "student" | "teacher" | "admin" | "co_admin";
  is_active: boolean;
  created_at: string;
};

type AdminCourse = {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  enrollments: number;
  teacher: { id: number; full_name: string; email: string } | null;
};

type ActivityLog = {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
  actor: { id: number; full_name: string; email: string; role: string } | null;
};

type Tab = "overview" | "users" | "courses" | "activity";
type RoleFilter = "all" | "student" | "teacher" | "admin" | "co_admin";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadgeCls(role: string) {
  const map: Record<string, string> = {
    student: "bg-sky-50 text-sky-700 border-sky-200",
    teacher: "bg-violet-50 text-violet-700 border-violet-200",
    admin: "bg-rose-50 text-rose-700 border-rose-200",
    co_admin: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return map[role] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

function avatarCls(role: string) {
  const map: Record<string, string> = {
    student: "bg-sky-100 text-sky-700",
    teacher: "bg-violet-100 text-violet-700",
    admin: "bg-rose-100 text-rose-700",
    co_admin: "bg-orange-100 text-orange-700",
  };
  return map[role] ?? "bg-slate-100 text-slate-600";
}

function actionColor(action: string) {
  if (["REGISTER", "CREATE", "ENROLL", "BULK_ENROLL"].includes(action)) return "text-emerald-700 bg-emerald-50";
  if (["LOGIN", "REFRESH"].includes(action)) return "text-sky-700 bg-sky-50";
  if (["UPDATE", "SUBMIT", "GRADE"].includes(action)) return "text-violet-700 bg-violet-50";
  if (["REMOVE", "DELETE"].includes(action)) return "text-rose-700 bg-rose-50";
  return "text-slate-600 bg-slate-100";
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getMyRole(): string {
  try {
    const token = getAccessToken();
    if (!token) return "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role ?? "";
  } catch { return ""; }
}

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ?? "border-slate-200 bg-white"}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const myRole = getMyRole(); // "admin" or "co_admin"
  const isSuperAdmin = myRole === "admin";

  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [userSearch, setUserSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // ── Create User modal ─────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("student");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<Stats>("/api/v1/admin/stats");
      setStats(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || "Failed to load stats");
    }
  }, []);

  const loadUsers = useCallback(async (role: RoleFilter = "all") => {
    setLoadingUsers(true);
    try {
      const params = role !== "all" ? `?role=${role}` : "";
      const res = await api.get<AdminUser[]>(`/api/v1/admin/users${params}`);
      setUsers(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await api.get<AdminCourse[]>("/api/v1/admin/courses");
      setCourses(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || "Failed to load courses");
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const res = await api.get<ActivityLog[]>("/api/v1/admin/activity?limit=60");
      setActivity(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || "Failed to load activity");
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) { window.location.href = "/"; return; }
    setLoadingInit(true);
    Promise.all([loadStats(), loadUsers("all"), loadActivity()]).finally(() => setLoadingInit(false));
  }, []);

  useEffect(() => {
    if (tab === "courses" && courses.length === 0) loadCourses();
  }, [tab]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function createUser() {
    if (!newName.trim() || !newEmail.trim() || !newPassword) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await api.post<AdminUser>("/api/v1/admin/users", {
        full_name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      setUsers((prev) => [res.data, ...prev]);
      setShowCreate(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("student");
      loadStats();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setCreateError(e?.response?.data?.detail || "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: AdminUser) {
    setTogglingId(u.id);
    try {
      const res = await api.patch<{ id: number; is_active: boolean }>(`/api/v1/admin/users/${u.id}/toggle-active`);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_active: res.data.is_active } : x));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || "Failed");
    } finally {
      setTogglingId(null);
    }
  }

  async function changeRole(u: AdminUser, role: string) {
    setChangingRoleId(u.id);
    try {
      const res = await api.patch<{ id: number; role: string }>(`/api/v1/admin/users/${u.id}/role`, { role });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: res.data.role as AdminUser["role"] } : x));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || "Failed to change role");
    } finally {
      setChangingRoleId(null);
    }
  }

  async function exportUsers() {
    try {
      const res = await api.get("/api/v1/admin/users/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "users_export.csv"; a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert("Export failed"); }
  }

  function logout() { clearAccessToken(); window.location.href = "/"; }

  // ── Filtered ─────────────────────────────────────────────────────────────

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const filteredCourses = courses.filter((c) => {
    if (!courseSearch.trim()) return true;
    const q = courseSearch.toLowerCase();
    return c.title.toLowerCase().includes(q) || (c.teacher?.full_name.toLowerCase().includes(q) ?? false);
  });

  // co_admin cannot touch privileged (admin/co_admin) users
  function canToggle(target: AdminUser) {
    if (isSuperAdmin) return true;
    return target.role !== "admin" && target.role !== "co_admin";
  }

  // Role options available for a given actor
  function roleOptions() {
    if (isSuperAdmin) return ["student", "teacher", "co_admin", "admin"];
    return ["student", "teacher"];
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`grid h-9 w-9 place-items-center rounded-xl text-white text-sm font-bold ${isSuperAdmin ? "bg-rose-600" : "bg-orange-500"}`}>
              {isSuperAdmin ? "A" : "CA"}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                EDUwise {isSuperAdmin ? "Admin" : "Co-Admin"}
              </div>
              <div className="text-xs text-slate-400">
                {isSuperAdmin ? "Full access · Platform supervisor" : "Limited access · Co-Admin"}
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <nav className="hidden sm:flex gap-1 rounded-xl bg-slate-100 p-1">
            {(["overview", "users", "courses", "activity"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
                {t === "activity" && activity.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {activity.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => { loadStats(); loadUsers(roleFilter); loadActivity(); if (tab === "courses") loadCourses(); }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button onClick={logout} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Logout
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex sm:hidden gap-1 overflow-x-auto px-4 pb-2">
          {(["overview", "users", "courses", "activity"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6">

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {loadingInit ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : stats ? (
              <>
                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Platform overview</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <StatCard label="Total Users" value={stats.users.total} sub={`${stats.users.inactive} inactive`} />
                    <StatCard label="Total Courses" value={stats.courses.total} />
                    <StatCard label="Active Enrollments" value={stats.enrollments.active} sub={`${stats.enrollments.total} total`} />
                    <StatCard label="Quiz Attempts" value={stats.quizzes.attempts} sub={`${stats.quizzes.total} quizzes`} />
                    <StatCard label="Total Actions Logged" value={stats.activity.total} />
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">User breakdown</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-sky-500">Students</div>
                      <div className="mt-2 text-4xl font-bold text-sky-900">{stats.users.students}</div>
                      <div className="mt-1 text-xs text-sky-400">
                        {stats.users.total > 0 ? Math.round((stats.users.students / stats.users.total) * 100) : 0}% of all users
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-violet-500">Teachers</div>
                      <div className="mt-2 text-4xl font-bold text-violet-900">{stats.users.teachers}</div>
                      <div className="mt-1 text-xs text-violet-400">
                        {stats.users.total > 0 ? Math.round((stats.users.teachers / stats.users.total) * 100) : 0}% of all users
                      </div>
                    </div>
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-orange-500">Co-Admins</div>
                      <div className="mt-2 text-4xl font-bold text-orange-900">{stats.users.co_admins}</div>
                      <div className="mt-1 text-xs text-orange-400">Platform co-supervisors</div>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-rose-500">Admins</div>
                      <div className="mt-2 text-4xl font-bold text-rose-900">{stats.users.admins}</div>
                      <div className="mt-1 text-xs text-rose-400">Full access supervisors</div>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Recent activity</h2>
                    <button onClick={() => setTab("activity")} className="text-xs text-slate-400 underline hover:text-slate-600">
                      View all →
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {activity.slice(0, 8).map((log, i) => (
                      <div key={log.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${i < Math.min(8, activity.length) - 1 ? "border-b border-slate-100" : ""}`}>
                        <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${actionColor(log.action)}`}>
                          {log.action}
                        </span>
                        <span className="text-slate-700 min-w-0 truncate">
                          <span className="font-medium">{log.entity}</span>
                          {log.entity_id && <span className="text-slate-400"> #{log.entity_id}</span>}
                          {log.actor && <span className="hidden sm:inline text-slate-400"> · {log.actor.full_name}</span>}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-slate-400">{timeAgo(log.created_at)}</span>
                      </div>
                    ))}
                    {activity.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-slate-400">No activity yet.</div>
                    )}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        )}

        {/* ── USERS ────────────────────────────────────────────────────────── */}
        {tab === "users" && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 flex-wrap">
                {(["all", "student", "teacher", "co_admin", "admin"] as RoleFilter[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => { setRoleFilter(r); loadUsers(r); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      roleFilter === r ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {r.replace("_", "-")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name or email…"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
                <button
                  onClick={() => { setShowCreate(true); setCreateError(""); }}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  + Create User
                </button>
                <button
                  onClick={exportUsers}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400 mb-3">
              Showing {filteredUsers.length} of {users.length} users
            </div>

            {loadingUsers ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                No users found.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {filteredUsers.map((u, i) => {
                  const isPrivileged = u.role === "admin" || u.role === "co_admin";
                  const canAct = canToggle(u);
                  return (
                    <div
                      key={u.id}
                      className={`flex items-center gap-4 px-5 py-4 transition ${!u.is_active ? "opacity-50" : ""} ${i < filteredUsers.length - 1 ? "border-b border-slate-100" : ""}`}
                    >
                      {/* Avatar */}
                      <div className={`shrink-0 grid h-9 w-9 place-items-center rounded-xl text-xs font-bold ${avatarCls(u.role)}`}>
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 text-sm">{u.full_name}</span>
                          {!u.is_active && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">inactive</span>
                          )}
                          {isPrivileged && (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roleBadgeCls(u.role)}`}>
                              {u.role === "admin" ? "Super Admin" : "Co-Admin"}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{u.email}</div>
                        <div className="text-[11px] text-slate-300 mt-0.5">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                      </div>

                      {/* Role selector */}
                      {canAct ? (
                        <select
                          value={u.role}
                          disabled={changingRoleId === u.id}
                          onChange={(e) => changeRole(u, e.target.value)}
                          className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-xs font-semibold outline-none cursor-pointer disabled:opacity-50 ${roleBadgeCls(u.role)}`}
                        >
                          {roleOptions().map((r) => (
                            <option key={r} value={r}>{r.replace("_", "-")}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${roleBadgeCls(u.role)}`}>
                          {u.role.replace("_", "-")}
                        </span>
                      )}

                      {/* Deactivate / Reactivate */}
                      {canAct ? (
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={togglingId === u.id}
                          className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                            u.is_active ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {togglingId === u.id ? "…" : u.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      ) : (
                        <span className="shrink-0 rounded-xl border border-slate-100 px-3 py-1.5 text-xs text-slate-300">
                          Protected
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── COURSES ──────────────────────────────────────────────────────── */}
        {tab === "courses" && (
          <div>
            <div className="flex items-center justify-between mb-4 gap-3">
              <input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search by title or teacher…"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 max-w-xs w-full"
              />
              <span className="text-xs text-slate-400 shrink-0">{filteredCourses.length} of {courses.length} courses</span>
            </div>

            {loadingCourses ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : filteredCourses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                No courses found.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {filteredCourses.map((c, i) => (
                  <div key={c.id} className={`flex items-center gap-4 px-5 py-4 ${i < filteredCourses.length - 1 ? "border-b border-slate-100" : ""}`}>
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 text-xs font-bold">
                      #{c.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 text-sm truncate">{c.title}</div>
                      {c.description && (
                        <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{c.description}</div>
                      )}
                      {c.teacher && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            {c.teacher.full_name}
                          </span>
                          <span className="text-[11px] text-slate-300">{c.teacher.email}</span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold text-slate-900">{c.enrollments}</div>
                      <div className="text-[11px] text-slate-400">enrolled</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-300 hidden lg:block">
                      {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY ─────────────────────────────────────────────────────── */}
        {tab === "activity" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-slate-400">{activity.length} most recent events</div>
              <button
                onClick={loadActivity}
                disabled={loadingActivity}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingActivity ? "Loading…" : "Refresh"}
              </button>
            </div>

            {loadingActivity ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : activity.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
                No activity recorded yet.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {activity.map((log, i) => (
                  <div key={log.id} className={`flex items-start gap-3 px-5 py-3.5 ${i < activity.length - 1 ? "border-b border-slate-100" : ""}`}>
                    <span className={`shrink-0 mt-0.5 rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${actionColor(log.action)}`}>
                      {log.action}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800">
                        <span className="font-medium">{log.entity}</span>
                        {log.entity_id && <span className="text-slate-400"> · #{log.entity_id}</span>}
                      </div>
                      {log.actor ? (
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${roleBadgeCls(log.actor.role)}`}>
                            {log.actor.role.replace("_", "-")}
                          </span>
                          <span className="text-xs text-slate-500">{log.actor.full_name}</span>
                          <span className="text-[11px] text-slate-300">{log.actor.email}</span>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-slate-400">system</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-400">{timeAgo(log.created_at)}</div>
                      <div className="text-[11px] text-slate-300">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create User Modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Create New User</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isSuperAdmin
                ? "You can create students, teachers, co-admins, and admins."
                : "You can create students and teachers. Only The Admin can create co-admins or admins."}
            </p>

            {createError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {createError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Full Name *</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Email *</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Password *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Role *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  {isSuperAdmin && <option value="co_admin">Co-Admin</option>}
                  {isSuperAdmin && <option value="admin">Admin (Super)</option>}
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("student"); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={createUser}
                disabled={!newName.trim() || !newEmail.trim() || !newPassword || creating}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-8 pb-6 text-center text-xs text-slate-400">EDUwise · Admin Control Panel</footer>
    </div>
  );
}
