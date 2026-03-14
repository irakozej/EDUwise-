import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import PageLoader from "../components/PageLoader";

type CourseRef = { course_id: number; title: string };

type QuizGrade = {
  quiz_id: number;
  quiz_title: string;
  quiz_type: string;
  score_pct: number | null;
  submitted_at: string | null;
};

type AssignmentGrade = {
  assignment_id: number;
  assignment_title: string;
  max_score: number;
  grade: number | null;
  feedback: string | null;
  submitted_at: string | null;
  graded_at: string | null;
};

type GradesData = {
  courses: CourseRef[];
  selected_course_id: number | null;
  quiz_grades: QuizGrade[];
  assignment_grades: AssignmentGrade[];
  overall_quiz_avg: number | null;
  overall_assignment_avg: number | null;
};

function ScoreBadge({ pct, max, label }: { pct?: number | null; max?: number; label?: string }) {
  const val = pct ?? null;
  const color =
    val === null ? "bg-slate-100 text-slate-500" :
    val >= 80 ? "bg-emerald-100 text-emerald-700" :
    val >= 60 ? "bg-sky-100 text-sky-700" :
    val >= 40 ? "bg-amber-100 text-amber-700" :
    "bg-rose-100 text-rose-700";
  const display = val === null
    ? (label ?? "Not graded")
    : max !== undefined
      ? `${val}/${max}`
      : `${val}%`;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>{display}</span>;
}

export default function StudentGrades() {
  const navigate = useNavigate();
  const token = getAccessToken();

  const [data, setData] = useState<GradesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!token) { window.location.href = "/"; return; }
    fetchGrades(null);
  }, [token]);

  async function fetchGrades(courseId: number | null) {
    if (courseId !== null) setSwitching(true); else setLoading(true);
    try {
      const url = courseId ? `/api/v1/me/grades?course_id=${courseId}` : "/api/v1/me/grades";
      const res = await api.get<GradesData>(url);
      setData(res.data);
      setSelectedCourse(res.data.selected_course_id);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setSwitching(false);
    }
  }

  function handleCourseChange(courseId: number) {
    setSelectedCourse(courseId);
    fetchGrades(courseId);
  }

  const quizAvgColor =
    data?.overall_quiz_avg == null ? "text-slate-400" :
    data.overall_quiz_avg >= 80 ? "text-emerald-600" :
    data.overall_quiz_avg >= 60 ? "text-sky-600" :
    data.overall_quiz_avg >= 40 ? "text-amber-600" : "text-rose-600";

  const assignAvgColor =
    data?.overall_assignment_avg == null ? "text-slate-400" :
    data.overall_assignment_avg >= 80 ? "text-emerald-600" :
    data.overall_assignment_avg >= 60 ? "text-sky-600" :
    data.overall_assignment_avg >= 40 ? "text-amber-600" : "text-rose-600";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/20 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/student")}
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div>
              <div className="text-sm font-semibold text-slate-900">My Grades</div>
              <div className="text-xs text-slate-400">Quiz & assignment scores per course</div>
            </div>
          </div>

          {/* Course selector */}
          {data && data.courses.length > 1 && (
            <select
              value={selectedCourse ?? ""}
              onChange={(e) => handleCourseChange(Number(e.target.value))}
              disabled={switching}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
            >
              {data.courses.map((c) => (
                <option key={c.course_id} value={c.course_id}>{c.title}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {loading && <PageLoader text="Loading grades…" />}

        {!loading && data && data.courses.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="text-3xl mb-3">📚</div>
            <div className="text-sm font-semibold text-slate-700">No enrolled courses</div>
            <p className="text-xs text-slate-400 mt-1">Enrol in a course to start earning grades.</p>
          </div>
        )}

        {!loading && data && data.courses.length > 0 && (
          <>
            {/* Course title (mobile — shown when only 1 course or no dropdown space) */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">
                {data.courses.find(c => c.course_id === selectedCourse)?.title ?? ""}
              </h1>
              {switching && (
                <div className="h-4 w-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
              )}
            </div>

            {/* Summary KPI cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-500 mb-1">Quiz Average</div>
                <div className={`text-4xl font-black ${quizAvgColor}`}>
                  {data.overall_quiz_avg !== null ? `${data.overall_quiz_avg}%` : "—"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {data.quiz_grades.length} quiz{data.quiz_grades.length !== 1 ? "zes" : ""} attempted
                </div>
                {data.overall_quiz_avg !== null && (
                  <div className="mt-3 h-2 w-full rounded-full bg-sky-200">
                    <div className="h-2 rounded-full bg-sky-500 transition-all" style={{ width: `${data.overall_quiz_avg}%` }} />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-violet-500 mb-1">Assignment Average</div>
                <div className={`text-4xl font-black ${assignAvgColor}`}>
                  {data.overall_assignment_avg !== null ? `${data.overall_assignment_avg}` : "—"}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {data.assignment_grades.filter(a => a.grade !== null).length} of {data.assignment_grades.length} graded
                </div>
                {data.overall_assignment_avg !== null && (
                  <div className="mt-3 h-2 w-full rounded-full bg-violet-200">
                    <div className="h-2 rounded-full bg-violet-500 transition-all"
                      style={{ width: `${Math.min(100, data.overall_assignment_avg)}%` }} />
                  </div>
                )}
              </div>
            </div>

            {/* Quiz grades */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Quizzes</h2>
                <span className="text-xs text-slate-400">{data.quiz_grades.length} attempt{data.quiz_grades.length !== 1 ? "s" : ""}</span>
              </div>
              {data.quiz_grades.length === 0 ? (
                <div className="px-5 py-6 text-xs text-slate-400">No quiz attempts yet for this course.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.quiz_grades.map((q) => (
                    <div key={q.quiz_id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{q.quiz_title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold rounded-full px-1.5 ${q.quiz_type === "live" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                            {q.quiz_type === "live" ? "Live" : "Self-paced"}
                          </span>
                          {q.submitted_at && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(q.submitted_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <ScoreBadge pct={q.score_pct} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assignment grades */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Assignments</h2>
                <span className="text-xs text-slate-400">{data.assignment_grades.length} submitted</span>
              </div>
              {data.assignment_grades.length === 0 ? (
                <div className="px-5 py-6 text-xs text-slate-400">No assignment submissions yet for this course.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.assignment_grades.map((a) => (
                    <div key={a.assignment_id} className="px-5 py-3">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{a.assignment_title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Max: {a.max_score} pts
                            {a.submitted_at && ` · Submitted ${new Date(a.submitted_at).toLocaleDateString()}`}
                            {a.graded_at && ` · Graded ${new Date(a.graded_at).toLocaleDateString()}`}
                          </div>
                        </div>
                        <ScoreBadge
                          pct={a.grade !== null ? Math.round((a.grade / a.max_score) * 100) : null}
                          max={a.max_score}
                          label={a.grade !== null ? undefined : "Pending"}
                        />
                      </div>
                      {a.feedback && (
                        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-100">
                          <span className="font-semibold text-slate-500">Feedback: </span>{a.feedback}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
