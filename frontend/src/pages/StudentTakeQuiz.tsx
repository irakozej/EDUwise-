import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type QuestionOut = {
  id: number;
  quiz_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  topic?: string | null;
  difficulty?: string | null;
};

type QuestionResult = {
  question_id: number;
  selected_option: string;
  correct_option: string;
  is_correct: boolean;
};

type AttemptOut = {
  attempt_id: number;
  quiz_id: number;
  is_submitted: boolean;
  score_pct: number;
  time_limit_minutes?: number | null;
  started_at?: string | null;
  results: QuestionResult[];
};

type StartAttemptRequest = { quiz_id: number };
type SubmitAttemptRequest = { answers: { question_id: number; selected_option: "A" | "B" | "C" | "D" }[] };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function StudentTakeQuiz() {
  const { quizId } = useParams();
  const quiz_id = Number(quizId);
  const token = useMemo(() => getAccessToken(), []);

  const [questions, setQuestions] = useState<QuestionOut[]>([]);
  const [attempt, setAttempt] = useState<AttemptOut | null>(null);
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [scorePct, setScorePct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmittedRef = useRef(false);

  function startTimer(limitMinutes: number, startedAt: string | null) {
    const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
    const endMs = startMs + limitMinutes * 60 * 1000;
    const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
    setTimeLeft(remaining);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setTimeLeft(secs);
      if (secs === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        clearInterval(timerRef.current!);
      }
    }, 1000);
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && !submitted && attempt && !submitting) {
      handleSubmit(true);
    }
  }, [timeLeft]);

  useEffect(() => {
    if (!token) { window.location.href = "/"; return; }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const a = await api.post<AttemptOut>("/api/v1/attempts/start", { quiz_id } satisfies StartAttemptRequest);
        setAttempt(a.data);

        const qs = await api.get<QuestionOut[]>(`/api/v1/quizzes/${quiz_id}/questions`);
        setQuestions(qs.data || []);

        if (a.data.is_submitted) {
          setSubmitted(true);
          setScorePct(a.data.score_pct);
          setResults(a.data.results || []);
        } else if (a.data.time_limit_minutes) {
          startTimer(a.data.time_limit_minutes, a.data.started_at ?? null);
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        setError(e?.response?.data?.detail || e?.message || "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, quiz_id]);

  function choose(qid: number, opt: "A" | "B" | "C" | "D") {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qid]: opt }));
  }

  async function handleSubmit(autoSubmit = false) {
    if (!attempt || submitting) return;
    setSubmitting(true);

    const payload: SubmitAttemptRequest = {
      answers: questions.map((q) => ({
        question_id: q.id,
        selected_option: answers[q.id] || "A",
      })),
    };

    try {
      const res = await api.post<AttemptOut>(`/api/v1/attempts/${attempt.attempt_id}/submit`, payload);
      setSubmitted(true);
      setScorePct(res.data.score_pct);
      setResults(res.data.results || []);
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoSubmit) setTimeLeft(0);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(e?.response?.data?.detail || e?.message || "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  }

  const resultMap = useMemo(() => {
    const m: Record<number, QuestionResult> = {};
    for (const r of results) m[r.question_id] = r;
    return m;
  }, [results]);

  const correctCount = results.filter((r) => r.is_correct).length;
  const isLow = timeLeft !== null && timeLeft <= 60 && !submitted;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Take Quiz</h1>
            <p className="mt-1 text-sm text-slate-500">Quiz #{quiz_id}</p>
          </div>
          <div className="flex items-center gap-3">
            {timeLeft !== null && !submitted && (
              <div className={`rounded-xl border px-3 py-1.5 text-sm font-mono font-semibold tabular-nums ${
                isLow ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700"
              }`}>
                {isLow ? "⏰ " : "⏱ "}{formatTime(timeLeft)}
              </div>
            )}
            <Link
              to="/student/quizzes"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to quizzes
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="font-semibold">❌ {error}</div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">Loading…</div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* Score summary */}
            {submitted && (
              <div className={`rounded-2xl border p-5 ${
                scorePct !== null && scorePct >= 70
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}>
                <div className={`text-lg font-bold ${scorePct !== null && scorePct >= 70 ? "text-emerald-800" : "text-amber-800"}`}>
                  {timeLeft === 0 && autoSubmittedRef.current ? "Time's up! " : ""}
                  Quiz Submitted ✅
                </div>
                <div className="mt-1 text-sm font-medium text-slate-700">
                  Score: <span className="text-xl font-bold">{scorePct ?? 0}%</span>
                  {results.length > 0 && (
                    <span className="ml-3 text-slate-500">({correctCount}/{results.length} correct)</span>
                  )}
                </div>
              </div>
            )}

            {/* Questions */}
            {questions.map((q, idx) => {
              const selected = answers[q.id];
              const result = resultMap[q.id];

              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 text-xs font-semibold text-slate-400">{idx + 1}.</span>
                    <div className="text-sm font-semibold text-slate-900">{q.question_text}</div>
                  </div>
                  {(q.topic || q.difficulty) && (
                    <div className="mt-1 ml-5 flex gap-2">
                      {q.topic && <span className="text-[11px] text-slate-400">{q.topic}</span>}
                      {q.difficulty && <span className="text-[11px] text-slate-400">· {q.difficulty}</span>}
                    </div>
                  )}

                  <div className="mt-4 ml-5 grid gap-2">
                    {(["A", "B", "C", "D"] as const).map((opt) => {
                      const label = opt === "A" ? q.option_a : opt === "B" ? q.option_b : opt === "C" ? q.option_c : q.option_d;
                      const isSelected = selected === opt;

                      // After submission: color coding
                      let cls = "text-left rounded-xl border px-4 py-3 text-sm transition ";
                      if (submitted && result) {
                        if (opt === result.correct_option) {
                          cls += "border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold";
                        } else if (isSelected && !result.is_correct) {
                          cls += "border-rose-300 bg-rose-50 text-rose-700";
                        } else {
                          cls += "border-slate-200 bg-white text-slate-500";
                        }
                      } else {
                        cls += isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50";
                      }

                      return (
                        <button key={opt} onClick={() => choose(q.id, opt)} className={cls} disabled={submitted}>
                          <span className="mr-2 font-semibold">{opt}.</span> {label}
                          {submitted && result && opt === result.correct_option && (
                            <span className="ml-2 text-emerald-600">✓</span>
                          )}
                          {submitted && result && isSelected && !result.is_correct && opt === selected && (
                            <span className="ml-2 text-rose-500">✗</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!submitted && questions.length > 0 && (
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit quiz"}
              </button>
            )}

            {submitted && (
              <div className="flex justify-center">
                <Link
                  to="/student/quizzes"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ← Back to all quizzes
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
