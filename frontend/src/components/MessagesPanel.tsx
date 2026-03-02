import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConversationPartner = {
  id: number;
  full_name: string;
  role: string;
  avatar_url: string | null;
};

type LatestMessage = {
  id: number;
  body: string;
  sender_id: number;
  created_at: string;
};

type Conversation = {
  partner: ConversationPartner;
  latest_message: LatestMessage | null;
  unread_count: number;
};

type Message = {
  id: number;
  sender_id: number;
  body: string;
  is_read: boolean;
  created_at: string;
};

type Thread = {
  partner: ConversationPartner;
  messages: Message[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Avatar({ user, size = "md" }: { user: ConversationPartner; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name}
        className={`${sz} rounded-xl object-cover border border-slate-200 shrink-0`}
      />
    );
  }
  return (
    <div className={`${sz} rounded-xl bg-slate-800 text-white grid place-items-center font-semibold shrink-0`}>
      {initials(user.full_name)}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  currentUserId: number;
  /** If set, opens directly into a thread with this partner */
  openPartnerId?: number;
  onClose: () => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MessagesPanel({ currentUserId, openPartnerId, onClose }: Props) {
  const [view, setView] = useState<"list" | "thread">("list");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversation list
  async function loadConversations() {
    setLoadingList(true);
    try {
      const [convRes, unreadRes] = await Promise.all([
        api.get<Conversation[]>("/api/v1/me/messages/conversations"),
        api.get<{ count: number }>("/api/v1/me/messages/unread-count"),
      ]);
      setConversations(convRes.data);
      setUnreadCount(unreadRes.data.count);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }

  // Open a thread with a specific partner
  async function openThread(partnerId: number) {
    setLoadingThread(true);
    setThread(null);
    setView("thread");
    setSendError("");
    try {
      const res = await api.get<Thread>(`/api/v1/me/messages/${partnerId}`);
      setThread(res.data);
      // Refresh unread count since we just read messages
      api.get<{ count: number }>("/api/v1/me/messages/unread-count")
        .then((r) => setUnreadCount(r.data.count))
        .catch(() => {});
    } catch {
      setView("list");
    } finally {
      setLoadingThread(false);
    }
  }

  // Send a message
  async function sendMessage() {
    if (!thread || !msgInput.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      await api.post(`/api/v1/me/messages/${thread.partner.id}`, {
        body: msgInput.trim(),
      });
      setMsgInput("");
      // Reload thread
      const res = await api.get<Thread>(`/api/v1/me/messages/${thread.partner.id}`);
      setThread(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setSendError(e?.response?.data?.detail || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  // Scroll to bottom when thread messages update
  useEffect(() => {
    if (thread) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread?.messages]);

  // Focus input when thread opens
  useEffect(() => {
    if (view === "thread") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [view]);

  // On mount: load conversations, open partner if specified
  useEffect(() => {
    loadConversations();
    if (openPartnerId) {
      openThread(openPartnerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPartnerId]);

  // Handle Enter key to send (Shift+Enter = new line)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-end p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex flex-col w-full sm:w-96 h-[600px] max-h-[90vh] rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 shrink-0">
          {view === "thread" && (
            <button
              onClick={() => { setView("list"); setThread(null); loadConversations(); }}
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Back"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <div className="flex-1 min-w-0">
            {view === "list" ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Messages</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
            ) : thread ? (
              <div className="flex items-center gap-2">
                <Avatar user={thread.partner} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{thread.partner.full_name}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{thread.partner.role}</div>
                </div>
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-900">Loading…</span>
            )}
          </div>

          {view === "list" && (
            <button
              onClick={loadConversations}
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Refresh"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Conversation List ── */}
        {view === "list" && (
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                <div className="text-slate-300">
                  <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="text-sm text-slate-500">No conversations yet</div>
                <div className="text-xs text-slate-400">Start a conversation from a student or course page</div>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.partner.id}
                  onClick={() => openThread(conv.partner.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 text-left"
                >
                  <Avatar user={conv.partner} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">{conv.partner.full_name}</span>
                      {conv.latest_message && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {timeAgo(conv.latest_message.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 truncate">
                        {conv.latest_message
                          ? (conv.latest_message.sender_id === currentUserId ? "You: " : "") + conv.latest_message.body
                          : "No messages yet"}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Thread View ── */}
        {view === "thread" && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadingThread ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading…</div>
              ) : thread && thread.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  No messages yet. Send the first one!
                </div>
              ) : thread ? (
                thread.messages.map((msg) => {
                  const isMine = msg.sender_id === currentUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                          isMine
                            ? "bg-slate-900 text-white rounded-br-sm"
                            : "bg-slate-100 text-slate-800 rounded-bl-sm"
                        }`}
                      >
                        <div>{msg.body}</div>
                        <div className={`mt-1 text-[10px] ${isMine ? "text-slate-400" : "text-slate-400"}`}>
                          {timeAgo(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Send input */}
            <div className="border-t border-slate-100 px-3 py-2 shrink-0">
              {sendError && (
                <div className="mb-2 text-xs text-rose-600">{sendError}</div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send)"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
                <button
                  onClick={sendMessage}
                  disabled={!msgInput.trim() || sending}
                  className="shrink-0 grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                  aria-label="Send"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
