import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type Question = {
  id: number;
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
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [responded, setResponded] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sessionEnded, setSessionEnded] = useState(false);
  const [timeLimitSecs, setTimeLimitSecs] = useState(30);
  const [timeLimitActive, setTimeLimitActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        clearCountdown();
      }
    };
    return () => ws.close();
  }, [quizId]);

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }

  function send(payload: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  function applyTimeLimit() {
    send({ event: "set_time_limit", seconds: timeLimitActive ? timeLimitSecs : 0 });
  }

  function pushQuestion(idx: number) {
    const q = questions[idx];
    if (!q) return;
    setCurrentIdx(idx);
    setResponded(0);
    setAnswers({});
    clearCountdown();

    send({
      event: "push_question",
      question: {
        question_id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
      },
    });

    if (timeLimitActive && timeLimitSecs > 0) {
      let remaining = timeLimitSecs;
      setCountdown(remaining);
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearCountdown();
          closeAnswers();
        }
      }, 1000);
    }
  }

  function closeAnswers() {
    clearCountdown();
    send({ event: "close_answers" });
  }

  function endSession() {
    clearCountdown();
    send({ event: "end_session" });
    setSessionEnded(true);
  }

  const current = questions[currentIdx];
  const tally: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  Object.values(answers).forEach((opt) => { if (opt in tally) tally[opt as keyof typeof tally]++; });
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
          {countdown !== null && (
            <div className={`text-sm font-black px-3 py-1 rounded-full ${countdown <= 5 ? "bg-rose-500/30 text-rose-300 animate-pulse" : "bg-amber-500/20 text-amber-300"}`}>
              {countdown}s
            </div>
          )}
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
            <div className="text-xl font-bold mb-2">Session Ended</div>
            <p className="text-slate-400 mt-2 text-sm">Scores have been saved and students have been notified.</p>
            <button onClick={() => navigate(-1)} className="mt-6 rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20">
              Back to course
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column: time limit + question list */}
            <div className="lg:col-span-1 space-y-4">
              {/* Time limit control */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Time per question</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={timeLimitActive}
                    onChange={(e) => setTimeLimitActive(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-slate-300">Enable countdown</span>
                </label>
                {timeLimitActive && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={timeLimitSecs}
                      onChange={(e) => setTimeLimitSecs(Number(e.target.value))}
                      className="w-20 rounded-lg bg-white/10 border border-white/20 px-2 py-1 text-sm text-white text-center"
                    />
                    <span className="text-xs text-slate-400">seconds</span>
                  </div>
                )}
                <button
                  onClick={applyTimeLimit}
                  className="w-full rounded-lg bg-violet-600/50 hover:bg-violet-600 px-3 py-1.5 text-xs font-semibold transition"
                >
                  Apply
                </button>
              </div>

              {/* Question list */}
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Questions ({questions.length})</div>
                <div className="space-y-2">
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
                </div>
              </div>

              <button
                onClick={endSession}
                className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
              >
                End Session & Save Scores
              </button>
            </div>

            {/* Right column: live view */}
            <div className="lg:col-span-2 space-y-4">
              {currentIdx === -1 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-10 text-center">
                  <div className="text-sm font-semibold text-slate-300">Select a question to push it live</div>
                  <p className="text-xs text-slate-500 mt-1">Students will see it immediately on their screen.</p>
                </div>
              ) : current ? (
                <>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold bg-violet-500 text-white px-2 py-0.5 rounded-full">Q{currentIdx + 1}</span>
                      {accepting && <span className="text-xs text-amber-300 animate-pulse font-medium">Accepting answers…</span>}
                      {countdown !== null && (
                        <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full ${countdown <= 5 ? "bg-rose-500/40 text-rose-200" : "bg-amber-500/20 text-amber-300"}`}>
                          {countdown}s
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white mb-4">{current.question_text}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["A", "B", "C", "D"] as const).map((opt) => {
                        const text = current[`option_${opt.toLowerCase()}` as keyof Question] as string;
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
                            {!accepting && (
                              <div className="absolute bottom-0 left-0 h-1 bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

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
