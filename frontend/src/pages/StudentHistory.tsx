import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";
import NotificationBell from "../components/NotificationBell";

type QuizAttempt = {
  attempt_id: number;
  quiz_id: number;
  quiz_title: string;
  course_id: number;
  course_title: string;
  score_pct: number;
  submitted_at: string | null;
};

type SubmissionRecord = {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  course_id: number;
  course_title: string;
  max_score: number;
  due_date: string | null;
  submitted_at: string | null;
  grade: number | null;
  feedback: string | null;
  graded_at: string | null;
};

type Tab = "quizzes" | "assignments";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScoreChip({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 60
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      {score}%
    </span>
  );
}

function GradeChip({ grade, max }: { grade: number | null; max: number }) {
  if (grade === null)
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
        Awaiting grade
      </span>
    );
  const pct = Math.round((grade / max) * 100);
  const color =
    pct >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : pct >= 60
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      {grade}/{max}
    </span>
  );
}

export default function StudentHistory() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("quizzes");
  const [quizzes, setQuizzes] = useState<QuizAttempt[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAccessToken()) { navigate("/"); return; }
    async function load() {
      setLoading(true);
      try {
        const [qRes, sRes] = await Promise.all([
          api.get<QuizAttempt[]>("/api/v1/me/quiz-attempts"),
          api.get<SubmissionRecord[]>("/api/v1/me/submission-history"),
        ]);
        setQuizzes(qRes.data);
        setSubmissions(sRes.data);
      } catch {
        setError("Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  function logout() {
    clearAccessToken();
    navigate("/");
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "quizzes",     label: "Quiz Attempts",          count: quizzes.length },
    { key: "assignments", label: "Assignment Submissions",  count: submissions.length },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/student" className="text-lg font-bold tracking-tight text-slate-900">
              EDU<span className="text-sky-600">wise</span>
            </Link>
            <div className="hidden items-center gap-1 sm:flex">
              <Link to="/student" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Dashboard</Link>
              <Link to="/student/courses" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">My Courses</Link>
              <Link to="/student/history" className="rounded-lg bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700">History</Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link to="/profile" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Profile</Link>
            <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My History</h1>
          <p className="mt-1 text-sm text-slate-500">View all your past quiz attempts and assignment submissions.</p>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                tab === t.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
        )}
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {!loading && !error && tab === "quizzes" && (
          <>
            {quizzes.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
                No quiz attempts yet. Head to your courses to take a quiz.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Quiz</th>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3">Score</th>
                      <th className="px-5 py-3">Submitted</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzes.map((q) => (
                      <tr key={q.attempt_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-5 py-3.5 font-medium text-slate-800">{q.quiz_title}</td>
                        <td className="px-5 py-3.5 text-slate-500">{q.course_title}</td>
                        <td className="px-5 py-3.5">
                          <ScoreChip score={q.score_pct} />
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">{fmt(q.submitted_at)}</td>
                        <td className="px-5 py-3.5">
                          <Link
                            to={`/student/courses/${q.course_id}`}
                            className="text-xs font-medium text-sky-600 hover:text-sky-800"
                          >
                            Go to course →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!loading && !error && tab === "assignments" && (
          <>
            {submissions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
                No assignment submissions yet. Go to your courses to submit assignments.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Assignment</th>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3">Grade</th>
                      <th className="px-5 py-3">Submitted</th>
                      <th className="px-5 py-3">Feedback</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.submission_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="px-5 py-3.5 font-medium text-slate-800">{s.assignment_title}</td>
                        <td className="px-5 py-3.5 text-slate-500">{s.course_title}</td>
                        <td className="px-5 py-3.5">
                          <GradeChip grade={s.grade} max={s.max_score} />
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">{fmt(s.submitted_at)}</td>
                        <td className="px-5 py-3.5 max-w-xs">
                          {s.feedback ? (
                            <span className="text-slate-600 line-clamp-2">{s.feedback}</span>
                          ) : (
                            <span className="text-slate-400 italic text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            to={`/student/courses/${s.course_id}`}
                            className="text-xs font-medium text-sky-600 hover:text-sky-800"
                          >
                            Go to course →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
