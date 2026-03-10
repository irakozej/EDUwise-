import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type Question = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
};

type QuizInfo = { id: number; title: string };

function wsUrl(quizId: string): string {
  const token = getAccessToken() ?? "";
  const base = (import.meta.env.VITE_API_URL ?? window.location.origin).replace(/^http/, "ws");
  return `${base}/ws/quiz/${quizId}?token=${encodeURIComponent(token)}`;
}

export default function TeacherLiveQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1); // -1 = not started
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [responded, setResponded] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sessionEnded, setSessionEnded] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Load quiz + questions
  useEffect(() => {
    if (!quizId) return;
    Promise.all([
      api.get<QuizInfo>(`/api/v1/quizzes/${quizId}`),
      api.get<Question[]>(`/api/v1/quizzes/${quizId}/questions`),
    ]).then(([qi, qs]) => {
      setQuiz(qi.data);
      setQuestions(qs.data || []);
    }).catch(() => {});
  }, [quizId]);

  // WebSocket connection
  useEffect(() => {
    if (!quizId) return;
    const ws = new WebSocket(wsUrl(quizId));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.event === "state") {
        setParticipants(msg.participant_count ?? 0);
        setAccepting(msg.accepting ?? false);
      }
      if (msg.event === "question_pushed") {
        setParticipants(msg.participant_count ?? 0);
        setResponded(0);
        setAccepting(true);
      }
      if (msg.event === "tally") {
        setResponded(msg.responded ?? 0);
        setParticipants(msg.total ?? participants);
      }
      if (msg.event === "results") {
        setAnswers(msg.answers ?? {});
        setAccepting(false);
      }
    };

    return () => ws.close();
  }, [quizId]);

  function send(payload: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  function pushQuestion(idx: number) {
    const q = questions[idx];
    if (!q) return;
    setCurrentIdx(idx);
    setResponded(0);
    setAnswers({});
    send({ event: "push_question", question: q });
  }

  function closeAnswers() {
    send({ event: "close_answers" });
  }

  function endSession() {
    send({ event: "end_session" });
    setSessionEnded(true);
  }

  const current = questions[currentIdx];
  // Count answers per option
  const tally: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  Object.values(answers).forEach((opt) => { if (opt in tally) tally[opt]++; });
  const totalAnswered = Object.values(tally).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div>
            <div className="text-sm font-bold">{quiz?.title ?? "Live Quiz"}</div>
            <div className="text-xs text-slate-400">Teacher control panel</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${connected ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {connected ? "Live" : "Connecting…"}
          </div>
          <div className="text-xs bg-white/10 px-2.5 py-1 rounded-full">{participants} student{participants !== 1 ? "s" : ""} online</div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {sessionEnded ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🏁</div>
            <div className="text-xl font-bold">Session Ended</div>
            <p className="text-slate-400 mt-2 text-sm">All students have been notified.</p>
            <button onClick={() => navigate(-1)} className="mt-6 rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20">
              Back to course
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Question list */}
            <div className="lg:col-span-1 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Questions ({questions.length})</div>
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => pushQuestion(i)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 text-xs transition ${
                    currentIdx === i
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <span className="font-bold mr-2">Q{i + 1}.</span>
                  <span className="line-clamp-2">{q.question_text}</span>
                </button>
              ))}
              <button
                onClick={endSession}
                className="mt-4 w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
              >
                End Session
              </button>
            </div>

            {/* Live view */}
            <div className="lg:col-span-2 space-y-4">
              {currentIdx === -1 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-10 text-center">
                  <div className="text-3xl mb-3">▶️</div>
                  <div className="text-sm font-semibold text-slate-300">Select a question to push it live</div>
                  <p className="text-xs text-slate-500 mt-1">Students will see it immediately on their screen.</p>
                </div>
              ) : current ? (
                <>
                  {/* Current question */}
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold bg-violet-500 text-white px-2 py-0.5 rounded-full">Q{currentIdx + 1}</span>
                      {accepting && <span className="text-xs text-amber-300 animate-pulse font-medium">● Accepting answers…</span>}
                    </div>
                    <div className="text-sm font-semibold text-white mb-4">{current.question_text}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["A", "B", "C", "D"] as const).map((opt) => {
                        const text = current[`option_${opt.toLowerCase()}` as keyof Question];
                        const count = tally[opt] ?? 0;
                        const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
                        const isCorrect = opt === current.correct_option;
                        return (
                          <div key={opt} className={`rounded-xl border p-3 relative overflow-hidden ${isCorrect && !accepting ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
                            <div className="relative z-10">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-400">{opt}</span>
                                {!accepting && <span className="text-[10px] font-bold text-white">{count} ({pct}%)</span>}
                              </div>
                              <div className="text-xs text-slate-200">{text}</div>
                            </div>
                            {/* Answer bar */}
                            {!accepting && (
                              <div className="absolute bottom-0 left-0 h-1 bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-center">
                      <div className="text-2xl font-black text-violet-300">{responded}</div>
                      <div className="text-[10px] text-slate-400">of {participants} responded</div>
                    </div>
                    {accepting ? (
                      <button
                        onClick={closeAnswers}
                        className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-white hover:bg-amber-600"
                      >
                        Close Answers & Show Results
                      </button>
                    ) : (
                      <button
                        onClick={() => currentIdx + 1 < questions.length ? pushQuestion(currentIdx + 1) : undefined}
                        disabled={currentIdx + 1 >= questions.length}
                        className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40"
                      >
                        Next Question →
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
