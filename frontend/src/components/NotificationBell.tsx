import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { getAccessToken } from "../lib/auth";

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function typeColor(type: string): string {
  if (type === "assignment_graded") return "bg-emerald-100 text-emerald-700";
  if (type === "announcement") return "bg-amber-100 text-amber-700";
  if (type === "new_assignment") return "bg-sky-100 text-sky-700";
  if (type === "direct_message") return "bg-violet-100 text-violet-700";
  if (type === "risk_change") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function typeLabel(type: string): string {
  if (type === "assignment_graded") return "Graded";
  if (type === "announcement") return "Announcement";
  if (type === "new_assignment") return "Assignment";
  if (type === "direct_message") return "Message";
  if (type === "risk_change") return "Risk Alert";
  return type;
}

function wsUrl(): string {
  const token = getAccessToken() ?? "";
  const base = (import.meta.env.VITE_API_URL ?? window.location.origin)
    .replace(/^http/, "ws");
  return `${base}/ws/notifications?token=${encodeURIComponent(token)}`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Close panel on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    if (!getAccessToken()) return;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let dead = false;

    function connect() {
      if (dead) return;
      ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.event === "notification") {
            setUnread((n) => n + 1);
            setNotifications((prev) => [
              {
                id: Date.now(),
                type: msg.type,
                title: msg.title,
                body: msg.body ?? null,
                link: msg.link ?? null,
                is_read: false,
                created_at: new Date().toISOString(),
              },
              ...prev,
            ]);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingRef.current) clearInterval(pingRef.current);
        if (!dead) reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => ws.close();
    }

    // Load initial unread count via REST
    api.get<{ count: number }>("/api/v1/me/notifications/unread-count")
      .then((r) => setUnread(r.data.count))
      .catch(() => {});

    connect();

    return () => {
      dead = true;
      clearTimeout(reconnectTimer);
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, []);

  async function openPanel() {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      try {
        const res = await api.get<Notification[]>("/api/v1/me/notifications?limit=20");
        setNotifications(res.data);
        setUnread(0);
        api.post("/api/v1/me/notifications/read-all").catch(() => {});
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
  }

  async function dismiss(id: number) {
    await api.delete(`/api/v1/me/notifications/${id}`).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openPanel}
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        aria-label="Notifications"
        title={wsConnected ? "Live notifications active" : "Connecting…"}
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Live indicator dot */}
        <span className={`absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white ${wsConnected ? "bg-emerald-400" : "bg-slate-300"}`} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">Notifications</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${wsConnected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                {wsConnected ? "Live" : "Offline"}
              </span>
            </div>
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  await api.post("/api/v1/me/notifications/read-all").catch(() => {});
                  setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-0 ${!n.is_read ? "bg-slate-50/70" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor(n.type)}`}>
                        {typeLabel(n.type)}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(n.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-800 leading-snug">{n.title}</div>
                    {n.body && (
                      <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{n.body}</div>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(n.id)}
                    className="shrink-0 mt-0.5 text-slate-300 hover:text-slate-500 text-xs"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
