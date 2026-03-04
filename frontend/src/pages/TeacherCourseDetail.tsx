import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken, clearAccessToken } from "../lib/auth";
import RichEditor from "../components/RichEditor";
import FileUpload from "../components/FileUpload";
import NotificationBell from "../components/NotificationBell";
import MessagesPanel from "../components/MessagesPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

type Course = { id: number; title: string; description: string | null; teacher_id: number };
type Module = { id: number; course_id: number; title: string; order_index: number };
type Lesson = { id: number; module_id: number; title: string; content: string | null; order_index: number };
type Resource = { id: number; lesson_id: number; title: string; resource_type: string; url: string | null; topic: string | null; difficulty: string | null; format: string | null };
type Quiz = { id: number; lesson_id: number; title: string; is_published: boolean };
type Assignment = { id: number; lesson_id: number; title: string; description: string | null; due_date: string | null; max_score: number; peer_review_enabled: boolean; num_reviewers: number };
type AiQuestion = { question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: string };
type Question = { id: number; quiz_id: number; question_text: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: string; topic: string | null; difficulty: string | null };
type Enrollment = { student: { id: number; full_name: string; email: string }; status: string };
type PrereqItem = { id: number; prerequisite_course_id: number; prerequisite_title: string };
type Analytics = {
  course: { id: number; title: string; teacher_id: number };
  enrollments_active: number;
  lessons_total: number;
  progress: { avg_progress_pct: number | null; completed_progress_rows: number };
  quizzes: { published: number; attempts_total: number; avg_score_pct: number | null };
  events: { total: number; by_type: Record<string, number> };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
      {action}
    </div>
  );
}

function InlineForm({ fields, onSubmit, onCancel, submitLabel, loading, error }: {
  fields: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; rows?: number }[];
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  loading: boolean;
  error: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}
      {fields.map((f, i) =>
        f.rows ? (
          <div key={i}>
            <label className="text-xs font-medium text-slate-600">{f.label}</label>
            <textarea
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              rows={f.rows}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 resize-none"
            />
          </div>
        ) : (
          <div key={i}>
            <label className="text-xs font-medium text-slate-600">{f.label}</label>
            <input
              type={f.type ?? "text"}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            />
          </div>
        )
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSubmit}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type Tab = "content" | "students" | "announcements" | "analytics";
type Announcement = { id: number; course_id: number; teacher_id: number; title: string; body: string | null; created_at: string };
type Comment = { id: number; lesson_id: number; author_id: number; author_name: string; author_role: string; body: string; created_at: string };
type AtRiskStudent = { student_id: number; full_name: string; email: string; risk_score: number; risk_label: string; avg_progress: number; avg_quiz_score: number };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TeacherCourseDetail() {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const id = Number(courseId);

  const [tab, setTab] = useState<Tab>("content");
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<number, Lesson[]>>({});
  const [resourcesByLesson, setResourcesByLesson] = useState<Record<number, Resource[]>>({});
  const [quizzesByLesson, setQuizzesByLesson] = useState<Record<number, Quiz[]>>({});
  const [questionsByQuiz, setQuestionsByQuiz] = useState<Record<number, Question[]>>({});
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Expanded state for nested content
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [expandedLessons, setExpandedLessons] = useState<Set<number>>(new Set());
  const [expandedQuizzes, setExpandedQuizzes] = useState<Set<number>>(new Set());

  // Add module form
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [savingModule, setSavingModule] = useState(false);
  const [moduleError, setModuleError] = useState("");

  // Add lesson form (per module)
  const [addLessonForModule, setAddLessonForModule] = useState<number | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonContent, setNewLessonContent] = useState("");
  const [savingLesson, setSavingLesson] = useState(false);
  const [lessonError, setLessonError] = useState("");

  // Add resource form (per lesson)
  const [addResourceForLesson, setAddResourceForLesson] = useState<number | null>(null);
  const [newResTitle, setNewResTitle] = useState("");
  const [newResType, setNewResType] = useState("link");
  const [newResUrl, setNewResUrl] = useState("");
  const [newResTopic, setNewResTopic] = useState("");
  const [newResDifficulty, setNewResDifficulty] = useState("");
  const [savingResource, setSavingResource] = useState(false);
  const [resourceError, setResourceError] = useState("");

  // Add quiz form (per lesson)
  const [addQuizForLesson, setAddQuizForLesson] = useState<number | null>(null);
  const [newQuizTitle, setNewQuizTitle] = useState("");
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");

  // Add question form (per quiz)
  const [addQuestionForQuiz, setAddQuestionForQuiz] = useState<number | null>(null);
  const [newQText, setNewQText] = useState("");
  const [newQA, setNewQA] = useState("");
  const [newQB, setNewQB] = useState("");
  const [newQC, setNewQC] = useState("");
  const [newQD, setNewQD] = useState("");
  const [newQCorrect, setNewQCorrect] = useState("A");
  const [newQTopic, setNewQTopic] = useState("");
  const [newQDiff, setNewQDiff] = useState("");
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionError, setQuestionError] = useState("");

  // AI question generation
  const [aiGenerating, setAiGenerating] = useState<Record<number, boolean>>({});
  const [aiPreview, setAiPreview] = useState<{ quizId: number; lessonId: number; questions: AiQuestion[] } | null>(null);
  const [aiError, setAiError] = useState<Record<number, string>>({});
  const [aiApproving, setAiApproving] = useState<Record<number, boolean>>({});

  // Peer review per-assignment
  const [newAssignPeerReview, setNewAssignPeerReview] = useState(false);
  const [newAssignNumReviewers, setNewAssignNumReviewers] = useState("2");
  const [assigningPeerReview, setAssigningPeerReview] = useState<number | null>(null);
  const [peerAssignMsg, setPeerAssignMsg] = useState<Record<number, string>>({});

  // Remove student confirm
  const [removingStudent, setRemovingStudent] = useState<number | null>(null);

  // Enroll student by email
  const [enrollEmail, setEnrollEmail] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Bulk enroll
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ enrolled: string[]; already_enrolled: string[]; not_found: string[]; errors: string[] } | null>(null);

  // Analytics export
  const [exportingCsv, setExportingCsv] = useState(false);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnTitle, setNewAnnTitle] = useState("");
  const [newAnnBody, setNewAnnBody] = useState("");
  const [savingAnn, setSavingAnn] = useState(false);
  const [annError, setAnnError] = useState("");
  const [showAddAnn, setShowAddAnn] = useState(false);

  // Assignments (per lesson)
  const [assignmentsByLesson, setAssignmentsByLesson] = useState<Record<number, Assignment[]>>({});
  const [addAssignmentForLesson, setAddAssignmentForLesson] = useState<number | null>(null);
  const [newAssignTitle, setNewAssignTitle] = useState("");
  const [newAssignDesc, setNewAssignDesc] = useState("");
  const [newAssignDue, setNewAssignDue] = useState("");
  const [newAssignMax, setNewAssignMax] = useState("100");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");

  // Discussion (per lesson)
  const [commentsByLesson, setCommentsByLesson] = useState<Record<number, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [postingComment, setPostingComment] = useState<number | null>(null);
  const [loadedDiscussion, setLoadedDiscussion] = useState<Set<number>>(new Set());

  // At-risk panel
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [loadingAtRisk, setLoadingAtRisk] = useState(false);
  const [atRiskLoaded, setAtRiskLoaded] = useState(false);

  // Inline edit state
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [editModuleTitle, setEditModuleTitle] = useState("");
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [editLessonTitle, setEditLessonTitle] = useState("");
  const [editLessonContent, setEditLessonContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Prerequisites
  const [prereqs, setPrereqs] = useState<PrereqItem[]>([]);
  const [selectedPrereqId, setSelectedPrereqId] = useState("");
  const [addingPrereq, setAddingPrereq] = useState(false);
  const [prereqMsg, setPrereqMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Messages
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgPartnerId, setMsgPartnerId] = useState<number | undefined>(undefined);
  const [msgUnread, setMsgUnread] = useState(0);

  // ── Load core data ──────────────────────────────────────────────────────────

  const loadCourse = useCallback(async () => {
    const all = await api.get<Course[]>("/api/v1/courses");
    setAllCourses(all.data);
    const found = all.data.find((c) => c.id === id);
    if (found) setCourse(found);
  }, [id]);

  const loadModules = useCallback(async () => {
    const res = await api.get<Module[]>(`/api/v1/courses/${id}/modules`);
    setModules(res.data);
    return res.data;
  }, [id]);

  const loadLessonsForModule = useCallback(async (moduleId: number) => {
    const res = await api.get<Lesson[]>(`/api/v1/modules/${moduleId}/lessons`);
    setLessonsByModule((prev) => ({ ...prev, [moduleId]: res.data }));
    return res.data;
  }, []);

  const loadResourcesForLesson = useCallback(async (lessonId: number) => {
    const res = await api.get<Resource[]>(`/api/v1/lessons/${lessonId}/resources`);
    setResourcesByLesson((prev) => ({ ...prev, [lessonId]: res.data }));
  }, []);

  const loadQuizzesForLesson = useCallback(async (lessonId: number) => {
    const res = await api.get<Quiz[]>(`/api/v1/lessons/${lessonId}/quizzes`);
    setQuizzesByLesson((prev) => ({ ...prev, [lessonId]: res.data }));
    return res.data;
  }, []);

  const loadQuestionsForQuiz = useCallback(async (quizId: number) => {
    const res = await api.get<Question[]>(`/api/v1/quizzes/${quizId}/questions`);
    setQuestionsByQuiz((prev) => ({ ...prev, [quizId]: res.data }));
  }, []);

  const loadAssignmentsForLesson = useCallback(async (lessonId: number) => {
    const res = await api.get<Assignment[]>(`/api/v1/lessons/${lessonId}/assignments`);
    setAssignmentsByLesson((prev) => ({ ...prev, [lessonId]: res.data }));
  }, []);

  const loadAnnouncements = useCallback(async () => {
    const res = await api.get<Announcement[]>(`/api/v1/courses/${id}/announcements`);
    setAnnouncements(res.data || []);
  }, [id]);

  const loadPrerequisites = useCallback(async () => {
    const res = await api.get<PrereqItem[]>(`/api/v1/courses/${id}/prerequisites`);
    setPrereqs(res.data || []);
  }, [id]);

  const loadEnrollments = useCallback(async () => {
    const res = await api.get<Enrollment[]>(`/api/v1/teacher/courses/${id}/enrollments`);
    setEnrollments(res.data);
  }, [id]);

  const loadAnalytics = useCallback(async () => {
    const res = await api.get<Analytics>(`/api/v1/courses/${id}/analytics`);
    setAnalytics(res.data);
  }, [id]);

  async function initialLoad() {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadCourse(), loadModules(), loadEnrollments(), loadAnalytics(), loadAnnouncements(), loadPrerequisites()]);
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || "Failed to load course");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getAccessToken()) { window.location.href = "/"; return; }
    initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll message unread count every 30s
  useEffect(() => {
    function fetchMsgUnread() {
      api.get<{ count: number }>("/api/v1/me/messages/unread-count")
        .then((r) => setMsgUnread(r.data.count))
        .catch(() => {});
    }
    fetchMsgUnread();
    const tid = setInterval(fetchMsgUnread, 30000);
    return () => clearInterval(tid);
  }, []);

  // ── Toggle expand (lazy-loads children) ────────────────────────────────────

  async function toggleModule(moduleId: number) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) { next.delete(moduleId); return next; }
      next.add(moduleId);
      return next;
    });
    if (!lessonsByModule[moduleId]) {
      await loadLessonsForModule(moduleId);
    }
  }

  async function toggleLesson(lessonId: number) {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) { next.delete(lessonId); return next; }
      next.add(lessonId);
      return next;
    });
    if (!resourcesByLesson[lessonId]) loadResourcesForLesson(lessonId);
    if (!quizzesByLesson[lessonId]) loadQuizzesForLesson(lessonId);
    if (!assignmentsByLesson[lessonId]) loadAssignmentsForLesson(lessonId);
  }

  async function toggleQuiz(quizId: number) {
    setExpandedQuizzes((prev) => {
      const next = new Set(prev);
      if (next.has(quizId)) { next.delete(quizId); return next; }
      next.add(quizId);
      return next;
    });
    if (!questionsByQuiz[quizId]) loadQuestionsForQuiz(quizId);
  }

  // ── CRUD actions ───────────────────────────────────────────────────────────

  async function addPrereq() {
    if (!selectedPrereqId) return;
    setAddingPrereq(true); setPrereqMsg(null);
    try {
      await api.post(`/api/v1/courses/${id}/prerequisites`, { prerequisite_course_id: Number(selectedPrereqId) });
      setSelectedPrereqId("");
      await loadPrerequisites();
      setPrereqMsg({ ok: true, text: "Prerequisite added." });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setPrereqMsg({ ok: false, text: e?.response?.data?.detail || "Failed to add prerequisite" });
    } finally {
      setAddingPrereq(false);
    }
  }

  async function removePrereq(prereqCourseId: number) {
    try {
      await api.delete(`/api/v1/courses/${id}/prerequisites/${prereqCourseId}`);
      await loadPrerequisites();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setPrereqMsg({ ok: false, text: e?.response?.data?.detail || "Failed to remove prerequisite" });
    }
  }

  async function addModule() {
    if (!newModuleTitle.trim()) return;
    setSavingModule(true); setModuleError("");
    try {
      await api.post(`/api/v1/courses/${id}/modules`, { title: newModuleTitle.trim(), order_index: modules.length + 1 });
      setNewModuleTitle(""); setShowAddModule(false);
      await loadModules();
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setModuleError(e?.response?.data?.detail || "Failed to add module");
    } finally { setSavingModule(false); }
  }

  async function addLesson(moduleId: number) {
    if (!newLessonTitle.trim()) return;
    setSavingLesson(true); setLessonError("");
    try {
      const lessons = lessonsByModule[moduleId] ?? [];
      await api.post(`/api/v1/modules/${moduleId}/lessons`, {
        title: newLessonTitle.trim(),
        content: newLessonContent.trim() || null,
        order_index: lessons.length + 1,
      });
      setNewLessonTitle(""); setNewLessonContent(""); setAddLessonForModule(null);
      await loadLessonsForModule(moduleId);
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setLessonError(e?.response?.data?.detail || "Failed to add lesson");
    } finally { setSavingLesson(false); }
  }

  async function addResource(lessonId: number) {
    if (!newResTitle.trim()) return;
    setSavingResource(true); setResourceError("");
    try {
      await api.post(`/api/v1/lessons/${lessonId}/resources`, {
        title: newResTitle.trim(),
        resource_type: newResType,
        url: newResUrl.trim() || null,
        topic: newResTopic.trim() || null,
        difficulty: newResDifficulty || null,
        format: newResType,
      });
      setNewResTitle(""); setNewResUrl(""); setNewResTopic(""); setNewResDifficulty(""); setAddResourceForLesson(null);
      await loadResourcesForLesson(lessonId);
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setResourceError(e?.response?.data?.detail || "Failed to add resource");
    } finally { setSavingResource(false); }
  }

  async function addQuiz(lessonId: number) {
    if (!newQuizTitle.trim()) return;
    setSavingQuiz(true); setQuizError("");
    try {
      await api.post("/api/v1/quizzes", { lesson_id: lessonId, title: newQuizTitle.trim() });
      setNewQuizTitle(""); setAddQuizForLesson(null);
      await loadQuizzesForLesson(lessonId);
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setQuizError(e?.response?.data?.detail || "Failed to add quiz");
    } finally { setSavingQuiz(false); }
  }

  async function addAssignment(lessonId: number) {
    if (!newAssignTitle.trim()) return;
    setSavingAssignment(true); setAssignmentError("");
    try {
      await api.post(`/api/v1/lessons/${lessonId}/assignments`, {
        lesson_id: lessonId,
        title: newAssignTitle.trim(),
        description: newAssignDesc.trim() || null,
        due_date: newAssignDue || null,
        max_score: parseInt(newAssignMax) || 100,
        peer_review_enabled: newAssignPeerReview,
        num_reviewers: parseInt(newAssignNumReviewers) || 2,
      });
      setNewAssignTitle(""); setNewAssignDesc(""); setNewAssignDue(""); setNewAssignMax("100");
      setNewAssignPeerReview(false); setNewAssignNumReviewers("2");
      setAddAssignmentForLesson(null);
      await loadAssignmentsForLesson(lessonId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAssignmentError(e?.response?.data?.detail || "Failed to add assignment");
    } finally { setSavingAssignment(false); }
  }

  async function addQuestion(quizId: number) {
    if (!newQText.trim() || !newQA.trim() || !newQB.trim() || !newQC.trim() || !newQD.trim()) return;
    setSavingQuestion(true); setQuestionError("");
    try {
      await api.post(`/api/v1/quizzes/${quizId}/questions`, {
        question_text: newQText.trim(),
        option_a: newQA.trim(),
        option_b: newQB.trim(),
        option_c: newQC.trim(),
        option_d: newQD.trim(),
        correct_option: newQCorrect,
        topic: newQTopic.trim() || null,
        difficulty: newQDiff || null,
      });
      setNewQText(""); setNewQA(""); setNewQB(""); setNewQC(""); setNewQD(""); setNewQTopic(""); setNewQDiff(""); setNewQCorrect("A");
      setAddQuestionForQuiz(null);
      await loadQuestionsForQuiz(quizId);
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setQuestionError(e?.response?.data?.detail || "Failed to add question");
    } finally { setSavingQuestion(false); }
  }

  async function doGenerateAI(quizId: number, lessonId: number) {
    setAiGenerating((prev) => ({ ...prev, [quizId]: true }));
    setAiError((prev) => ({ ...prev, [quizId]: "" }));
    try {
      const res = await api.post<{ questions: AiQuestion[] }>(`/api/v1/lessons/${lessonId}/ai-generate-questions?count=5`);
      setAiPreview({ quizId, lessonId, questions: res.data.questions });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const status = e?.response?.status;
      const msg = status === 503 ? "AI not configured (set ANTHROPIC_API_KEY)" :
                  status === 400 ? "Lesson content too short (need 100+ chars)" :
                  e?.response?.data?.detail || "AI generation failed — try again";
      setAiError((prev) => ({ ...prev, [quizId]: msg }));
    } finally {
      setAiGenerating((prev) => ({ ...prev, [quizId]: false }));
    }
  }

  async function approveAiQuestion(quizId: number, q: AiQuestion, idx: number) {
    setAiApproving((prev) => ({ ...prev, [idx]: true }));
    try {
      await api.post(`/api/v1/quizzes/${quizId}/questions`, {
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
      });
      await loadQuestionsForQuiz(quizId);
      setAiPreview((prev) => {
        if (!prev) return null;
        const updated = prev.questions.filter((_, i) => i !== idx);
        return updated.length === 0 ? null : { ...prev, questions: updated };
      });
    } catch {
      // silently ignore — user can retry
    } finally {
      setAiApproving((prev) => ({ ...prev, [idx]: false }));
    }
  }

  async function approveAllAiQuestions(quizId: number) {
    if (!aiPreview) return;
    for (let i = 0; i < aiPreview.questions.length; i++) {
      await approveAiQuestion(quizId, aiPreview.questions[i], i);
    }
    setAiPreview(null);
  }

  async function doPeerReviewAssign(assignmentId: number) {
    setAssigningPeerReview(assignmentId);
    try {
      const res = await api.post<{ assigned: number }>(`/api/v1/assignments/${assignmentId}/peer-review/assign`);
      setPeerAssignMsg((prev) => ({ ...prev, [assignmentId]: `${res.data.assigned} peer reviews assigned!` }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setPeerAssignMsg((prev) => ({ ...prev, [assignmentId]: e?.response?.data?.detail || "Failed to assign" }));
    } finally {
      setAssigningPeerReview(null);
    }
  }

  async function togglePublish(quiz: Quiz) {
    try {
      await api.patch(`/api/v1/quizzes/${quiz.id}/publish`, { is_published: !quiz.is_published });
      // Find which lesson owns this quiz and refresh
      for (const [lid, quizList] of Object.entries(quizzesByLesson)) {
        if (quizList.some((q) => q.id === quiz.id)) {
          await loadQuizzesForLesson(Number(lid));
          break;
        }
      }
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || "Failed to update quiz");
    }
  }

  async function removeStudent(studentId: number) {
    setRemovingStudent(studentId);
    try {
      await api.delete(`/api/v1/teacher/courses/${id}/students/${studentId}`);
      await loadEnrollments();
        } catch (err: unknown) {
          const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || "Failed to remove student");
    } finally { setRemovingStudent(null); }
  }

  async function addAnnouncement() {
    if (!newAnnTitle.trim()) return;
    setSavingAnn(true); setAnnError("");
    try {
      await api.post(`/api/v1/courses/${id}/announcements`, {
        title: newAnnTitle.trim(),
        body: newAnnBody.trim() || null,
      });
      setNewAnnTitle(""); setNewAnnBody(""); setShowAddAnn(false);
      await loadAnnouncements();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setAnnError(e?.response?.data?.detail || "Failed to post announcement");
    } finally { setSavingAnn(false); }
  }

  async function deleteAnnouncement(annId: number) {
    try {
      await api.delete(`/api/v1/announcements/${annId}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== annId));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || "Failed to delete announcement");
    }
  }

  // ── Edit / Delete actions ──────────────────────────────────────────────────

  function errMsg(err: unknown) {
    const e = err as { response?: { data?: { detail?: string } }; message?: string };
    return e?.response?.data?.detail || e?.message || "Operation failed";
  }

  async function doUpdateModule(mod: Module) {
    if (!editModuleTitle.trim()) return;
    setSavingEdit(true);
    try {
      const res = await api.patch<Module>(`/api/v1/modules/${mod.id}`, { title: editModuleTitle.trim(), order_index: mod.order_index });
      setModules((prev) => prev.map((m) => m.id === mod.id ? res.data : m));
      setEditingModuleId(null);
    } catch (err) { alert(errMsg(err)); } finally { setSavingEdit(false); }
  }

  async function doDeleteModule(moduleId: number) {
    if (!confirm("Delete this module and all its lessons? This cannot be undone.")) return;
    try {
      await api.delete(`/api/v1/modules/${moduleId}`);
      setModules((prev) => prev.filter((m) => m.id !== moduleId));
      setLessonsByModule((prev) => { const n = { ...prev }; delete n[moduleId]; return n; });
    } catch (err) { alert(errMsg(err)); }
  }

  async function doUpdateLesson(lesson: Lesson) {
    if (!editLessonTitle.trim()) return;
    setSavingEdit(true);
    try {
      const res = await api.patch<Lesson>(`/api/v1/lessons/${lesson.id}`, {
        title: editLessonTitle.trim(),
        content: editLessonContent || null,
        order_index: lesson.order_index,
      });
      setLessonsByModule((prev) => ({
        ...prev,
        [lesson.module_id]: (prev[lesson.module_id] ?? []).map((l) => l.id === lesson.id ? res.data : l),
      }));
      setEditingLessonId(null);
    } catch (err) { alert(errMsg(err)); } finally { setSavingEdit(false); }
  }

  async function doDeleteLesson(lesson: Lesson) {
    if (!confirm("Delete this lesson and all its content? This cannot be undone.")) return;
    try {
      await api.delete(`/api/v1/lessons/${lesson.id}`);
      setLessonsByModule((prev) => ({
        ...prev,
        [lesson.module_id]: (prev[lesson.module_id] ?? []).filter((l) => l.id !== lesson.id),
      }));
    } catch (err) { alert(errMsg(err)); }
  }

  async function doDeleteResource(resourceId: number, lessonId: number) {
    if (!confirm("Delete this resource?")) return;
    try {
      await api.delete(`/api/v1/resources/${resourceId}`);
      setResourcesByLesson((prev) => ({
        ...prev,
        [lessonId]: (prev[lessonId] ?? []).filter((r) => r.id !== resourceId),
      }));
    } catch (err) { alert(errMsg(err)); }
  }

  async function doDeleteQuiz(quizId: number, lessonId: number) {
    if (!confirm("Delete this quiz and all its questions? This cannot be undone.")) return;
    try {
      await api.delete(`/api/v1/quizzes/${quizId}`);
      setQuizzesByLesson((prev) => ({
        ...prev,
        [lessonId]: (prev[lessonId] ?? []).filter((q) => q.id !== quizId),
      }));
      setQuestionsByQuiz((prev) => { const n = { ...prev }; delete n[quizId]; return n; });
    } catch (err) { alert(errMsg(err)); }
  }

  async function doDeleteQuestion(questionId: number, quizId: number) {
    if (!confirm("Delete this question?")) return;
    try {
      await api.delete(`/api/v1/quiz-questions/${questionId}`);
      setQuestionsByQuiz((prev) => ({
        ...prev,
        [quizId]: (prev[quizId] ?? []).filter((q) => q.id !== questionId),
      }));
    } catch (err) { alert(errMsg(err)); }
  }

  // ── Discussion ─────────────────────────────────────────────────────────────

  async function loadComments(lessonId: number) {
    try {
      const res = await api.get<Comment[]>(`/api/v1/lessons/${lessonId}/comments`);
      setCommentsByLesson((prev) => ({ ...prev, [lessonId]: res.data }));
      setLoadedDiscussion((prev) => new Set([...prev, lessonId]));
    } catch { /* ignore */ }
  }

  async function postComment(lessonId: number) {
    const text = (commentText[lessonId] ?? "").trim();
    if (!text) return;
    setPostingComment(lessonId);
    try {
      await api.post(`/api/v1/lessons/${lessonId}/comments`, { body: text });
      setCommentText((prev) => ({ ...prev, [lessonId]: "" }));
      await loadComments(lessonId);
    } catch { /* ignore */ } finally {
      setPostingComment(null);
    }
  }

  async function deleteComment(lessonId: number, commentId: number) {
    await api.delete(`/api/v1/comments/${commentId}`).catch(() => {});
    setCommentsByLesson((prev) => ({
      ...prev,
      [lessonId]: (prev[lessonId] ?? []).filter((c) => c.id !== commentId),
    }));
  }

  // ── At-risk panel ──────────────────────────────────────────────────────────

  async function loadAtRisk() {
    setLoadingAtRisk(true);
    try {
      const res = await api.get<AtRiskStudent[]>(`/api/v1/teacher/courses/${id}/at-risk?threshold=0.4`);
      setAtRiskStudents(res.data);
      setAtRiskLoaded(true);
    } catch { /* ignore */ } finally {
      setLoadingAtRisk(false);
    }
  }

  async function enrollStudent() {
    if (!enrollEmail.trim()) return;
    setEnrolling(true);
    setEnrollMsg(null);
    try {
      const r = await api.post<{ status: string; full_name: string }>(
        `/api/v1/teacher/courses/${id}/enroll`,
        { email: enrollEmail.trim() },
      );
      const label = r.data.status === "already_enrolled" ? "already enrolled" : "enrolled successfully";
      setEnrollMsg({ ok: true, text: `${r.data.full_name} ${label}.` });
      setEnrollEmail("");
      await loadEnrollments();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setEnrollMsg({ ok: false, text: e?.response?.data?.detail || e?.message || "Failed to enroll" });
    } finally {
      setEnrolling(false);
    }
  }

  async function bulkEnroll(file: File) {
    setBulkEnrolling(true);
    setBulkResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ enrolled: string[]; already_enrolled: string[]; not_found: string[]; errors: string[] }>(
        `/api/v1/teacher/courses/${id}/enroll-bulk`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setBulkResult(res.data);
      await loadEnrollments();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || e?.message || "Bulk enroll failed");
    } finally {
      setBulkEnrolling(false);
    }
  }

  async function exportAnalyticsCsv() {
    setExportingCsv(true);
    try {
      const res = await api.get(`/api/v1/courses/${id}/analytics/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics_course_${id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading course…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/teacher" className="text-sm text-slate-500 hover:text-slate-900">← Dashboard</Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-semibold text-slate-900 truncate">
            {course?.title ?? `Course #${id}`}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Messages */}
            <button
              onClick={() => { setMsgPartnerId(undefined); setMsgOpen(true); }}
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
            <button
              onClick={() => navigate("/profile")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Profile
            </button>
            <button
              onClick={() => { clearAccessToken(); window.location.href = "/"; }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        {course?.description && (
          <p className="mt-2 text-sm text-slate-500">{course.description}</p>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Tabs */}
        <div className="mt-6 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 w-fit">
          {(["content", "students", "announcements", "analytics"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
                tab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── CONTENT TAB ─────────────────────────────────────────────────── */}
        {tab === "content" && (
          <div className="mt-6 space-y-3">
            <SectionHeader
              title="Modules & Lessons"
              action={
                <button
                  onClick={() => setShowAddModule(true)}
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  + Module
                </button>
              }
            />

            {modules.length === 0 && !showAddModule && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No modules yet. Add a module to start building course content.
              </div>
            )}

            {showAddModule && (
              <InlineForm
                fields={[{ label: "Module title *", value: newModuleTitle, onChange: setNewModuleTitle, placeholder: "e.g. Week 1: Introduction" }]}
                onSubmit={addModule}
                onCancel={() => { setShowAddModule(false); setNewModuleTitle(""); setModuleError(""); }}
                submitLabel="Add Module"
                loading={savingModule}
                error={moduleError}
              />
            )}

            {modules.map((mod) => (
              <div key={mod.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* Module header */}
                <div className="flex items-center gap-2 px-5 py-3 hover:bg-slate-50 transition">
                  <button onClick={() => toggleModule(mod.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                    <span className="text-slate-400 text-xs">{expandedModules.has(mod.id) ? "▾" : "▸"}</span>
                    <span className="font-semibold text-slate-900 truncate">{mod.title}</span>
                    <span className="text-xs text-slate-400 shrink-0">{lessonsByModule[mod.id]?.length ?? "?"} lessons</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400">Module {mod.order_index}</span>
                    <button
                      onClick={() => { setEditingModuleId(mod.id); setEditModuleTitle(mod.title); }}
                      className="text-xs text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100"
                      title="Rename module"
                    >Edit</button>
                    <button
                      onClick={() => doDeleteModule(mod.id)}
                      className="text-xs text-rose-400 hover:text-rose-600 px-1.5 py-0.5 rounded hover:bg-rose-50"
                      title="Delete module"
                    >Del</button>
                  </div>
                </div>
                {editingModuleId === mod.id && (
                  <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex gap-2 items-center">
                    <input
                      value={editModuleTitle}
                      onChange={(e) => setEditModuleTitle(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                      placeholder="Module title"
                    />
                    <button onClick={() => doUpdateModule(mod)} disabled={savingEdit} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                      {savingEdit ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingModuleId(null)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
                  </div>
                )}

                {expandedModules.has(mod.id) && (
                  <div className="border-t border-slate-100 px-5 pb-4">
                    <div className="mt-3 space-y-2">
                      {(lessonsByModule[mod.id] ?? []).map((lesson) => (
                        <div key={lesson.id} className="rounded-xl border border-slate-200 overflow-hidden">
                          {/* Lesson header */}
                          <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition">
                            <button onClick={() => toggleLesson(lesson.id)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                              <span className="text-slate-400 text-xs">{expandedLessons.has(lesson.id) ? "▾" : "▸"}</span>
                              <span className="text-sm font-medium text-slate-800 truncate">{lesson.title}</span>
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-slate-400">#{lesson.order_index}</span>
                              <button
                                onClick={() => { setEditingLessonId(lesson.id); setEditLessonTitle(lesson.title); setEditLessonContent(lesson.content || ""); }}
                                className="text-xs text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100"
                              >Edit</button>
                              <button
                                onClick={() => doDeleteLesson(lesson)}
                                className="text-xs text-rose-400 hover:text-rose-600 px-1.5 py-0.5 rounded hover:bg-rose-50"
                              >Del</button>
                            </div>
                          </div>
                          {editingLessonId === lesson.id && (
                            <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
                              <input
                                value={editLessonTitle}
                                onChange={(e) => setEditLessonTitle(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400"
                                placeholder="Lesson title"
                              />
                              <RichEditor value={editLessonContent} onChange={setEditLessonContent} />
                              <div className="flex gap-2">
                                <button onClick={() => doUpdateLesson(lesson)} disabled={savingEdit} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                                  {savingEdit ? "Saving…" : "Save"}
                                </button>
                                <button onClick={() => setEditingLessonId(null)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
                              </div>
                            </div>
                          )}

                          {expandedLessons.has(lesson.id) && (
                            <div className="border-t border-slate-100 bg-slate-50 px-4 pb-4">
                              {lesson.content && (
                                <div className="mt-3">
                                  <RichEditor value={lesson.content || ""} readOnly />
                                </div>
                              )}

                              {/* Resources */}
                              <div className="mt-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Resources</span>
                                  <button
                                    onClick={() => { setAddResourceForLesson(lesson.id); setAddQuizForLesson(null); }}
                                    className="text-xs text-slate-600 hover:text-slate-900 underline"
                                  >
                                    + Add
                                  </button>
                                </div>
                                {(resourcesByLesson[lesson.id] ?? []).length === 0 ? (
                                  <div className="text-xs text-slate-400">No resources yet.</div>
                                ) : (
                                  <div className="space-y-1">
                                    {(resourcesByLesson[lesson.id] ?? []).map((r) => (
                                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                                        <div className="min-w-0">
                                          <span className="text-xs font-medium text-slate-800 truncate">{r.title}</span>
                                          <div className="flex gap-2 mt-0.5 flex-wrap">
                                            <span className="text-xs text-slate-400">{r.resource_type}</span>
                                            {r.topic && <span className="text-xs text-slate-400">· {r.topic}</span>}
                                            {r.difficulty && <span className="text-xs text-slate-400">· {r.difficulty}</span>}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                          {r.url && (
                                            <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-900 underline">
                                              Open
                                            </a>
                                          )}
                                          <button
                                            onClick={() => doDeleteResource(r.id, lesson.id)}
                                            className="text-xs text-rose-400 hover:text-rose-600 px-1 py-0.5 rounded hover:bg-rose-50"
                                            title="Delete resource"
                                          >✕</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {addResourceForLesson === lesson.id && (
                                  <div className="mt-2">
                                    <InlineForm
                                      fields={[
                                        { label: "Title *", value: newResTitle, onChange: setNewResTitle, placeholder: "Resource title" },
                                        { label: "URL", value: newResUrl, onChange: setNewResUrl, placeholder: "https://…" },
                                        { label: "Topic", value: newResTopic, onChange: setNewResTopic, placeholder: "e.g. Algebra" },
                                      ]}
                                      onSubmit={() => addResource(lesson.id)}
                                      onCancel={() => { setAddResourceForLesson(null); setResourceError(""); }}
                                      submitLabel="Add Resource"
                                      loading={savingResource}
                                      error={resourceError}
                                    />
                                    <div className="mt-2">
                                      <FileUpload
                                        onUpload={(url) => setNewResUrl(url)}
                                        accept=".pdf,.png,.jpg,.jpeg,.mp4,.docx,.zip"
                                        label="Or upload file"
                                      />
                                    </div>
                                    <div className="mt-1 flex gap-2">
                                      <div className="flex-1">
                                        <label className="text-xs font-medium text-slate-600">Type</label>
                                        <select
                                          value={newResType}
                                          onChange={(e) => setNewResType(e.target.value)}
                                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                        >
                                          {["link", "video", "pdf", "text", "interactive"].map((t) => (
                                            <option key={t}>{t}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex-1">
                                        <label className="text-xs font-medium text-slate-600">Difficulty</label>
                                        <select
                                          value={newResDifficulty}
                                          onChange={(e) => setNewResDifficulty(e.target.value)}
                                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                                        >
                                          <option value="">— none —</option>
                                          {["beginner", "intermediate", "advanced"].map((d) => (
                                            <option key={d}>{d}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Quizzes */}
                              <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quizzes</span>
                                  <button
                                    onClick={() => { setAddQuizForLesson(lesson.id); setAddResourceForLesson(null); }}
                                    className="text-xs text-slate-600 hover:text-slate-900 underline"
                                  >
                                    + Add Quiz
                                  </button>
                                </div>

                                {(quizzesByLesson[lesson.id] ?? []).length === 0 ? (
                                  <div className="text-xs text-slate-400">No quizzes yet.</div>
                                ) : (
                                  <div className="space-y-1">
                                    {(quizzesByLesson[lesson.id] ?? []).map((quiz) => (
                                      <div key={quiz.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                        <div className="flex items-center justify-between gap-2 px-3 py-2">
                                          <button
                                            onClick={() => toggleQuiz(quiz.id)}
                                            className="flex items-center gap-2 text-left flex-1 min-w-0"
                                          >
                                            <span className="text-slate-400 text-xs">{expandedQuizzes.has(quiz.id) ? "▾" : "▸"}</span>
                                            <span className="text-xs font-medium text-slate-800 truncate">{quiz.title}</span>
                                          </button>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quiz.is_published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                              {quiz.is_published ? "Published" : "Draft"}
                                            </span>
                                            <button
                                              onClick={() => togglePublish(quiz)}
                                              className="text-xs text-slate-500 hover:text-slate-900 underline"
                                            >
                                              {quiz.is_published ? "Unpublish" : "Publish"}
                                            </button>
                                            <button
                                              onClick={() => doDeleteQuiz(quiz.id, lesson.id)}
                                              className="text-xs text-rose-400 hover:text-rose-600 px-1 py-0.5 rounded hover:bg-rose-50"
                                              title="Delete quiz"
                                            >✕</button>
                                          </div>
                                        </div>

                                        {expandedQuizzes.has(quiz.id) && (
                                          <div className="border-t border-slate-100 bg-slate-50 px-3 pb-3">
                                            <div className="flex items-center justify-between mt-2 mb-1">
                                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Questions ({(questionsByQuiz[quiz.id] ?? []).length})</span>
                                              <div className="flex items-center gap-2">
                                                <button
                                                  onClick={() => doGenerateAI(quiz.id, lesson.id)}
                                                  disabled={aiGenerating[quiz.id]}
                                                  className="text-xs text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50"
                                                >
                                                  {aiGenerating[quiz.id] ? "Generating…" : "✨ Generate with AI"}
                                                </button>
                                                <button
                                                  onClick={() => setAddQuestionForQuiz(quiz.id)}
                                                  className="text-xs text-slate-600 hover:text-slate-900 underline"
                                                >
                                                  + Add Question
                                                </button>
                                              </div>
                                            </div>
                                            {aiError[quiz.id] && (
                                              <div className="mb-2 text-xs text-rose-600">{aiError[quiz.id]}</div>
                                            )}
                                            {aiPreview && aiPreview.quizId === quiz.id && (
                                              <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs font-semibold text-violet-700">AI-generated questions ({aiPreview.questions.length})</span>
                                                  <div className="flex gap-2">
                                                    <button
                                                      onClick={() => approveAllAiQuestions(quiz.id)}
                                                      className="rounded-xl bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                                                    >
                                                      Add All
                                                    </button>
                                                    <button
                                                      onClick={() => setAiPreview(null)}
                                                      className="rounded-xl border border-violet-200 px-3 py-1 text-xs text-violet-600 hover:bg-violet-100"
                                                    >
                                                      Dismiss
                                                    </button>
                                                  </div>
                                                </div>
                                                {aiPreview.questions.map((q, idx) => (
                                                  <div key={idx} className="rounded-xl border border-violet-100 bg-white p-2.5 space-y-1.5">
                                                    <div className="text-xs font-medium text-slate-800">{q.question_text}</div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                      {(["a","b","c","d"] as const).map((opt) => (
                                                        <div key={opt} className={`text-xs rounded-lg px-2 py-1 ${q.correct_option.toLowerCase() === opt ? "bg-emerald-50 text-emerald-700 font-semibold" : "bg-slate-50 text-slate-600"}`}>
                                                          {opt.toUpperCase()}. {q[`option_${opt}` as keyof AiQuestion]}
                                                        </div>
                                                      ))}
                                                    </div>
                                                    <div className="flex gap-2">
                                                      <button
                                                        onClick={() => approveAiQuestion(quiz.id, q, idx)}
                                                        disabled={aiApproving[idx]}
                                                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                                      >
                                                        {aiApproving[idx] ? "Adding…" : "✓ Add"}
                                                      </button>
                                                      <button
                                                        onClick={() => setAiPreview((prev) => prev ? { ...prev, questions: prev.questions.filter((_, i) => i !== idx) } : null)}
                                                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50"
                                                      >
                                                        ✗ Skip
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            {(questionsByQuiz[quiz.id] ?? []).map((q, idx) => (
                                              <div key={q.id} className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                <div className="flex items-start justify-between gap-2">
                                                  <div className="text-xs font-medium text-slate-800">Q{idx + 1}. {q.question_text}</div>
                                                  <button
                                                    onClick={() => doDeleteQuestion(q.id, quiz.id)}
                                                    className="shrink-0 text-xs text-rose-400 hover:text-rose-600 px-1 py-0.5 rounded hover:bg-rose-50"
                                                    title="Delete question"
                                                  >✕</button>
                                                </div>
                                                <div className="mt-1 grid grid-cols-2 gap-1">
                                                  {(["A", "B", "C", "D"] as const).map((opt) => (
                                                    <div
                                                      key={opt}
                                                      className={`text-xs rounded-lg px-2 py-1 ${q.correct_option === opt ? "bg-emerald-50 text-emerald-700 font-semibold" : "bg-slate-50 text-slate-600"}`}
                                                    >
                                                      {opt}. {q[`option_${opt.toLowerCase()}` as keyof Question] as string}
                                                    </div>
                                                  ))}
                                                </div>
                                                {(q.topic || q.difficulty) && (
                                                  <div className="mt-1 flex gap-2">
                                                    {q.topic && <span className="text-xs text-slate-400">{q.topic}</span>}
                                                    {q.difficulty && <span className="text-xs text-slate-400">· {q.difficulty}</span>}
                                                  </div>
                                                )}
                                              </div>
                                            ))}

                                            {addQuestionForQuiz === quiz.id && (
                                              <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                                                {questionError && (
                                                  <div className="text-xs text-rose-600">{questionError}</div>
                                                )}
                                                <textarea
                                                  value={newQText} onChange={(e) => setNewQText(e.target.value)}
                                                  placeholder="Question text *" rows={2}
                                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none"
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                  {[["A", newQA, setNewQA], ["B", newQB, setNewQB], ["C", newQC, setNewQC], ["D", newQD, setNewQD]].map(([label, val, setter]) => (
                                                    <input
                                                      key={label as string}
                                                      value={val as string}
                                                      onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                                                      placeholder={`Option ${label} *`}
                                                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                                                    />
                                                  ))}
                                                </div>
                                                <div className="flex gap-2 flex-wrap">
                                                  <div>
                                                    <label className="text-xs text-slate-500">Correct</label>
                                                    <select value={newQCorrect} onChange={(e) => setNewQCorrect(e.target.value)} className="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                                                      {["A","B","C","D"].map((o) => <option key={o}>{o}</option>)}
                                                    </select>
                                                  </div>
                                                  <input value={newQTopic} onChange={(e) => setNewQTopic(e.target.value)} placeholder="Topic" className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none w-28" />
                                                  <select value={newQDiff} onChange={(e) => setNewQDiff(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs outline-none">
                                                    <option value="">Difficulty</option>
                                                    {["beginner","intermediate","advanced"].map((d) => <option key={d}>{d}</option>)}
                                                  </select>
                                                </div>
                                                <div className="flex gap-2">
                                                  <button onClick={() => addQuestion(quiz.id)} disabled={savingQuestion || !newQText.trim()} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                                                    {savingQuestion ? "Saving…" : "Add Question"}
                                                  </button>
                                                  <button onClick={() => { setAddQuestionForQuiz(null); setQuestionError(""); }} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                                                    Cancel
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {addQuizForLesson === lesson.id && (
                                  <div className="mt-2">
                                    <InlineForm
                                      fields={[{ label: "Quiz title *", value: newQuizTitle, onChange: setNewQuizTitle, placeholder: "e.g. Chapter 1 Quiz" }]}
                                      onSubmit={() => addQuiz(lesson.id)}
                                      onCancel={() => { setAddQuizForLesson(null); setQuizError(""); }}
                                      submitLabel="Add Quiz"
                                      loading={savingQuiz}
                                      error={quizError}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Assignments */}
                              <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignments</span>
                                  <button
                                    onClick={() => { setAddAssignmentForLesson(lesson.id); setAddResourceForLesson(null); setAddQuizForLesson(null); }}
                                    className="text-xs text-slate-600 hover:text-slate-900 underline"
                                  >
                                    + Add Assignment
                                  </button>
                                </div>

                                {(assignmentsByLesson[lesson.id] ?? []).length === 0 ? (
                                  <div className="text-xs text-slate-400">No assignments yet.</div>
                                ) : (
                                  <div className="space-y-1">
                                    {(assignmentsByLesson[lesson.id] ?? []).map((a) => (
                                      <div key={a.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                        <div className="flex items-center justify-between">
                                          <div className="min-w-0">
                                            <span className="text-xs font-medium text-slate-800 truncate">{a.title}</span>
                                            <div className="flex gap-2 mt-0.5">
                                              <span className="text-xs text-slate-400">Max: {a.max_score} pts</span>
                                              {a.due_date && (
                                                <span className="text-xs text-slate-400">· Due: {new Date(a.due_date).toLocaleDateString()}</span>
                                              )}
                                              {a.peer_review_enabled && (
                                                <span className="text-xs text-violet-500 font-medium">· Peer review ({a.num_reviewers})</span>
                                              )}
                                            </div>
                                          </div>
                                          <Link
                                            to={`/teacher/assignments/${a.id}/grade`}
                                            className="shrink-0 text-xs text-slate-500 hover:text-slate-900 underline ml-2"
                                          >
                                            Grade →
                                          </Link>
                                        </div>
                                        {a.peer_review_enabled && (
                                          <div className="mt-1.5 flex items-center gap-2">
                                            <button
                                              onClick={() => doPeerReviewAssign(a.id)}
                                              disabled={assigningPeerReview === a.id}
                                              className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                                            >
                                              {assigningPeerReview === a.id ? "Assigning…" : "Assign Peer Reviews"}
                                            </button>
                                            {peerAssignMsg[a.id] && (
                                              <span className="text-xs text-violet-600">{peerAssignMsg[a.id]}</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {addAssignmentForLesson === lesson.id && (
                                  <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                                    {assignmentError && <div className="text-xs text-rose-600">{assignmentError}</div>}
                                    <input
                                      value={newAssignTitle}
                                      onChange={(e) => setNewAssignTitle(e.target.value)}
                                      placeholder="Assignment title *"
                                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400"
                                    />
                                    <textarea
                                      value={newAssignDesc}
                                      onChange={(e) => setNewAssignDesc(e.target.value)}
                                      placeholder="Description (optional)"
                                      rows={2}
                                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none"
                                    />
                                    <div className="flex gap-2">
                                      <div className="flex-1">
                                        <label className="text-xs text-slate-500">Due date</label>
                                        <input
                                          type="datetime-local"
                                          value={newAssignDue}
                                          onChange={(e) => setNewAssignDue(e.target.value)}
                                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none"
                                        />
                                      </div>
                                      <div className="flex-1">
                                        <label className="text-xs text-slate-500">Max score</label>
                                        <input
                                          type="number"
                                          value={newAssignMax}
                                          onChange={(e) => setNewAssignMax(e.target.value)}
                                          min={1}
                                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none"
                                        />
                                      </div>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={newAssignPeerReview}
                                        onChange={(e) => setNewAssignPeerReview(e.target.checked)}
                                        className="rounded"
                                      />
                                      Enable peer review
                                      {newAssignPeerReview && (
                                        <span className="flex items-center gap-1 ml-2">
                                          <span className="text-slate-400">Reviewers:</span>
                                          <input
                                            type="number"
                                            value={newAssignNumReviewers}
                                            onChange={(e) => setNewAssignNumReviewers(e.target.value)}
                                            min={1} max={5}
                                            className="w-12 rounded-lg border border-slate-200 px-2 py-0.5 text-xs outline-none"
                                          />
                                        </span>
                                      )}
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => addAssignment(lesson.id)}
                                        disabled={savingAssignment || !newAssignTitle.trim()}
                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        {savingAssignment ? "Saving…" : "Add Assignment"}
                                      </button>
                                      <button
                                        onClick={() => { setAddAssignmentForLesson(null); setAssignmentError(""); }}
                                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Discussion */}
                              <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discussion</span>
                                  {!loadedDiscussion.has(lesson.id) && (
                                    <button
                                      onClick={() => loadComments(lesson.id)}
                                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                                    >
                                      Load comments
                                    </button>
                                  )}
                                </div>
                                {loadedDiscussion.has(lesson.id) && (
                                  <div className="space-y-2">
                                    {(commentsByLesson[lesson.id] ?? []).length === 0 ? (
                                      <div className="text-xs text-slate-400">No comments yet.</div>
                                    ) : (
                                      (commentsByLesson[lesson.id] ?? []).map((c) => (
                                        <div key={c.id} className="flex items-start gap-2">
                                          <div className={`shrink-0 h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold text-white ${c.author_role === "teacher" ? "bg-violet-500" : "bg-sky-500"}`}>
                                            {c.author_name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-semibold text-slate-800">{c.author_name}</span>
                                              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${c.author_role === "teacher" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>{c.author_role}</span>
                                              <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(c.created_at)}</span>
                                            </div>
                                            <div className="mt-0.5 text-xs text-slate-700 leading-relaxed">{c.body}</div>
                                          </div>
                                          <button
                                            onClick={() => deleteComment(lesson.id, c.id)}
                                            className="shrink-0 mt-1 text-slate-300 hover:text-rose-400 text-xs"
                                            aria-label="Delete comment"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))
                                    )}
                                    <div className="flex gap-2 mt-2">
                                      <input
                                        value={commentText[lesson.id] ?? ""}
                                        onChange={(e) => setCommentText((prev) => ({ ...prev, [lesson.id]: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(lesson.id); } }}
                                        placeholder="Add a comment…"
                                        className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                                      />
                                      <button
                                        onClick={() => postComment(lesson.id)}
                                        disabled={postingComment === lesson.id || !(commentText[lesson.id] ?? "").trim()}
                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                      >
                                        Post
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add lesson form */}
                      {addLessonForModule === mod.id ? (
                        <InlineForm
                          fields={[
                            { label: "Lesson title *", value: newLessonTitle, onChange: setNewLessonTitle, placeholder: "e.g. Variables and Data Types" },
                            { label: "Content (optional)", value: newLessonContent, onChange: setNewLessonContent, placeholder: "Lesson body text…", rows: 3 },
                          ]}
                          onSubmit={() => addLesson(mod.id)}
                          onCancel={() => { setAddLessonForModule(null); setNewLessonTitle(""); setNewLessonContent(""); setLessonError(""); }}
                          submitLabel="Add Lesson"
                          loading={savingLesson}
                          error={lessonError}
                        />
                      ) : (
                        <button
                          onClick={() => { setAddLessonForModule(mod.id); setAddResourceForLesson(null); setAddQuizForLesson(null); }}
                          className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition"
                        >
                          + Add Lesson
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* ── Prerequisites ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader title="Course Prerequisites" />
              <p className="text-xs text-slate-500 mb-3">
                Students must complete these courses before they can enroll in this one.
              </p>

              {prereqs.length === 0 ? (
                <p className="text-xs text-slate-400 mb-3">No prerequisites set.</p>
              ) : (
                <div className="space-y-2 mb-3">
                  {prereqs.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-700">{p.prerequisite_title}</span>
                      <button
                        onClick={() => removePrereq(p.prerequisite_course_id)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                      >
                        × Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <select
                  value={selectedPrereqId}
                  onChange={(e) => setSelectedPrereqId(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                >
                  <option value="">— Select a course —</option>
                  {allCourses
                    .filter((c) => c.id !== id && !prereqs.some((p) => p.prerequisite_course_id === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                </select>
                <button
                  onClick={addPrereq}
                  disabled={!selectedPrereqId || addingPrereq}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {addingPrereq ? "Adding…" : "Add"}
                </button>
              </div>
              {prereqMsg && (
                <p className={`mt-2 text-xs font-medium ${prereqMsg.ok ? "text-emerald-700" : "text-rose-600"}`}>
                  {prereqMsg.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── STUDENTS TAB ────────────────────────────────────────────────── */}
        {tab === "students" && (
          <div className="mt-6">
            {/* Enroll by email */}
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900 mb-3">Enroll Student by Email</div>
              <div className="flex gap-2">
                <input
                  value={enrollEmail}
                  onChange={(e) => setEnrollEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enrollStudent()}
                  placeholder="student@example.com"
                  type="email"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
                <button
                  onClick={enrollStudent}
                  disabled={!enrollEmail.trim() || enrolling}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enrolling ? "Enrolling…" : "Enroll"}
                </button>
              </div>
              {enrollMsg && (
                <div className={`mt-2 text-xs font-medium ${enrollMsg.ok ? "text-emerald-700" : "text-rose-600"}`}>
                  {enrollMsg.text}
                </div>
              )}
            </div>

            {/* Bulk enroll via CSV */}
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900 mb-1">Bulk Enroll via CSV</div>
              <div className="text-xs text-slate-500 mb-3">
                Upload a CSV file with one student email per row (or an <code>email</code> header column).
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className={`cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 ${bulkEnrolling ? "opacity-50 pointer-events-none" : ""}`}>
                  {bulkEnrolling ? "Uploading…" : "Choose CSV file"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) bulkEnroll(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <a
                  href="data:text/csv;charset=utf-8,email%0Astudent1%40example.com%0Astudent2%40example.com"
                  download="bulk_enroll_template.csv"
                  className="text-xs text-slate-400 underline hover:text-slate-600"
                >
                  Download template
                </a>
              </div>
              {bulkResult && (
                <div className="mt-3 space-y-1 text-xs">
                  {bulkResult.enrolled.length > 0 && (
                    <div className="text-emerald-700">
                      Enrolled ({bulkResult.enrolled.length}): {bulkResult.enrolled.join(", ")}
                    </div>
                  )}
                  {bulkResult.already_enrolled.length > 0 && (
                    <div className="text-slate-500">
                      Already enrolled ({bulkResult.already_enrolled.length}): {bulkResult.already_enrolled.join(", ")}
                    </div>
                  )}
                  {bulkResult.not_found.length > 0 && (
                    <div className="text-amber-700">
                      Not found ({bulkResult.not_found.length}): {bulkResult.not_found.join(", ")}
                    </div>
                  )}
                  {bulkResult.errors.length > 0 && (
                    <div className="text-rose-600">
                      Errors: {bulkResult.errors.join("; ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* At-Risk Students Panel */}
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-amber-900">At-Risk Students</div>
                  <div className="text-xs text-amber-700">Students with elevated dropout risk (ML model)</div>
                </div>
                {!atRiskLoaded && (
                  <button
                    onClick={loadAtRisk}
                    disabled={loadingAtRisk}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {loadingAtRisk ? "Analysing…" : "Run Analysis"}
                  </button>
                )}
                {atRiskLoaded && (
                  <button
                    onClick={loadAtRisk}
                    disabled={loadingAtRisk}
                    className="text-xs text-amber-700 underline hover:text-amber-900 disabled:opacity-50"
                  >
                    {loadingAtRisk ? "Refreshing…" : "Refresh"}
                  </button>
                )}
              </div>
              {atRiskLoaded && (
                atRiskStudents.length === 0 ? (
                  <div className="text-xs text-amber-700">No students flagged as at-risk. Great!</div>
                ) : (
                  <div className="space-y-2">
                    {atRiskStudents.map((s) => (
                      <div key={s.student_id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">{s.full_name}</div>
                          <div className="text-xs text-slate-500">{s.email}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          <span className={`rounded-full px-2 py-0.5 font-semibold ${s.risk_label === "high" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                            {s.risk_label} risk
                          </span>
                          <span className="text-slate-400">Score: {(s.risk_score * 100).toFixed(0)}%</span>
                          <span className="text-slate-400">Progress: {s.avg_progress.toFixed(0)}%</span>
                          <span className="text-slate-400">Quiz avg: {s.avg_quiz_score.toFixed(0)}%</span>
                          <button
                            onClick={() => { setMsgPartnerId(s.student_id); setMsgOpen(true); }}
                            className="rounded-xl border border-violet-200 px-2 py-1 text-xs text-violet-700 hover:bg-violet-50"
                          >
                            Message
                          </button>
                          <Link
                            to={`/teacher/courses/${id}/students/${s.student_id}`}
                            className="rounded-xl border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <SectionHeader title={`Enrolled Students (${enrollments.length})`} />

            {enrollments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No students enrolled yet.
              </div>
            ) : (
              <div className="space-y-2">
                {enrollments.map(({ student, status }) => (
                  <div key={student.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{student.full_name}</div>
                      <div className="text-sm text-slate-500">{student.email}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {status}
                      </span>
                      <button
                        onClick={() => { setMsgPartnerId(student.id); setMsgOpen(true); }}
                        className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                      >
                        Message
                      </button>
                      <Link
                        to={`/teacher/courses/${id}/students/${student.id}`}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        View Progress
                      </Link>
                      {status === "active" && (
                        <button
                          onClick={() => removeStudent(student.id)}
                          disabled={removingStudent === student.id}
                          className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {removingStudent === student.id ? "Removing…" : "Remove"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ANNOUNCEMENTS TAB ───────────────────────────────────────────── */}
        {tab === "announcements" && (
          <div className="mt-6">
            <SectionHeader
              title={`Announcements (${announcements.length})`}
              action={
                <button
                  onClick={() => setShowAddAnn(true)}
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  + Post
                </button>
              }
            />

            {showAddAnn && (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                {annError && <div className="text-xs text-rose-600">{annError}</div>}
                <input
                  value={newAnnTitle}
                  onChange={(e) => setNewAnnTitle(e.target.value)}
                  placeholder="Announcement title *"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
                <textarea
                  value={newAnnBody}
                  onChange={(e) => setNewAnnBody(e.target.value)}
                  placeholder="Body (optional)"
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addAnnouncement}
                    disabled={savingAnn || !newAnnTitle.trim()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingAnn ? "Posting…" : "Post Announcement"}
                  </button>
                  <button
                    onClick={() => { setShowAddAnn(false); setAnnError(""); }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {announcements.length === 0 && !showAddAnn ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No announcements yet. Post one to notify your students.
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((ann) => (
                  <div key={ann.id} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm">{ann.title}</div>
                        {ann.body && (
                          <p className="mt-1 text-sm text-slate-600 leading-relaxed">{ann.body}</p>
                        )}
                        <div className="mt-2 text-xs text-slate-400">
                          {new Date(ann.created_at).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteAnnouncement(ann.id)}
                        className="shrink-0 rounded-xl border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ───────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="mt-6">
            <SectionHeader
              title="Course Analytics"
              action={
                <button
                  onClick={exportAnalyticsCsv}
                  disabled={exportingCsv || !analytics}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exportingCsv ? "Exporting…" : "Export CSV"}
                </button>
              }
            />

            {!analytics ? (
              <div className="text-sm text-slate-500">No analytics data available.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Active Students", value: analytics.enrollments_active },
                    { label: "Total Lessons", value: analytics.lessons_total },
                    { label: "Published Quizzes", value: analytics.quizzes.published },
                    { label: "Quiz Attempts", value: analytics.quizzes.attempts_total },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium text-slate-500">{label}</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-medium text-slate-500">Avg Progress</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {analytics.progress.avg_progress_pct !== null
                        ? `${Math.round(analytics.progress.avg_progress_pct)}%`
                        : "—"}
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-slate-900 transition-all"
                        style={{ width: `${Math.min(100, analytics.progress.avg_progress_pct ?? 0)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {analytics.progress.completed_progress_rows} lessons at 100%
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-medium text-slate-500">Avg Quiz Score</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {analytics.quizzes.avg_score_pct !== null ? `${Math.round(analytics.quizzes.avg_score_pct)}%` : "—"}
                    </div>
                  </div>
                </div>

                {Object.keys(analytics.events.by_type).length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-xs font-medium text-slate-500 mb-3">Events Breakdown (total: {analytics.events.total})</div>
                    <div className="space-y-2">
                      {Object.entries(analytics.events.by_type).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 capitalize">{type.replace(/_/g, " ")}</span>
                          <span className="font-semibold text-slate-900">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <footer className="mt-10 text-xs text-slate-500">EduWise · Teacher view</footer>
      </div>

      {/* Messages Panel */}
      {msgOpen && (
        <MessagesPanel
          currentUserId={course?.teacher_id ?? 0}
          openPartnerId={msgPartnerId}
          onClose={() => { setMsgOpen(false); setMsgPartnerId(undefined); setMsgUnread(0); }}
        />
      )}
    </div>
  );
}
