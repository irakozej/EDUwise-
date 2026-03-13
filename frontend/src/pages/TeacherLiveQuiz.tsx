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

const OPTS = ["A", "B", "C", "D"] as const;

function wsUrl(quizId: string): string {
  const token = getAccessToken() ?? "";
  const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;
  let origin: string;
  try { origin = new URL(apiUrl).origin; } catch { origin = window.location.origin; }
  const base = origin.replace(/^http/, "ws");
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
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({ A: 0, B: 0, C: 0, D: 0 });
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [timeLimitSecs, setTimeLimitSecs] = useState(30);
  const [timeLimitActive, setTimeLimitActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [correctOption, setCorrectOption] = useState<string | null>(null);
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
        setCorrectOption(null);
      }
      if (msg.event === "tally") {
        setResponded(msg.responded ?? 0);
        setParticipants(msg.total ?? 0);
        if (msg.counts) setLiveCounts(msg.counts);
      }
      if (msg.event === "results") {
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
    setLiveCounts({ A: 0, B: 0, C: 0, D: 0 });
    setCorrectOption(null);
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
    const q = questions[currentIdx];
    if (q) setCorrectOption(q.correct_option);
    send({ event: "close_answers" });
  }

  function endSession() {
    clearCountdown();
    send({ event: "end_session" });
    setSessionEnded(true);
  }

  const current = questions[currentIdx];
  const totalAnswered = Object.values(liveCounts).reduce((a, b) => a + b, 0);

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

      <div className="mx-auto max-w-5xl px-6 py-8">
        {sessionEnded ? (
          <div className="text-center py-20">
            <div className="text-xl font-bold mb-2">Session Ended</div>
            <p className="text-slate-400 mt-2 text-sm">Scores have been saved and students have been notified.</p>
            <button onClick={() => navigate(-1)} className="mt-6 rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20">
              Back to course
            </button>
          </div>
        ) : !sessionStarted ? (
          /* ── Lobby ── */
          <div className="max-w-md mx-auto mt-16 space-y-6 text-center">
            <div>
              <div className="text-2xl font-bold">{quiz?.title ?? "Live Quiz"}</div>
              <p className="text-slate-400 text-sm mt-1">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 px-8 py-6">
              <div className="text-5xl font-black text-violet-300">{participants}</div>
              <div className="text-sm text-slate-400 mt-1">student{participants !== 1 ? "s" : ""} joined</div>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Waiting for students to join…
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-left space-y-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Time per question</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={timeLimitActive} onChange={(e) => setTimeLimitActive(e.target.checked)} className="rounded" />
                <span className="text-xs text-slate-300">Enable countdown timer</span>
              </label>
              {timeLimitActive && (
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={5} max={300} value={timeLimitSecs}
                    onChange={(e) => setTimeLimitSecs(Number(e.target.value))}
                    className="w-20 rounded-lg bg-white/10 border border-white/20 px-2 py-1 text-sm text-white text-center"
                  />
                  <span className="text-xs text-slate-400">seconds per question</span>
                </div>
              )}
            </div>

            <button
              onClick={() => { applyTimeLimit(); setSessionStarted(true); }}
              disabled={!connected || questions.length === 0}
              className="w-full rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-6 py-4 text-base font-bold transition"
            >
              Start Quiz
            </button>
            {questions.length === 0 && (
              <p className="text-xs text-rose-400">This quiz has no questions yet. Go back and add questions first.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* ── Left panel: question list ── */}
            <div className="lg:col-span-1 space-y-4">
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">Timer</span>
                <span className="text-xs font-semibold text-slate-300">
                  {timeLimitActive ? `${timeLimitSecs}s per question` : "No limit"}
                </span>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  Questions ({questions.length})
                </div>
                <div className="space-y-1.5">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => pushQuestion(i)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 transition ${
                        currentIdx === i
                          ? "bg-violet-600 text-white"
                          : "bg-white/5 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 text-[10px] font-black mt-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                          currentIdx === i ? "bg-white/20" : "bg-white/10"
                        }`}>
                          {i + 1}
                        </span>
                        <span className="text-xs line-clamp-2">{q.question_text}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={endSession}
                className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
              >
                End Session & Save Scores
              </button>
            </div>

            {/* ── Right panel: live question + bar chart ── */}
            <div className="lg:col-span-2 space-y-4">
              {currentIdx === -1 ? (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-12 text-center">
                  <div className="text-3xl mb-3">👈</div>
                  <div className="text-sm font-semibold text-slate-300">Click a question to push it live</div>
                  <p className="text-xs text-slate-500 mt-1">Students will see it instantly on their screen.</p>
                </div>
              ) : current ? (
                <>
                  {/* Question card */}
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs font-bold bg-violet-500 text-white px-2 py-0.5 rounded-full">Q{currentIdx + 1}</span>
                      {accepting && (
                        <span className="flex items-center gap-1 text-xs text-amber-300 animate-pulse font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          Accepting answers…
                        </span>
                      )}
                      {!accepting && correctOption && (
                        <span className="text-xs text-emerald-400 font-semibold">Correct: {correctOption}</span>
                      )}
                      {countdown !== null && (
                        <span className={`ml-auto text-sm font-black px-3 py-0.5 rounded-full ${countdown <= 5 ? "bg-rose-500/40 text-rose-200 animate-pulse" : "bg-amber-500/20 text-amber-300"}`}>
                          {countdown}s
                        </span>
                      )}
                    </div>
                    <div className="text-base font-semibold text-white mb-5 leading-snug">{current.question_text}</div>

                    {/* ── Real-time bar chart ── */}
                    <div className="space-y-3">
                      {OPTS.map((opt) => {
                        const text = current[`option_${opt.toLowerCase()}` as keyof Question] as string;
                        const count = liveCounts[opt] ?? 0;
                        const pct = totalAnswered > 0 ? Math.round((count / totalAnswered) * 100) : 0;
                        const isCorrect = !accepting && opt === correctOption;
                        return (
                          <div key={opt}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                  isCorrect ? "bg-emerald-500 text-white" : "bg-white/15 text-slate-300"
                                }`}>{opt}</span>
                                <span className="text-xs text-slate-200 truncate">{text}</span>
                              </div>
                              <span className="shrink-0 text-xs font-bold text-white ml-2">
                                {count} <span className="text-slate-400 font-normal">({pct}%)</span>
                              </span>
                            </div>
                            <div className="w-full h-5 rounded-lg bg-white/10 overflow-hidden">
                              <div
                                className={`h-full rounded-lg transition-all duration-500 ${
                                  isCorrect ? "bg-emerald-500" :
                                  accepting ? "bg-violet-500" : "bg-slate-500"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Response counter + action buttons */}
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
