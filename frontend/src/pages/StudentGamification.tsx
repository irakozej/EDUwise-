import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type XPData = {
  total_xp: number;
  level: number;
  xp_to_next_level: number;
  recent_events: { event_type: string; xp_earned: number; created_at: string }[];
};

type BadgeInfo = {
  badge_key: string;
  name: string;
  desc: string;
  icon: string;
  earned: boolean;
  earned_at: string | null;
};

type LeaderboardEntry = {
  rank: number;
  student_id: number;
  student_name: string;
  total_xp: number;
  level: number;
  is_me: boolean;
};

type Course = { id: number; title: string };

function levelColor(level: number) {
  if (level >= 8) return { bg: "bg-amber-100", text: "text-amber-700", bar: "bg-amber-500", border: "border-amber-200" };
  if (level >= 5) return { bg: "bg-violet-100", text: "text-violet-700", bar: "bg-violet-500", border: "border-violet-200" };
  return { bg: "bg-sky-100", text: "text-sky-700", bar: "bg-sky-500", border: "border-sky-200" };
}

function formatEventType(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StudentGamification() {
  const navigate = useNavigate();
  const token = getAccessToken();

  const [xp, setXp] = useState<XPData | null>(null);
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "badges" | "leaderboard">("overview");

  useEffect(() => {
    if (!token) { window.location.href = "/"; return; }
    Promise.all([
      api.get<XPData>("/api/v1/me/xp"),
      api.get<{ all_badges: BadgeInfo[] }>("/api/v1/me/badges"),
      api.get<{ items: { course_id: number; title: string }[] }>("/api/v1/me/courses").catch(() => ({ data: { items: [] } })),
    ]).then(([xpRes, badgeRes, coursesRes]) => {
      setXp(xpRes.data);
      setBadges(badgeRes.data.all_badges || []);
      const cs: Course[] = (coursesRes.data.items || []).map((c) => ({ id: c.course_id, title: c.title }));
      setCourses(cs);
      if (cs.length > 0) setSelectedCourse(cs[0].id);
    }).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!selectedCourse) return;
    setLbLoading(true);
    api.get<{ leaderboard: LeaderboardEntry[] }>(`/api/v1/courses/${selectedCourse}/leaderboard`)
      .then((r) => setLeaderboard(r.data.leaderboard || []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLbLoading(false));
  }, [selectedCourse]);

  const colors = levelColor(xp?.level ?? 0);
  const xpPct = xp
    ? xp.xp_to_next_level > 0
      ? Math.round(((xp.total_xp % 100) / 100) * 100)
      : 100
    : 0;
  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/20 to-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/student")} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <div className="text-sm font-semibold text-slate-900">Achievements</div>
              <div className="text-xs text-slate-400">Your XP, badges & leaderboard</div>
            </div>
          </div>
          {xp && (
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${colors.bg} ${colors.text}`}>
                Level {xp.level}
              </span>
              <span className="text-xs text-slate-500 font-medium">{xp.total_xp} XP</span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-200 animate-pulse" />)}
          </div>
        )}

        {!loading && xp && (
          <>
            {/* XP Hero Card */}
            <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-6 mb-6 shadow-sm`}>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className={`text-4xl font-black ${colors.text}`}>Level {xp.level}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{xp.total_xp} total XP earned</div>
                </div>
                <div className="text-6xl select-none">
                  {xp.level >= 8 ? "🏆" : xp.level >= 5 ? "⭐" : "🚀"}
                </div>
              </div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Progress to Level {xp.level + 1}</span>
                {xp.xp_to_next_level > 0 ? (
                  <span>{xp.xp_to_next_level} XP to go</span>
                ) : (
                  <span>Max level!</span>
                )}
              </div>
              <div className="h-3 w-full rounded-full bg-white/60">
                <div
                  className={`h-3 rounded-full ${colors.bar} transition-all duration-700`}
                  style={{ width: `${xpPct}%` }}
                />
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-700">{earnedBadges.length} badges earned</span>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-700">{xp.recent_events.length} recent events</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 w-fit shadow-sm mb-6">
              {(["overview", "badges", "leaderboard"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-5 py-2 text-sm font-medium capitalize transition ${
                    activeTab === tab ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-900 mb-4">Recent XP Events</h2>
                  {xp.recent_events.length === 0 && (
                    <p className="text-sm text-slate-400">No XP earned yet — complete lessons and quizzes to earn XP!</p>
                  )}
                  <div className="space-y-2">
                    {xp.recent_events.map((ev, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                        <span className="text-sm text-slate-700">{formatEventType(ev.event_type)}</span>
                        <span className="text-sm font-bold text-emerald-600">+{ev.xp_earned} XP</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Earned badges preview */}
                {earnedBadges.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Earned Badges ({earnedBadges.length})</h2>
                    <div className="flex flex-wrap gap-3">
                      {earnedBadges.map((b) => (
                        <div key={b.badge_key} className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                          <span className="text-xl">{b.icon}</span>
                          <div>
                            <div className="text-xs font-semibold text-emerald-800">{b.name}</div>
                            <div className="text-[10px] text-emerald-600">{b.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Badges tab */}
            {activeTab === "badges" && (
              <div className="space-y-4">
                {earnedBadges.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-900 mb-4">Earned ({earnedBadges.length})</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {earnedBadges.map((b) => (
                        <div key={b.badge_key} className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                          <span className="text-3xl shrink-0">{b.icon}</span>
                          <div>
                            <div className="text-sm font-semibold text-emerald-900">{b.name}</div>
                            <div className="text-xs text-emerald-700 mt-0.5">{b.desc}</div>
                            {b.earned_at && (
                              <div className="text-[10px] text-emerald-500 mt-1">
                                Earned {new Date(b.earned_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {lockedBadges.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-400 mb-4">Locked ({lockedBadges.length})</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {lockedBadges.map((b) => (
                        <div key={b.badge_key} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-60">
                          <span className="text-3xl shrink-0 grayscale">{b.icon}</span>
                          <div>
                            <div className="text-sm font-semibold text-slate-600">{b.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{b.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Leaderboard tab */}
            {activeTab === "leaderboard" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-slate-900">Course Leaderboard</h2>
                  {courses.length > 0 && (
                    <select
                      value={selectedCourse ?? ""}
                      onChange={(e) => setSelectedCourse(Number(e.target.value))}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  )}
                </div>
                {lbLoading && (
                  <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}</div>
                )}
                {!lbLoading && leaderboard.length === 0 && (
                  <p className="text-sm text-slate-400">No leaderboard data yet for this course.</p>
                )}
                {!lbLoading && leaderboard.length > 0 && (
                  <div className="space-y-2">
                    {leaderboard.map((entry) => (
                      <div
                        key={entry.student_id}
                        className={`flex items-center gap-4 rounded-xl px-4 py-3 ${
                          entry.is_me
                            ? "border border-sky-200 bg-sky-50"
                            : entry.rank <= 3
                            ? "border border-amber-100 bg-amber-50"
                            : "border border-slate-100 bg-slate-50"
                        }`}
                      >
                        <div className={`w-7 text-center text-sm font-bold ${
                          entry.rank === 1 ? "text-amber-500" :
                          entry.rank === 2 ? "text-slate-400" :
                          entry.rank === 3 ? "text-orange-400" : "text-slate-400"
                        }`}>
                          {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {entry.student_name}{entry.is_me && <span className="ml-2 text-xs text-sky-600 font-semibold">(You)</span>}
                          </div>
                          <div className="text-xs text-slate-500">Level {entry.level}</div>
                        </div>
                        <div className="text-sm font-bold text-slate-800">{entry.total_xp} XP</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
