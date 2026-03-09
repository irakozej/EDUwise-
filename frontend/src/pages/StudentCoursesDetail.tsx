import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import RichEditor from "../components/RichEditor";
import FileUpload from "../components/FileUpload";
import NotificationBell from "../components/NotificationBell";

function resourceUrl(platform: string, searchQuery: string): string {
  const q = encodeURIComponent(searchQuery);
  const p = platform.toLowerCase();
  if (p.includes("youtube")) return `https://www.youtube.com/results?search_query=${q}`;
  if (p.includes("khan")) return `https://www.khanacademy.org/search?search_term=${q}`;
  if (p.includes("freecodecamp")) return `https://www.freecodecamp.org/news/search/?query=${q}`;
  if (p.includes("mdn")) return `https://developer.mozilla.org/en-US/search?q=${q}`;
  if (p.includes("coursera")) return `https://www.coursera.org/search?query=${q}`;
  if (p.includes("edx")) return `https://www.edx.org/search?q=${q}`;
  if (p.includes("wikipedia")) return `https://en.wikipedia.org/w/index.php?search=${q}`;
  if (p.includes("geeksforgeeks")) return `https://www.geeksforgeeks.org/search/?q=${q}`;
  if (p.includes("w3schools")) return `https://www.google.com/search?q=site%3Aw3schools.com+${q}`;
  if (p.includes("mit")) return `https://ocw.mit.edu/search/?q=${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(platform + " " + searchQuery)}`;
}

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
type Quiz = { id: number; lesson_id: number; title: string; is_published: boolean };
type Announcement = {
  id: number;
  title: string;
  body: string | null;
  created_at: string;
};
type Assignment = {
  id: number;
  lesson_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  max_score: number;
};
type Submission = {
  id: number;
  assignment_id: number;
  student_id: number;
  text_body: string | null;
  file_url: string | null;
  file_name: string | null;
  is_submitted: boolean;
  submitted_at: string | null;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
};
type Comment = {
  id: number;
  lesson_id: number;
  author_id: number;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
};
type LeaderboardEntry = { rank: number; student_name: string; total_xp: number; level: number; is_me: boolean };
type PeerReviewItem = { peer_review_id: number; assignment_title: string; course_title: string; submission_snippet: string | null };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function StudentCourseDetail() {
  const { courseId } = useParams();
  const course_id = Number(courseId);
  const token = useMemo(() => getAccessToken(), []);

  const [modules, setModules] = useState<Module[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<number, Lesson[]>>({});
  const [resourcesByLesson, setResourcesByLesson] = useState<Record<number, Resource[]>>({});
  const [quizzesByLesson, setQuizzesByLesson] = useState<Record<number, Quiz[]>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [assignmentsByLesson, setAssignmentsByLesson] = useState<Record<number, Assignment[]>>({});
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState<Record<number, Submission | null>>({});
  const [progressByLesson, setProgressByLesson] = useState<Record<number, number>>({});

  // AI resources per lesson
  type AiResource = { title: string; platform: string; description: string; resource_type: string; search_query: string };
  const [aiResourcesByLesson, setAiResourcesByLesson] = useState<Record<number, AiResource[]>>({});
  const [aiResourcesLoading, setAiResourcesLoading] = useState<Record<number, boolean>>({});
  const [aiResourcesLoaded, setAiResourcesLoaded] = useState<Record<number, boolean>>({});
  const [aiResourcesError, setAiResourcesError] = useState<Record<number, string>>({});
  const [allComplete, setAllComplete] = useState(false);
  const [certDownloading, setCertDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Submit form state per assignment
  const [submitText, setSubmitText] = useState<Record<number, string>>({});
  const [submitFileUrl, setSubmitFileUrl] = useState<Record<number, string>>({});
  const [submitFileName, setSubmitFileName] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [submitError, setSubmitError] = useState<Record<number, string>>({});

  // Per-lesson active tab
  type LessonTab = "overview" | "resources" | "quizzes" | "assignments" | "discussion" | "notes";
  const [lessonTab, setLessonTab] = useState<Record<number, LessonTab>>({});

  // Notes state per lesson
  const [notesByLesson, setNotesByLesson] = useState<Record<number, string>>({});
  const [noteSaving, setNoteSaving] = useState<Record<number, boolean>>({});
  const noteDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const [noteLoaded, setNoteLoaded] = useState<Record<number, boolean>>({});

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Peer reviews to do
  const [pendingReviews, setPendingReviews] = useState<PeerReviewItem[]>([]);
  const [reviewScore, setReviewScore] = useState<Record<number, string>>({});
  const [reviewFeedback, setReviewFeedback] = useState<Record<number, string>>({});
  const [submittingReview, setSubmittingReview] = useState<Record<number, boolean>>({});
  const [reviewSubmitted, setReviewSubmitted] = useState<Record<number, boolean>>({});


  // Discussion state per lesson
  const [commentsByLesson, setCommentsByLesson] = useState<Record<number, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [postingComment, setPostingComment] = useState<Record<number, boolean>>({});
  const [loadedDiscussion, setLoadedDiscussion] = useState<Record<number, boolean>>({});

  async function loadComments(lesson_id: number) {
    if (loadedDiscussion[lesson_id]) return;
    try {
      const res = await api.get<Comment[]>(`/api/v1/lessons/${lesson_id}/comments`);
      setCommentsByLesson((p) => ({ ...p, [lesson_id]: res.data || [] }));
      setLoadedDiscussion((p) => ({ ...p, [lesson_id]: true }));
    } catch { /* ignore */ }
  }

  async function loadNote(lesson_id: number) {
    if (noteLoaded[lesson_id]) return;
    try {
      const res = await api.get<{ content_html: string | null }>(`/api/v1/me/notes/${lesson_id}`);
      setNotesByLesson((p) => ({ ...p, [lesson_id]: res.data.content_html ?? "" }));
    } catch { /* ignore */ } finally {
      setNoteLoaded((p) => ({ ...p, [lesson_id]: true }));
    }
  }

  async function loadAiResources(lesson_id: number) {
    if (aiResourcesLoaded[lesson_id] || aiResourcesLoading[lesson_id]) return;
    setAiResourcesLoading((p) => ({ ...p, [lesson_id]: true }));
    setAiResourcesError((p) => ({ ...p, [lesson_id]: "" }));
    try {
      const res = await api.post<{ resources: AiResource[] }>(`/api/v1/lessons/${lesson_id}/ai-resources`);
      setAiResourcesByLesson((p) => ({ ...p, [lesson_id]: res.data.resources || [] }));
      setAiResourcesLoaded((p) => ({ ...p, [lesson_id]: true }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = e?.response?.data?.detail || e?.message || "Failed to load AI resources";
      setAiResourcesError((p) => ({ ...p, [lesson_id]: msg }));
    } finally {
      setAiResourcesLoading((p) => ({ ...p, [lesson_id]: false }));
    }
  }

  function saveNote(lesson_id: number, html: string) {
    setNoteSaving((p) => ({ ...p, [lesson_id]: true }));
    api.put(`/api/v1/me/notes/${lesson_id}`, { content_html: html })
      .catch(() => {})
      .finally(() => setNoteSaving((p) => ({ ...p, [lesson_id]: false })));
  }

  function handleNoteChange(lesson_id: number, html: string) {
    setNotesByLesson((p) => ({ ...p, [lesson_id]: html }));
    clearTimeout(noteDebounceRef.current[lesson_id]);
    noteDebounceRef.current[lesson_id] = setTimeout(() => saveNote(lesson_id, html), 1000);
  }

  async function submitPeerReview(peer_review_id: number) {
    const score = parseInt(reviewScore[peer_review_id] ?? "");
    if (isNaN(score) || score < 0 || score > 100) return;
    setSubmittingReview((p) => ({ ...p, [peer_review_id]: true }));
    try {
      await api.post(`/api/v1/peer-reviews/${peer_review_id}/submit`, {
        score,
        feedback: reviewFeedback[peer_review_id] ?? "",
      });
      setReviewSubmitted((p) => ({ ...p, [peer_review_id]: true }));
      setPendingReviews((prev) => prev.filter((r) => r.peer_review_id !== peer_review_id));
    } catch { /* ignore */ } finally {
      setSubmittingReview((p) => ({ ...p, [peer_review_id]: false }));
    }
  }

  async function postComment(lesson_id: number) {
    const body = (commentText[lesson_id] || "").trim();
    if (!body) return;
    setPostingComment((p) => ({ ...p, [lesson_id]: true }));
    try {
      const res = await api.post<Comment>(`/api/v1/lessons/${lesson_id}/comments`, { body });
      setCommentsByLesson((p) => ({ ...p, [lesson_id]: [...(p[lesson_id] || []), res.data] }));
      setCommentText((p) => ({ ...p, [lesson_id]: "" }));
    } catch { /* ignore */ } finally {
      setPostingComment((p) => ({ ...p, [lesson_id]: false }));
    }
  }

  async function deleteComment(lesson_id: number, comment_id: number) {
    try {
      await api.delete(`/api/v1/comments/${comment_id}`);
      setCommentsByLesson((p) => ({ ...p, [lesson_id]: (p[lesson_id] || []).filter((c) => c.id !== comment_id) }));
    } catch { /* ignore */ }
  }

  const openedLessons = useMemo(() => new Set<number>(), []);

  async function trackEvent(event_type: string, lesson_id?: number) {
    try {
      await api.post("/api/v1/events", { event_type, course_id, lesson_id: lesson_id ?? null });
    } catch { /* ignore */ }
  }

  function handleLessonOpen(lesson_id: number) {
    if (!openedLessons.has(lesson_id)) {
      openedLessons.add(lesson_id);
      trackEvent("lesson_open", lesson_id);
    }
  }

  useEffect(() => {
    if (!token) { window.location.href = "/"; return; }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const m = await api.get<Module[]>(`/api/v1/courses/${course_id}/modules`);
        const mods = (m.data || []).sort((a, b) => a.order_index - b.order_index);
        setModules(mods);

        const lessonsMap: Record<number, Lesson[]> = {};
        const resMap: Record<number, Resource[]> = {};
        const quizMap: Record<number, Quiz[]> = {};
        const assignMap: Record<number, Assignment[]> = {};

        for (const mod of mods) {
          const l = await api.get<Lesson[]>(`/api/v1/modules/${mod.id}/lessons`);
          const lessons = (l.data || []).sort((a, b) => a.order_index - b.order_index);
          lessonsMap[mod.id] = lessons;

          for (const lesson of lessons) {
            const [r, q, a] = await Promise.all([
              api.get<Resource[]>(`/api/v1/lessons/${lesson.id}/resources`),
              api.get<Quiz[]>(`/api/v1/lessons/${lesson.id}/quizzes`),
              api.get<Assignment[]>(`/api/v1/lessons/${lesson.id}/assignments`),
            ]);
            resMap[lesson.id] = r.data || [];
            quizMap[lesson.id] = q.data || [];
            assignMap[lesson.id] = a.data || [];
          }
        }

        setLessonsByModule(lessonsMap);
        setResourcesByLesson(resMap);
        setQuizzesByLesson(quizMap);
        setAssignmentsByLesson(assignMap);

        // Load announcements, leaderboard, and pending peer reviews in parallel
        await Promise.allSettled([
          api.get<Announcement[]>(`/api/v1/courses/${course_id}/announcements`)
            .then((r) => setAnnouncements(r.data || [])),
          api.get<LeaderboardEntry[]>(`/api/v1/courses/${course_id}/leaderboard`)
            .then((r) => setLeaderboard(r.data || [])),
          api.get<PeerReviewItem[]>("/api/v1/me/peer-reviews-pending")
            .then((r) => setPendingReviews(r.data || [])),
        ]);

        // Load existing submissions for all assignments
        const allAssignments = Object.values(assignMap).flat();
        if (allAssignments.length > 0) {
          const mySubsRes = await api.get<Submission[]>("/api/v1/me/submissions");
          const mySubs = mySubsRes.data || [];
          const subMap: Record<number, Submission | null> = {};
          for (const assign of allAssignments) {
            subMap[assign.id] = mySubs.find((s) => s.assignment_id === assign.id) ?? null;
          }
          setSubmissionsByAssignment(subMap);
        }

        // Load per-lesson progress for this course
        try {
          const progRes = await api.get<Record<string, number>>(`/api/v1/courses/${course_id}/my-progress`);
          const progMap: Record<number, number> = {};
          for (const [k, v] of Object.entries(progRes.data)) {
            progMap[Number(k)] = v;
          }
          setProgressByLesson(progMap);
          const allLessons = Object.values(lessonsMap).flat();
          if (allLessons.length > 0 && allLessons.every((l) => (progMap[l.id] ?? 0) >= 100)) {
            setAllComplete(true);
          }
        } catch { /* ignore */ }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to load course content");
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
      trackEvent("lesson_progress", lesson_id);
      if (clamped >= 100) trackEvent("lesson_complete", lesson_id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || e?.message || "Failed to update progress");
    }
  }

  async function submitAssignment(assignment_id: number) {
    const text = submitText[assignment_id] || "";
    const fileUrl = submitFileUrl[assignment_id] || "";
    const fileName = submitFileName[assignment_id] || "";

    if (!text.trim() && !fileUrl) {
      setSubmitError((p) => ({ ...p, [assignment_id]: "Provide a text answer or upload a file." }));
      return;
    }

    setSubmitting((p) => ({ ...p, [assignment_id]: true }));
    setSubmitError((p) => ({ ...p, [assignment_id]: "" }));

    try {
      const res = await api.post<Submission>(`/api/v1/assignments/${assignment_id}/submit`, {
        text_body: text || null,
        file_url: fileUrl || null,
        file_name: fileName || null,
      });
      setSubmissionsByAssignment((p) => ({ ...p, [assignment_id]: res.data }));
      setSubmitText((p) => ({ ...p, [assignment_id]: "" }));
      setSubmitFileUrl((p) => ({ ...p, [assignment_id]: "" }));
      setSubmitFileName((p) => ({ ...p, [assignment_id]: "" }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setSubmitError((p) => ({ ...p, [assignment_id]: e?.response?.data?.detail || e?.message || "Submit failed" }));
    } finally {
      setSubmitting((p) => ({ ...p, [assignment_id]: false }));
    }
  }

  async function downloadCertificate() {
    setCertDownloading(true);
    try {
      const res = await api.get(`/api/v1/me/courses/${course_id}/certificate`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate_course_${course_id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || e?.message || "Certificate not available yet. Complete all lessons first.");
    } finally {
      setCertDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav bar */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/student/courses" className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Link>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">Course Content</div>
              <div className="text-xs text-slate-400">Lessons, resources, and progress</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {allComplete && (
              <button
                onClick={downloadCertificate}
                disabled={certDownloading}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {certDownloading ? "Generating…" : "Download Certificate"}
              </button>
            )}
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Announcements banner */}
        {announcements.length > 0 && (
          <div className="mb-5 space-y-2">
            {announcements.map((ann) => (
              <div key={ann.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber-900">{ann.title}</div>
                    {ann.body && <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">{ann.body}</p>}
                    <div className="mt-1 text-[11px] text-amber-600">{new Date(ann.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pending Peer Reviews */}
        {pendingReviews.length > 0 && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Peer Reviews to Complete
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{pendingReviews.length}</span>
            </h3>
            <div className="space-y-3">
              {pendingReviews.map((pr) => (
                <div key={pr.peer_review_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-800">{pr.assignment_title}</div>
                  {pr.submission_snippet && (
                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-600 line-clamp-3">{pr.submission_snippet}</div>
                  )}
                  {reviewSubmitted[pr.peer_review_id] ? (
                    <div className="text-xs text-emerald-600 font-medium">Review submitted</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 shrink-0">Score (0–100):</label>
                        <input
                          type="number" min={0} max={100}
                          value={reviewScore[pr.peer_review_id] ?? ""}
                          onChange={(e) => setReviewScore((p) => ({ ...p, [pr.peer_review_id]: e.target.value }))}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                        />
                      </div>
                      <textarea
                        value={reviewFeedback[pr.peer_review_id] ?? ""}
                        onChange={(e) => setReviewFeedback((p) => ({ ...p, [pr.peer_review_id]: e.target.value }))}
                        placeholder="Feedback (optional)"
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none resize-none focus:border-slate-400"
                      />
                      <button
                        onClick={() => submitPeerReview(pr.peer_review_id)}
                        disabled={submittingReview[pr.peer_review_id] || !(reviewScore[pr.peer_review_id] ?? "").trim()}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {submittingReview[pr.peer_review_id] ? "Submitting…" : "Submit Review"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Course Leaderboard</h3>
            <div className="space-y-1">
              {leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className={`flex items-center gap-3 py-2 px-3 rounded-xl ${entry.is_me ? "bg-sky-50 border border-sky-100" : ""}`}
                >
                  <span className="text-xs font-bold text-slate-400 w-5">#{entry.rank}</span>
                  <span className={`flex-1 text-sm truncate ${entry.is_me ? "font-semibold text-sky-700" : "text-slate-700"}`}>
                    {entry.student_name}{entry.is_me ? " (you)" : ""}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{entry.total_xp} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl border border-slate-200 bg-white animate-pulse" />)}
          </div>
        ) : modules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="text-sm font-medium text-slate-600">No content yet</div>
            <div className="mt-1 text-xs text-slate-400">Check back when your teacher adds lessons.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {modules.map((mod) => (
              <div key={mod.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                  <div className="text-sm font-semibold text-slate-900">{mod.title}</div>
                  <span className="text-xs text-slate-400 shrink-0">{(lessonsByModule[mod.id] || []).length} {(lessonsByModule[mod.id] || []).length === 1 ? "lesson" : "lessons"}</span>
                </div>

                <div className="p-5 space-y-3">
                  {(lessonsByModule[mod.id] || []).length === 0 && (
                    <div className="text-xs text-slate-400">No lessons in this module yet.</div>
                  )}

                  {(lessonsByModule[mod.id] || []).map((lesson) => {
                    const pct = progressByLesson[lesson.id] ?? 0;
                    const completed = pct >= 100;
                    handleLessonOpen(lesson.id);
                    const quizzes = quizzesByLesson[lesson.id] || [];
                    const resources = resourcesByLesson[lesson.id] || [];
                    const assignments = assignmentsByLesson[lesson.id] || [];
                    const activeTab: LessonTab = lessonTab[lesson.id] ?? "overview";

                    const tabs: { key: LessonTab; label: string; count?: number }[] = [
                      { key: "overview",    label: "Overview" },
                      { key: "resources",   label: "Resources",   count: resources.length },
                      { key: "quizzes",     label: "Quizzes",     count: quizzes.length },
                      { key: "assignments", label: "Assignments",  count: assignments.length },
                      { key: "discussion",  label: "Discussion" },
                      { key: "notes",       label: "Notes" },
                    ];

                    return (
                      <div key={lesson.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        {/* Lesson header */}
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                          <div className="truncate text-sm font-semibold text-slate-900">{lesson.title}</div>
                          {completed ? (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              Completed
                            </span>
                          ) : (
                            <span className="shrink-0 text-xs text-slate-400">{pct}% done</span>
                          )}
                        </div>

                        {/* Tab bar */}
                        <div className="flex border-b border-slate-100 overflow-x-auto">
                          {tabs.map((t) => (
                            <button
                              key={t.key}
                              onClick={() => {
                                setLessonTab((p) => ({ ...p, [lesson.id]: t.key }));
                                if (t.key === "notes") loadNote(lesson.id);
                                if (t.key === "discussion") loadComments(lesson.id);
                                if (t.key === "resources") loadAiResources(lesson.id);
                              }}
                              className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition border-b-2 ${
                                activeTab === t.key
                                  ? "border-sky-500 text-sky-700 bg-sky-50/50"
                                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {t.label}
                              {t.count != null && t.count > 0 && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === t.key ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                                  {t.count}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Tab content */}
                        <div className="p-4">

                          {/* ── Overview ── */}
                          {activeTab === "overview" && (
                            <div className="space-y-4">
                              {lesson.content ? (
                                <RichEditor value={lesson.content} readOnly />
                              ) : (
                                <div className="text-xs text-slate-400 italic">No lesson content yet.</div>
                              )}

                              {/* Auto-tracked progress */}
                              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                  <span className="font-medium text-slate-600">Your progress</span>
                                  <span className="font-bold text-slate-700">{pct}%</span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-200">
                                  <div
                                    className={`h-2 rounded-full transition-all ${completed ? "bg-emerald-500" : "bg-sky-500"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="mt-2 text-[11px] text-slate-400">
                                  {completed
                                    ? "Lesson complete"
                                    : "Progress is tracked automatically as you open lessons, take quizzes, complete exercises, and submit assignments."}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* ── Resources ── */}
                          {activeTab === "resources" && (
                            <div className="space-y-4">
                              {/* Teacher-added resources */}
                              {resources.length === 0 ? (
                                <div className="text-xs text-slate-400 py-2 text-center">No resources added by teacher yet.</div>
                              ) : (
                                <div className="space-y-2">
                                  {resources.map((res) => (
                                    <div key={res.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="text-xs font-semibold text-slate-900">{res.title}</div>
                                      <div className="mt-0.5 text-[11px] text-slate-500">
                                        {[res.topic && `Topic: ${res.topic}`, res.difficulty && `Difficulty: ${res.difficulty}`, res.format && `Format: ${res.format}`]
                                          .filter(Boolean).join(" · ")}
                                      </div>
                                      {res.url ? (
                                        <a href={res.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-medium text-sky-700 hover:underline">
                                          Open resource →
                                        </a>
                                      ) : res.text_body ? (
                                        <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">{res.text_body}</p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* AI-recommended free resources */}
                              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs font-semibold text-indigo-900">AI-Recommended Free Resources</div>
                                  {(aiResourcesLoaded[lesson.id] || aiResourcesError[lesson.id]) && (
                                    <button
                                      onClick={() => {
                                        setAiResourcesLoaded((p) => ({ ...p, [lesson.id]: false }));
                                        setAiResourcesByLesson((p) => ({ ...p, [lesson.id]: [] }));
                                        setAiResourcesError((p) => ({ ...p, [lesson.id]: "" }));
                                        loadAiResources(lesson.id);
                                      }}
                                      className="text-[11px] text-indigo-600 hover:underline"
                                    >
                                      Retry
                                    </button>
                                  )}
                                </div>
                                {aiResourcesLoading[lesson.id] ? (
                                  <div className="text-[11px] text-indigo-500 py-2">Finding the best free resources for this lesson…</div>
                                ) : aiResourcesError[lesson.id] ? (
                                  <div className="text-[11px] text-rose-600 py-1">{aiResourcesError[lesson.id]}</div>
                                ) : (aiResourcesByLesson[lesson.id] || []).length === 0 ? (
                                  <div className="text-[11px] text-indigo-400 italic">Loading recommendations…</div>
                                ) : (
                                  <div className="space-y-2">
                                    {(aiResourcesByLesson[lesson.id] || []).map((r, i) => {
                                      const typeLabel = r.resource_type === "video" ? "Video" : r.resource_type === "article" ? "Article" : r.resource_type === "course" ? "Course" : r.resource_type === "documentation" ? "Docs" : "Tutorial";
                                      const url = resourceUrl(r.platform, r.search_query);
                                      return (
                                        <a
                                          key={i}
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="block rounded-lg border border-indigo-100 bg-white p-2.5 hover:border-indigo-300 hover:shadow-sm transition"
                                        >
                                          <div className="flex items-start gap-2">
                                            <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">{typeLabel}</span>
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-semibold text-slate-900 leading-tight">{r.title}</div>
                                              <div className="text-[11px] text-indigo-600 font-medium">{r.platform}</div>
                                              <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{r.description}</p>
                                              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700">
                                                Open on {r.platform}
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                                              </div>
                                            </div>
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ── Quizzes ── */}
                          {activeTab === "quizzes" && (
                            <div className="space-y-3">
                              {quizzes.length === 0 ? (
                                <div className="text-xs text-slate-400 py-4 text-center">No quizzes for this lesson.</div>
                              ) : (
                                <div className="space-y-2">
                                  {quizzes.map((quiz) => (
                                    <Link
                                      key={quiz.id}
                                      to={`/student/quizzes/${quiz.id}`}
                                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:bg-sky-50 hover:border-sky-200 transition"
                                    >
                                      <div className="text-xs font-medium text-slate-900">{quiz.title}</div>
                                      <span className="text-xs text-sky-600 font-medium shrink-0">Take quiz →</span>
                                    </Link>
                                  ))}
                                </div>
                              )}
                              {/* AI Exercises */}
                              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div>
                                    <div className="text-xs font-semibold text-violet-900">AI Practice Exercises</div>
                                    <p className="text-[11px] text-violet-700 mt-0.5">
                                      Generate 10 personalized questions based on this lesson's content.
                                    </p>
                                  </div>
                                  <Link
                                    to={`/student/lessons/${lesson.id}/exercises`}
                                    className="shrink-0 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition"
                                  >
                                    Generate Exercises
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* ── Assignments ── */}
                          {activeTab === "assignments" && (
                            <div>
                              {assignments.length === 0 ? (
                                <div className="text-xs text-slate-400 py-4 text-center">No assignments for this lesson.</div>
                              ) : (
                                <div className="space-y-3">
                                  {assignments.map((assign) => {
                                    const sub = submissionsByAssignment[assign.id];
                                    const isOverdue = assign.due_date && new Date(assign.due_date) < new Date();

                                    return (
                                      <div key={assign.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <div className="text-xs font-semibold text-slate-900">{assign.title}</div>
                                            {assign.description && (
                                              <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{assign.description}</p>
                                            )}
                                            <div className="mt-1 flex gap-2 flex-wrap">
                                              <span className="text-[11px] text-slate-400">Max: {assign.max_score} pts</span>
                                              {assign.due_date && (
                                                <span className={`text-[11px] ${isOverdue ? "text-rose-500 font-medium" : "text-slate-400"}`}>
                                                  Due: {new Date(assign.due_date).toLocaleDateString()}{isOverdue && " (Overdue)"}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {sub?.grade != null ? (
                                            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                                              {sub.grade}/{assign.max_score}
                                            </span>
                                          ) : sub?.is_submitted ? (
                                            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200">
                                              Awaiting grade
                                            </span>
                                          ) : null}
                                        </div>

                                        {sub?.grade != null && sub.feedback && (
                                          <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                                            <div className="text-[11px] font-semibold text-emerald-800 mb-0.5">Feedback</div>
                                            <p className="text-[11px] text-emerald-700 leading-relaxed">{sub.feedback}</p>
                                          </div>
                                        )}

                                        {sub?.is_submitted && sub.grade == null && (
                                          <div className="mt-2 space-y-1">
                                            {sub.text_body && (
                                              <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                <div className="text-[11px] font-semibold text-slate-600 mb-0.5">Your answer</div>
                                                <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">{sub.text_body}</p>
                                              </div>
                                            )}
                                            {sub.file_url && (
                                              <a href={sub.file_url} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-slate-700 underline">
                                                {sub.file_name || "View uploaded file"} →
                                              </a>
                                            )}
                                          </div>
                                        )}

                                        {!sub?.is_submitted && (
                                          <div className="mt-3 space-y-2">
                                            {submitError[assign.id] && (
                                              <div className="text-xs text-rose-600">{submitError[assign.id]}</div>
                                            )}
                                            <textarea
                                              value={submitText[assign.id] || ""}
                                              onChange={(e) => setSubmitText((p) => ({ ...p, [assign.id]: e.target.value }))}
                                              placeholder="Type your answer here…"
                                              rows={3}
                                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-400 resize-none"
                                            />
                                            <div className="flex items-center gap-3">
                                              <FileUpload
                                                onUpload={(url, name) => {
                                                  setSubmitFileUrl((p) => ({ ...p, [assign.id]: url }));
                                                  setSubmitFileName((p) => ({ ...p, [assign.id]: name }));
                                                }}
                                                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip"
                                                label="Attach file"
                                              />
                                              <button
                                                onClick={() => submitAssignment(assign.id)}
                                                disabled={submitting[assign.id]}
                                                className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                                              >
                                                {submitting[assign.id] ? "Submitting…" : "Submit"}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Discussion ── */}
                          {/* ── Notes ── */}
                          {activeTab === "notes" && (
                            <div className="space-y-2">
                              <p className="text-xs text-slate-500">Your private notes — only you can see these.</p>
                              <RichEditor
                                value={notesByLesson[lesson.id] ?? ""}
                                onChange={(html) => handleNoteChange(lesson.id, html)}
                              />
                              {noteSaving[lesson.id] && (
                                <p className="text-xs text-slate-400">Saving…</p>
                              )}
                            </div>
                          )}

                          {/* ── Discussion ── */}
                          {activeTab === "discussion" && (
                            <div>
                              {!loadedDiscussion[lesson.id] ? (
                                <div className="py-4 text-center">
                                  <button
                                    onClick={() => loadComments(lesson.id)}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                                  >
                                    Load discussion
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {(commentsByLesson[lesson.id] || []).length === 0 ? (
                                    <div className="text-xs text-slate-400 py-2 text-center">No comments yet. Be the first!</div>
                                  ) : (
                                    (commentsByLesson[lesson.id] || []).map((c) => (
                                      <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-start gap-2">
                                        <div className={`shrink-0 grid h-7 w-7 place-items-center rounded-xl text-[10px] font-bold ${c.author_role === "teacher" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                                          {c.author_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs font-semibold text-slate-800">{c.author_name}</span>
                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.author_role === "teacher" ? "bg-violet-50 text-violet-600" : "bg-sky-50 text-sky-600"}`}>
                                              {c.author_role}
                                            </span>
                                            <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(c.created_at)}</span>
                                          </div>
                                          <p className="mt-0.5 text-xs text-slate-700 leading-relaxed">{c.body}</p>
                                        </div>
                                        <button
                                          onClick={() => deleteComment(lesson.id, c.id)}
                                          className="shrink-0 text-slate-300 hover:text-rose-400 text-xs mt-0.5"
                                          title="Delete"
                                        >×</button>
                                      </div>
                                    ))
                                  )}
                                  <div className="flex gap-2 mt-2">
                                    <input
                                      value={commentText[lesson.id] || ""}
                                      onChange={(e) => setCommentText((p) => ({ ...p, [lesson.id]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(lesson.id); } }}
                                      placeholder="Add a comment… (Enter to post)"
                                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-sky-400"
                                    />
                                    <button
                                      onClick={() => postComment(lesson.id)}
                                      disabled={postingComment[lesson.id] || !(commentText[lesson.id] || "").trim()}
                                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      {postingComment[lesson.id] ? "…" : "Post"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

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
