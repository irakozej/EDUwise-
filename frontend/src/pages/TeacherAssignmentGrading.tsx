import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import TeacherPageNav from "../components/TeacherPageNav";
import PageLoader from "../components/PageLoader";

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
  student_name: string;
  student_email: string;
  text_body: string | null;
  file_url: string | null;
  file_name: string | null;
  is_submitted: boolean;
  submitted_at: string | null;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
};

export default function TeacherAssignmentGrading() {
  const { assignmentId } = useParams();
  const assignment_id = Number(assignmentId);
  const token = useMemo(() => getAccessToken(), []);

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Grade form state per submission
  const [gradeInputs, setGradeInputs] = useState<Record<number, string>>({});
  const [feedbackInputs, setFeedbackInputs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saveError, setSaveError] = useState<Record<number, string>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<number, boolean>>({});

  // Expand submission text
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const [aRes, sRes] = await Promise.all([
          api.get<Assignment>(`/api/v1/assignments/${assignment_id}`),
          api.get<Submission[]>(`/api/v1/assignments/${assignment_id}/submissions`),
        ]);
        setAssignment(aRes.data);
        setSubmissions(sRes.data || []);

        // Pre-fill grade inputs with existing grades
        const inputs: Record<number, string> = {};
        const feedbackMap: Record<number, string> = {};
        for (const sub of sRes.data || []) {
          inputs[sub.id] = sub.grade != null ? String(sub.grade) : "";
          feedbackMap[sub.id] = sub.feedback || "";
        }
        setGradeInputs(inputs);
        setFeedbackInputs(feedbackMap);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to load assignment");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, assignment_id]);

  async function saveGrade(sub: Submission) {
    const gradeVal = Number(gradeInputs[sub.id]);
    if (isNaN(gradeVal)) {
      setSaveError((p) => ({ ...p, [sub.id]: "Enter a valid number" }));
      return;
    }

    setSaving((p) => ({ ...p, [sub.id]: true }));
    setSaveError((p) => ({ ...p, [sub.id]: "" }));
    setSaveSuccess((p) => ({ ...p, [sub.id]: false }));

    try {
      const res = await api.patch<Submission>(`/api/v1/submissions/${sub.id}/grade`, {
        grade: gradeVal,
        feedback: feedbackInputs[sub.id] || null,
      });
      setSubmissions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, grade: res.data.grade, feedback: res.data.feedback, graded_at: res.data.graded_at } : s))
      );
      setSaveSuccess((p) => ({ ...p, [sub.id]: true }));
      setTimeout(() => setSaveSuccess((p) => ({ ...p, [sub.id]: false })), 2000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setSaveError((p) => ({ ...p, [sub.id]: e?.response?.data?.detail || e?.message || "Failed to save grade" }));
    } finally {
      setSaving((p) => ({ ...p, [sub.id]: false }));
    }
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const submittedCount = submissions.filter((s) => s.is_submitted).length;
  const gradedCount = submissions.filter((s) => s.grade != null).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <TeacherPageNav
        title={assignment ? assignment.title : "Assignment Grading"}
        subtitle={assignment?.description ?? "Grade student submissions"}
        backTo="/teacher"
        backLabel="Dashboard"
      />
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Assignment meta + stats */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            {assignment && (
              <div className="flex gap-4 text-xs text-slate-400">
                <span>Max score: <strong className="text-slate-600">{assignment.max_score}</strong></span>
                {assignment.due_date && (
                  <span>Due: <strong className="text-slate-600">{new Date(assignment.due_date).toLocaleString()}</strong></span>
                )}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-slate-900">{submittedCount}</div>
            <div className="text-xs text-slate-400">submissions</div>
            <div className="mt-1 text-sm font-semibold text-emerald-600">{gradedCount} graded</div>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <PageLoader />
        ) : submissions.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
              </svg>
            </div>
            <div className="text-sm text-slate-500 font-medium">No submissions yet</div>
            <div className="mt-1 text-xs text-slate-400">Students haven't submitted this assignment yet.</div>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
                  sub.grade != null ? "border-emerald-200" : sub.is_submitted ? "border-slate-200" : "border-slate-100 opacity-60"
                }`}
              >
                {/* Submission header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900">{sub.student_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{sub.student_email}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {sub.grade != null ? (
                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {sub.grade}/{assignment?.max_score}
                      </span>
                    ) : sub.is_submitted ? (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">
                        Not submitted
                      </span>
                    )}
                    {sub.submitted_at && (
                      <span className="text-xs text-slate-400">
                        {new Date(sub.submitted_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {sub.is_submitted && (
                  <div className="border-t border-slate-100 px-5 pb-5">
                    {/* Answer text */}
                    {sub.text_body && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-slate-500 mb-1">Student's answer</div>
                        <div
                          className={`rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap ${
                            !expanded.has(sub.id) && sub.text_body.length > 300 ? "line-clamp-4" : ""
                          }`}
                        >
                          {sub.text_body}
                        </div>
                        {sub.text_body.length > 300 && (
                          <button
                            onClick={() => toggleExpanded(sub.id)}
                            className="mt-1 text-xs text-slate-500 underline hover:text-slate-900"
                          >
                            {expanded.has(sub.id) ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Uploaded file */}
                    {sub.file_url && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-slate-500 mb-1">Uploaded file</div>
                        <a
                          href={sub.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {sub.file_name || "Download file"}
                        </a>
                      </div>
                    )}

                    {/* Grade form */}
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="text-xs font-semibold text-slate-500">Grade submission</div>
                      {saveError[sub.id] && (
                        <div className="text-xs text-rose-600">{saveError[sub.id]}</div>
                      )}
                      <div className="flex gap-2 items-end">
                        <div>
                          <label className="text-xs text-slate-500">
                            Score (0 – {assignment?.max_score})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={assignment?.max_score}
                            value={gradeInputs[sub.id] ?? ""}
                            onChange={(e) => setGradeInputs((p) => ({ ...p, [sub.id]: e.target.value }))}
                            className="mt-1 w-24 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                          />
                        </div>
                        <button
                          onClick={() => saveGrade(sub)}
                          disabled={saving[sub.id]}
                          className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {saving[sub.id] ? "Saving…" : saveSuccess[sub.id] ? "Saved" : "Save Grade"}
                        </button>
                      </div>
                      <textarea
                        value={feedbackInputs[sub.id] ?? ""}
                        onChange={(e) => setFeedbackInputs((p) => ({ ...p, [sub.id]: e.target.value }))}
                        placeholder="Feedback (optional)"
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400 resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
