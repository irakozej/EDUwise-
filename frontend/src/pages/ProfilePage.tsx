import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import FileUpload from "../components/FileUpload";

type ProfileData = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
};

function roleLabel(role: string) {
  const map: Record<string, string> = {
    student: "Student",
    teacher: "Teacher",
    admin: "Administrator",
    co_admin: "Co-Administrator",
  };
  return map[role] ?? role;
}

function roleBadgeCls(role: string) {
  const map: Record<string, string> = {
    student: "bg-sky-50 text-sky-700 border-sky-200",
    teacher: "bg-violet-50 text-violet-700 border-violet-200",
    admin: "bg-rose-50 text-rose-700 border-rose-200",
    co_admin: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return `rounded-full border px-3 py-1 text-xs font-semibold ${map[role] ?? "bg-slate-100 text-slate-600 border-slate-200"}`;
}

function backPath(role: string) {
  if (role === "teacher") return "/teacher";
  if (role === "admin" || role === "co_admin") return "/admin";
  return "/student";
}

export default function ProfilePage() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Edit form state
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (!getAccessToken()) { window.location.href = "/"; return; }
    api.get<ProfileData>("/api/v1/me/profile")
      .then((r) => {
        setProfile(r.data);
        setName(r.data.full_name);
        setBio(r.data.bio ?? "");
        setAvatarUrl(r.data.avatar_url ?? "");
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await api.patch<ProfileData>("/api/v1/me/profile", {
        full_name: name.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      });
      setProfile(res.data);
      setSuccessMsg("Profile updated successfully.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading profile…</div>
      </div>
    );
  }

  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(backPath(profile?.role ?? "student"))}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Back to Dashboard
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-semibold text-slate-900">My Profile</h1>
        </div>

        {/* Avatar + role */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-5">
          <div className="flex items-center gap-5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-20 w-20 rounded-2xl object-cover border border-slate-200"
              />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-slate-900 text-white grid place-items-center text-2xl font-bold select-none">
                {initials}
              </div>
            )}
            <div>
              <div className="text-xl font-semibold text-slate-900">{profile?.full_name}</div>
              <div className="mt-1 text-sm text-slate-500">{profile?.email}</div>
              <div className="mt-2">
                <span className={roleBadgeCls(profile?.role ?? "")}>{roleLabel(profile?.role ?? "")}</span>
              </div>
            </div>
          </div>

          {profile?.bio && (
            <p className="mt-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
              {profile.bio}
            </p>
          )}

          <div className="mt-3 text-xs text-slate-400">
            Member since {new Date(profile?.created_at ?? "").toLocaleDateString("en-US", { year: "numeric", month: "long" })}
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Edit Profile</h2>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
          {successMsg && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMsg}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short description about yourself…"
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Profile Photo</label>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                {avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt="Current avatar"
                    className="h-10 w-10 rounded-xl object-cover border border-slate-200"
                  />
                )}
                <FileUpload
                  label="Upload photo"
                  accept="image/jpeg,image/png,image/webp"
                  onUpload={(url) => setAvatarUrl(url)}
                />
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="text-xs text-slate-400 hover:text-rose-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving || !name.trim()}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => navigate(backPath(profile?.role ?? "student"))}
                className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
