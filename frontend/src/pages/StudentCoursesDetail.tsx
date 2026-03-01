import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import RichEditor from "../components/RichEditor";
import FileUpload from "../components/FileUpload";
import NotificationBell from "../components/NotificationBell";

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

        // Load announcements
        try {
          const annRes = await api.get<Announcement[]>(`/api/v1/courses/${course_id}/announcements`);
          setAnnouncements(annRes.data || []);
        } catch { /* silently ignore */ }

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

        // Determine if all lessons are complete (for certificate)
        const allLessons = Object.values(lessonsMap).flat();
        if (allLessons.length > 0) {
          try {
            // Re-use progress already tracked; just check via API
            const progressRes = await api.get<{ items: { course_id: number; progress_pct: number }[] }>("/api/v1/me/courses");
            const courseEntry = (progressRes.data?.items || []).find((c) => c.course_id === course_id);
            if (courseEntry && courseEntry.progress_pct >= 100) setAllComplete(true);
          } catch { /* ignore */ }
        }
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
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Course</h1>
            <p className="mt-1 text-sm text-slate-500">Lessons, resources, and progress</p>
          </div>
          <div className="flex items-center gap-2">
            {allComplete && (
              <button
                onClick={downloadCertificate}
                disabled={certDownloading}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {certDownloading ? "Generating…" : "Download Certificate"}
              </button>
            )}
            <NotificationBell />
            <Link
              to="/student/courses"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to courses
            </Link>
          </div>
        </div>

        {/* Announcements banner */}
        {announcements.length > 0 && (
          <div className="mt-5 space-y-2">
            {announcements.map((ann) => (
              <div key={ann.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500 shrink-0 mt-0.5">📢</span>
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

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="font-semibold">❌ {error}</div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">Loading…</div>
        ) : modules.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-slate-400 text-3xl mb-2">📖</div>
            <div className="text-sm text-slate-500">No content yet. Check back later.</div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {modules.map((mod) => (
              <div key={mod.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">{mod.title}</div>

                <div className="mt-4 space-y-3">
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

                    return (
                      <div key={lesson.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        {/* Lesson header */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="truncate text-sm font-semibold text-slate-900">{lesson.title}</div>
                          {completed && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 shrink-0">
                              Completed
                            </span>
                          )}
                        </div>

                        {lesson.content && (
                          <div className="mb-3">
                            <RichEditor value={lesson.content || ""} readOnly />
                          </div>
                        )}

                        {/* Progress */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>Your progress</span>
                            <span className="font-medium text-slate-700">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-200">
                            <div className="h-1.5 rounded-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[25, 50, 75].map((v) => (
                              <button
                                key={v}
                                onClick={() => setProgress(lesson.id, v)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {v}%
                              </button>
                            ))}
                            <button
                              onClick={() => setProgress(lesson.id, 100)}
                              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                              Mark complete
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          {/* Resources */}
                          <div>
                            <div className="text-xs font-semibold text-slate-600 mb-2">Resources</div>
                            {resources.length === 0 ? (
                              <div className="text-xs text-slate-400">No resources</div>
                            ) : (
                              <div className="space-y-2">
                                {resources.map((res) => (
                                  <div key={res.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-xs font-semibold text-slate-900">{res.title}</div>
                                    <div className="mt-0.5 text-[11px] text-slate-500">
                                      {[res.topic && `Topic: ${res.topic}`, res.difficulty && `Difficulty: ${res.difficulty}`, res.format && `Format: ${res.format}`]
                                        .filter(Boolean).join(" · ")}
                                    </div>
                                    {res.url ? (
                                      <a href={res.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-medium text-slate-900 underline">
                                        Open resource →
                                      </a>
                                    ) : res.text_body ? (
                                      <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">{res.text_body}</p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Quizzes */}
                          <div>
                            <div className="text-xs font-semibold text-slate-600 mb-2">Quizzes</div>
                            {quizzes.length === 0 ? (
                              <div className="text-xs text-slate-400">No quizzes for this lesson</div>
                            ) : (
                              <div className="space-y-2">
                                {quizzes.map((quiz) => (
                                  <Link
                                    key={quiz.id}
                                    to={`/student/quizzes/${quiz.id}`}
                                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:bg-slate-50 hover:border-slate-300 transition"
                                  >
                                    <div className="text-xs font-medium text-slate-900">{quiz.title}</div>
                                    <span className="text-xs text-slate-400 shrink-0">Take quiz →</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Discussion */}
                        <div className="mt-4">
                          <button
                            onClick={() => loadComments(lesson.id)}
                            className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1 hover:text-slate-900"
                          >
                            💬 Discussion
                            {!loadedDiscussion[lesson.id] && <span className="text-slate-400 font-normal">(click to load)</span>}
                          </button>
                          {loadedDiscussion[lesson.id] && (
                            <div className="space-y-2">
                              {(commentsByLesson[lesson.id] || []).length === 0 ? (
                                <div className="text-xs text-slate-400">No comments yet. Be the first!</div>
                              ) : (
                                (commentsByLesson[lesson.id] || []).map((c) => (
                                  <div key={c.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-start gap-2">
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
                                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400"
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

                        {/* Assignments */}
                        {assignments.length > 0 && (
                          <div className="mt-4">
                            <div className="text-xs font-semibold text-slate-600 mb-2">Assignments</div>
                            <div className="space-y-3">
                              {assignments.map((assign) => {
                                const sub = submissionsByAssignment[assign.id];
                                const isOverdue = assign.due_date && new Date(assign.due_date) < new Date();

                                return (
                                  <div key={assign.id} className="rounded-xl border border-slate-200 bg-white p-3">
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
                                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
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
                                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none"
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
                                            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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
                          </div>
                        )}
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
