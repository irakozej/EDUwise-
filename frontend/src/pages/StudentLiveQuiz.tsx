import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAccessToken } from "../lib/auth";

type LiveQuestion = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: string;
};

function wsUrl(quizId: string): string {
  const token = getAccessToken() ?? "";
  const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;
  let origin: string;
  try { origin = new URL(apiUrl).origin; } catch { origin = window.location.origin; }
  const base = origin.replace(/^http/, "ws");
  return `${base}/ws/quiz/${quizId}?token=${encodeURIComponent(token)}`;
}

export default function StudentLiveQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [connected, setConnected] = useState(false);
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }

  useEffect(() => {
    if (!quizId) return;
    const ws = new WebSocket(wsUrl(quizId));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string);

      if (msg.event === "state") {
        if (msg.question) {
          setQuestion(msg.question);
          setAccepting(msg.accepting ?? false);
          setSelected(null);
          setCorrect(null);
        }
      }

      if (msg.event === "question") {
        setQuestion(msg.question);
        setAccepting(true);
        setSelected(null);
        setCorrect(null);
        clearCountdown();

        const limit = msg.time_limit;
        if (limit && limit > 0) {
          let remaining = limit;
          setCountdown(remaining);
          countdownRef.current = setInterval(() => {
            remaining -= 1;
            setCountdown(remaining);
            if (remaining <= 0) clearCountdown();
          }, 1000);
        }
      }

      if (msg.event === "answers_closed") {
        setAccepting(false);
        setCorrect(msg.correct ?? null);
        clearCountdown();
      }

      if (msg.event === "session_ended") {
        setSessionEnded(true);
        setFinalScore(msg.score_pct ?? null);
        clearCountdown();
      }
    };

    return () => { ws.close(); clearCountdown(); };
  }, [quizId]);

  function submitAnswer(opt: string) {
    if (!accepting || selected) return;
    setSelected(opt);
    wsRef.current?.send(JSON.stringify({ event: "answer", option: opt }));
  }

  const options = question
    ? [
        { key: "A", text: question.option_a },
        { key: "B", text: question.option_b },
        { key: "C", text: question.option_c },
        { key: "D", text: question.option_d },
      ]
    : [];

  function optStyle(key: string) {
    if (!selected) return "bg-white/10 border-white/20 hover:bg-white/20 cursor-pointer";
    if (!correct) {
      return key === selected
        ? "bg-violet-600 border-violet-400 cursor-default"
        : "bg-white/5 border-white/10 opacity-50 cursor-default";
    }
    if (key === correct) return "bg-emerald-500 border-emerald-400 cursor-default";
    if (key === selected && key !== correct) return "bg-rose-500 border-rose-400 cursor-default";
    return "bg-white/5 border-white/10 opacity-40 cursor-default";
  }

  const scoreColor = finalScore !== null
    ? finalScore >= 70 ? "text-emerald-300" : finalScore >= 50 ? "text-amber-300" : "text-rose-300"
    : "text-slate-300";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-950 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-sm font-bold">Live Quiz</span>
        </div>
        <div className="flex items-center gap-3">
          {countdown !== null && (
            <div className={`text-sm font-black px-3 py-1 rounded-full ${countdown <= 5 ? "bg-rose-500/30 text-rose-300 animate-pulse" : "bg-amber-500/20 text-amber-300"}`}>
              {countdown}s
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${connected ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {connected ? "Connected" : "Connecting…"}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        {sessionEnded ? (
          <div className="text-center space-y-4">
            <div className="text-xl font-bold">Quiz Ended</div>
            {finalScore !== null && (
              <div className="rounded-2xl bg-white/5 border border-white/10 px-8 py-6 text-center">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Your Score</div>
                <div className={`text-5xl font-black ${scoreColor}`}>{finalScore}%</div>
                <p className="mt-3 text-sm text-slate-400">
                  {finalScore >= 70 ? "Great job!" : finalScore >= 50 ? "Good effort — keep practicing!" : "Keep studying and try again!"}
                </p>
              </div>
            )}
            <button onClick={() => navigate(-1)} className="rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20">
              Back to course
            </button>
          </div>
        ) : !question ? (
          <div className="text-center">
            <div className="mx-auto mb-4 relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-sky-400 border-t-transparent animate-spin" />
            </div>
            <div className="text-lg font-semibold text-slate-300">Waiting for the teacher…</div>
            <p className="text-xs text-slate-500 mt-2">Stay on this page — questions will appear automatically.</p>
          </div>
        ) : (
          <div className="w-full max-w-xl space-y-5">
            {/* Countdown bar */}
            {countdown !== null && (
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${countdown <= 5 ? "bg-rose-400" : "bg-amber-400"}`}
                  style={{ width: `${(countdown / (countdown + 1)) * 100}%` }}
                />
              </div>
            )}

            {/* Question */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-[10px] font-bold uppercase tracking-widest text-violet-300 mb-3">Question</div>
              <div className="text-lg font-semibold leading-snug">{question.question_text}</div>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 gap-3">
              {options.map(({ key, text }) => (
                <button
                  key={key}
                  onClick={() => submitAnswer(key)}
                  className={`rounded-xl border px-5 py-4 text-left transition-all ${optStyle(key)}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">{key}</span>
                    <span className="text-sm font-medium">{text}</span>
                    {correct && key === correct && <span className="ml-auto text-lg">✓</span>}
                    {correct && key === selected && key !== correct && <span className="ml-auto text-lg">✗</span>}
                  </div>
                </button>
              ))}
            </div>

            {/* Status */}
            <div className="text-center text-xs text-slate-400">
              {!selected && accepting && "Tap an option to answer"}
              {selected && accepting && "Answer submitted — waiting for teacher to close…"}
              {!accepting && !correct && selected && "Waiting for results…"}
              {correct && selected === correct && <span className="text-emerald-400 font-semibold">Correct!</span>}
              {correct && selected !== correct && <span className="text-rose-400 font-semibold">Incorrect — correct answer was {correct}</span>}
              {correct && !selected && <span className="text-slate-400">Time up. Correct: {correct}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
