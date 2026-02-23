import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { clearAccessToken, getAccessToken } from "../lib/auth";

type DashboardData = {
  student: { id: number; full_name: string; email: string };
  enrollments_active: number;
  lessons_total: number;
  progress: { avg_progress_pct: number; completed_progress_rows: number };
  quizzes: { published: number; attempts_total: number; avg_score_pct: number | null };
  events: { total: number; by_type: Record<string, number> };
};

type RiskData = {
  student_id: number;
  risk_score: number; // 0..1
  risk_label?: string;
  features?: Record<string, number>;
};

type Recommendation = {
  lesson_id?: number;
  resource_id?: number;
  title: string;
  reason?: string;
  url?: string | null;
  format?: string | null;
  difficulty?: string | null;
  topic?: string | null;
  course_id?: number;
};

type RecommendationsData = {
  student_id: number;
  course_ids?: number[];
  recommendations: Recommendation[];
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e6e6e6",
        borderRadius: 14,
        padding: 16,
        background: "#fff",
        boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "green" | "yellow" | "red" | "gray" }) {
  const bg =
    tone === "green"
      ? "#e9f8ef"
      : tone === "yellow"
      ? "#fff7e6"
      : tone === "red"
      ? "#ffecec"
      : "#f3f4f6";
  const fg =
    tone === "green"
      ? "#16794c"
      : tone === "yellow"
      ? "#8a5b00"
      : tone === "red"
      ? "#b42318"
      : "#374151";

  return (
    <span style={{ background: bg, color: fg, padding: "6px 10px", borderRadius: 999, fontSize: 12 }}>
      {text}
    </span>
  );
}

export default function StudentDashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [recs, setRecs] = useState<RecommendationsData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const token = useMemo(() => getAccessToken(), []);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [d, r, rec] = await Promise.all([
        api.get<DashboardData>("/api/v1/me/dashboard"),
        api.get<RiskData>("/api/v1/me/risk-score"),
        api.get<RecommendationsData>("/api/v1/me/recommendations"),
      ]);

      setDashboard(d.data);
      setRisk(r.data);
      setRecs(rec.data);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to load data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      window.location.href = "/";
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearAccessToken();
    window.location.href = "/";
  }

  const riskTone: "green" | "yellow" | "red" | "gray" = (() => {
    const s = risk?.risk_score;
    if (s === undefined || s === null) return "gray";
    if (s >= 0.7) return "red";
    if (s >= 0.4) return "yellow";
    return "green";
  })();

  const riskLabel = (() => {
    if (!risk) return "Unknown";
    if (risk.risk_label) return risk.risk_label;
    if (risk.risk_score >= 0.7) return "High risk";
    if (risk.risk_score >= 0.4) return "Medium risk";
    return "Low risk";
  })();

  return (
    <div style={{ background: "#fafafa", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Student Dashboard</h1>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
              {dashboard?.student?.full_name ? (
                <>
                  {dashboard.student.full_name} • {dashboard.student.email}
                </>
              ) : (
                "Your learning overview"
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={loadAll} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
              Refresh
            </button>
            <button
              onClick={logout}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {error && (
          <div
            style={{
              marginTop: 14,
              background: "#ffecec",
              border: "1px solid #ffd0d0",
              padding: 12,
              borderRadius: 12,
              color: "#b42318",
            }}
          >
            <b>❌ {error}</b>
            <div style={{ marginTop: 6, fontSize: 13, color: "#7a271a" }}>
              If this says “Not authenticated”, go back to the login page and login again.
            </div>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard
              label="Active enrollments"
              value={dashboard ? dashboard.enrollments_active : loading ? "…" : 0}
              sub="Courses you are enrolled in"
            />
            <StatCard
              label="Average progress"
              value={
                dashboard
                  ? `${dashboard.progress.avg_progress_pct}%`
                  : loading
                  ? "…"
                  : "0%"
              }
              sub={`${dashboard?.progress.completed_progress_rows ?? 0} lessons completed`}
            />
            <StatCard
              label="Quiz average"
              value={
                dashboard?.quizzes?.avg_score_pct !== null && dashboard?.quizzes?.avg_score_pct !== undefined
                  ? `${dashboard.quizzes.avg_score_pct}%`
                  : loading
                  ? "…"
                  : "—"
              }
              sub={`${dashboard?.quizzes?.attempts_total ?? 0} attempts`}
            />
            <div
              style={{
                border: "1px solid #e6e6e6",
                borderRadius: 14,
                padding: 16,
                background: "#fff",
                boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Risk</div>
                <Badge text={riskLabel} tone={riskTone} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                {risk ? `${Math.round(risk.risk_score * 100)}%` : loading ? "…" : "—"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Based on performance + engagement signals
              </div>
            </div>
          </div>
        </div>

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
          <div
            style={{
              border: "1px solid #e6e6e6",
              borderRadius: 14,
              padding: 16,
              background: "#fff",
              boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16 }}>Recommended next steps</h2>
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
              Recommendations are based only on your <b>enrolled courses</b>.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {loading && <div style={{ opacity: 0.7 }}>Loading recommendations…</div>}

              {!loading && recs?.recommendations?.length === 0 && (
                <div style={{ opacity: 0.7 }}>No recommendations yet. Try opening a lesson or updating progress.</div>
              )}

              {recs?.recommendations?.slice(0, 6).map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #efefef",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650 }}>{r.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {r.reason || "Recommended based on your learning signals"}
                      {r.topic ? ` • topic: ${r.topic}` : ""}
                      {r.difficulty ? ` • difficulty: ${r.difficulty}` : ""}
                      {r.format ? ` • format: ${r.format}` : ""}
                    </div>
                  </div>

                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        whiteSpace: "nowrap",
                        alignSelf: "center",
                        textDecoration: "none",
                        border: "1px solid #ddd",
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#fff",
                      }}
                    >
                      Open
                    </a>
                  ) : (
                    <span style={{ opacity: 0.5, alignSelf: "center" }}>—</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e6e6e6",
              borderRadius: 14,
              padding: 16,
              background: "#fff",
              boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16 }}>Activity</h2>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <StatCard label="Lessons total" value={dashboard ? dashboard.lessons_total : loading ? "…" : 0} />
              <StatCard label="Events tracked" value={dashboard ? dashboard.events.total : loading ? "…" : 0} />

              <div style={{ borderTop: "1px solid #eee", marginTop: 6, paddingTop: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Events breakdown</div>
                {loading && <div style={{ opacity: 0.7 }}>Loading…</div>}
                {!loading && dashboard && (
                  <div style={{ display: "grid", gap: 6 }}>
                    {Object.entries(dashboard.events.by_type || {}).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ opacity: 0.8 }}>{k}</span>
                        <span style={{ fontWeight: 650 }}>{v}</span>
                      </div>
                    ))}
                    {Object.keys(dashboard.events.by_type || {}).length === 0 && (
                      <div style={{ opacity: 0.7, fontSize: 13 }}>No events yet.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 18, opacity: 0.6, fontSize: 12 }}>
          EduWise • Student view
        </footer>
      </div>
    </div>
  );
}