import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";
import StudentPageNav from "../components/StudentPageNav";

type ExerciseQuestionOut = {
  id: number;
  question_index: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};

type QuestionResult = {
  question_id: number;
  question_index: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  selected_option: string;
  correct_option: string;
  is_correct: boolean;
  explanation: string | null;
};

type GenerateResponse = {
  attempt_id: number;
  lesson_id: number;
  lesson_title: string;
  questions: ExerciseQuestionOut[];
};

type SubmitResponse = {
  attempt_id: number;
  score_pct: number;
  correct_count: number;
  total: number;
  results: QuestionResult[];
};

export default function StudentExercise() {
  const { lessonId } = useParams();
  const lesson_id = Number(lessonId);
  const token = useMemo(() => getAccessToken(), []);

  const [lessonTitle, setLessonTitle] = useState("");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<ExerciseQuestionOut[]>([]);
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [scorePct, setScorePct] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { window.location.href = "/"; return; }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.post<GenerateResponse>(
          `/api/v1/lessons/${lesson_id}/generate-exercises`
        );
        setAttemptId(res.data.attempt_id);
        setLessonTitle(res.data.lesson_title);
        setQuestions(res.data.questions);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to generate exercises");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, lesson_id]);

  function choose(qid: number, opt: "A" | "B" | "C" | "D") {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qid]: opt }));
  }

  async function handleSubmit() {
    if (!attemptId || submitting) return;

    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      const ok = window.confirm(
        `You have ${unanswered.length} unanswered question(s). Submit anyway?`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<SubmitResponse>(
        `/api/v1/exercise-attempts/${attemptId}/submit`,
        {
          answers: questions.map((q) => ({
            question_id: q.id,
            selected_option: answers[q.id] || "A",
          })),
        }
      );
      setSubmitted(true);
      setScorePct(res.data.score_pct);
      setCorrectCount(res.data.correct_count);
      setResults(res.data.results);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || e?.message || "Failed to submit exercises");
    } finally {
      setSubmitting(false);
    }
  }

  const resultMap = useMemo(() => {
    const m: Record<number, QuestionResult> = {};
    for (const r of results) m[r.question_id] = r;
    return m;
  }, [results]);

  const answeredCount = Object.keys(answers).length;
  const scoreColor =
    scorePct !== null && scorePct >= 70
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className="min-h-screen bg-slate-50">
      <StudentPageNav
        title={lessonTitle || "Practice Exercises"}
        subtitle="AI-generated exercises"
        backTo="/student/courses"
        backLabel="Courses"
      />
      <div className="mx-auto max-w-3xl px-4 py-8">
        {!submitted && !loading && questions.length > 0 && (
          <p className="mb-4 text-sm text-slate-500">{answeredCount}/{questions.length} answered · No time limit</p>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
            <div className="text-sm font-semibold text-rose-800">Could not generate exercises</div>
            <p className="mt-1 text-xs text-rose-700">{error}</p>
            <Link
              to="/student/courses"
              className="mt-3 inline-block text-xs font-medium text-rose-700 underline"
            >
              ← Go back
            </Link>
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <div className="text-slate-500 text-sm mb-1">Generating exercises…</div>
            <div className="text-xs text-slate-400">AI is creating 10 questions based on this lesson</div>
          </div>
        )}

        {!loading && !error && (
          <div className="mt-6 space-y-4">
            {/* Score summary (after submit) */}
            {submitted && scorePct !== null && (
              <div className={`rounded-2xl border p-5 ${scoreColor}`}>
                <div className="text-lg font-bold">Exercises Submitted</div>
                <div className="mt-1 text-sm font-medium">
                  Score:{" "}
                  <span className="text-xl font-bold">{scorePct}%</span>
                  <span className="ml-3 text-slate-600">
                    ({correctCount}/{results.length} correct)
                  </span>
                </div>
                {scorePct >= 80 && (
                  <p className="mt-2 text-xs font-medium">
                    Excellent work! Keep it up.
                  </p>
                )}
                {scorePct >= 60 && scorePct < 80 && (
                  <p className="mt-2 text-xs font-medium">
                    Good effort! Review the corrections below to improve.
                  </p>
                )}
                {scorePct < 60 && (
                  <p className="mt-2 text-xs font-medium">
                    Keep practicing! Read the explanations below to understand the correct answers.
                  </p>
                )}
              </div>
            )}

            {/* Questions */}
            {questions.map((q, idx) => {
              const selected = answers[q.id];
              const result = resultMap[q.id];
              const opts = [
                { key: "A" as const, label: q.option_a },
                { key: "B" as const, label: q.option_b },
                { key: "C" as const, label: q.option_c },
                { key: "D" as const, label: q.option_d },
              ];

              return (
                <div
                  key={q.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    submitted && result
                      ? result.is_correct
                        ? "border-emerald-200"
                        : "border-rose-200"
                      : "border-slate-200"
                  }`}
                >
                  {/* Question header */}
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                      {idx + 1}
                    </span>
                    <div className="text-sm font-semibold text-slate-900 leading-relaxed">
                      {q.question_text}
                    </div>
                    {submitted && result && (
                      <span
                        className={`shrink-0 ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          result.is_correct
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {result.is_correct ? "✓ Correct" : "✗ Wrong"}
                      </span>
                    )}
                  </div>

                  {/* Options */}
                  <div className="mt-4 ml-7 grid gap-2">
                    {opts.map(({ key, label }) => {
                      const isSelected = selected === key;
                      let cls =
                        "w-full text-left rounded-xl border px-4 py-3 text-sm transition ";

                      if (submitted && result) {
                        if (key === result.correct_option) {
                          cls +=
                            "border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold";
                        } else if (isSelected && !result.is_correct) {
                          cls += "border-rose-300 bg-rose-50 text-rose-700";
                        } else {
                          cls += "border-slate-200 bg-white text-slate-400";
                        }
                      } else {
                        cls += isSelected
                          ? "border-violet-500 bg-violet-50 text-violet-900 font-semibold"
                          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 cursor-pointer";
                      }

                      return (
                        <button
                          key={key}
                          onClick={() => choose(q.id, key)}
                          className={cls}
                          disabled={submitted}
                        >
                          <span className="mr-2 font-semibold text-slate-400">{key}.</span>
                          {label}
                          {submitted && result && key === result.correct_option && (
                            <span className="ml-2 text-xs font-semibold text-emerald-600">
                              ✓ Correct answer
                            </span>
                          )}
                          {submitted &&
                            result &&
                            isSelected &&
                            !result.is_correct &&
                            key === selected && (
                              <span className="ml-2 text-xs font-semibold text-rose-500">
                                Your answer
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation (only shown for wrong answers after submit) */}
                  {submitted && result && !result.is_correct && result.explanation && (
                    <div className="mt-3 ml-7 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <div className="text-[11px] font-semibold text-amber-800 mb-0.5">
                        Explanation
                      </div>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        {result.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Submit button */}
            {!submitted && questions.length > 0 && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition"
              >
                {submitting ? "Grading…" : `Submit exercises (${answeredCount}/${questions.length} answered)`}
              </button>
            )}

            {/* After submit: navigation */}
            {submitted && (
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link
                  to={`/student/lessons/${lesson_id}/exercises`}
                  onClick={() => window.location.reload()}
                  className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
                >
                  Generate new exercises
                </Link>
                <Link
                  to="/student/history"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  View exercise history
                </Link>
                <Link
                  to="/student/courses"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back to courses
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
