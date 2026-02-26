import { useEffect, useMemo, useState } from "react";
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

type AttemptOut = {
  attempt_id: number;
  quiz_id: number;
  is_submitted: boolean;
  score_pct: number;
};

type StartAttemptRequest = { quiz_id: number };

type SubmitAttemptRequest = {
  answers: { question_id: number; selected_option: "A" | "B" | "C" | "D" }[];
};

export default function StudentTakeQuiz() {
  const { quizId } = useParams();
  const quiz_id = Number(quizId);
  const token = useMemo(() => getAccessToken(), []);

  const [questions, setQuestions] = useState<QuestionOut[]>([]);
  const [attempt, setAttempt] = useState<AttemptOut | null>(null);

  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const [submitted, setSubmitted] = useState(false);
  const [scorePct, setScorePct] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        // Start attempt (backend will return existing attempt if already started)
        const a = await api.post<AttemptOut>("/api/v1/attempts/start", { quiz_id } satisfies StartAttemptRequest);
        setAttempt(a.data);

        // Load questions
        const qs = await api.get<QuestionOut[]>(`/api/v1/quizzes/${quiz_id}/questions`);
        setQuestions(qs.data || []);

        if (a.data.is_submitted) {
          setSubmitted(true);
          setScorePct(a.data.score_pct);
        }
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, quiz_id]);

  function choose(qid: number, opt: "A" | "B" | "C" | "D") {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qid]: opt }));
  }

  async function submit() {
    if (!attempt) return;

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
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || "Failed to submit quiz");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Take Quiz</h1>
            <p className="mt-1 text-sm text-slate-500">Quiz #{quiz_id}</p>
          </div>
          <Link
            to="/student/quizzes"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to quizzes
          </Link>
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
            {submitted && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <div className="font-semibold">Submitted ✅</div>
                <div className="mt-1 text-sm">Score: <span className="font-semibold">{scorePct ?? 0}%</span></div>
              </div>
            )}

            {questions.map((q, idx) => {
              const selected = answers[q.id];
              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">
                    {idx + 1}. {q.question_text}
                  </div>

                  <div className="mt-4 grid gap-2">
                    {(["A", "B", "C", "D"] as const).map((opt) => {
                      const label =
                        opt === "A" ? q.option_a :
                        opt === "B" ? q.option_b :
                        opt === "C" ? q.option_c : q.option_d;

                      const active = selected === opt;

                      return (
                        <button
                          key={opt}
                          onClick={() => choose(q.id, opt)}
                          className={
                            "text-left rounded-xl border px-4 py-3 text-sm transition " +
                            (active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50")
                          }
                          disabled={submitted}
                        >
                          <span className="mr-2 font-semibold">{opt}.</span> {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!submitted && questions.length > 0 && (
              <button
                onClick={submit}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Submit quiz
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}