import { useState } from "react";
import { api } from "../lib/api";
import { setAccessToken } from "../lib/auth";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
};

export default function Login() {
  const [email, setEmail] = useState("student1@eduwise.com");
  const [password, setPassword] = useState("Passw0rd!");
  const [status, setStatus] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Logging in...");

    try {
      const res = await api.post<LoginResponse>("/api/v1/auth/login", { email, password });
      setAccessToken(res.data.access_token);
      setStatus("✅ Logged in. Redirecting...");
      window.location.href = "/student";
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Login failed";
      setStatus(`❌ ${msg}`);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h2>EduWise Login</h2>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          Password
          <input
            value={password}
            type="password"
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <button type="submit">Login</button>
      </form>
      <p style={{ marginTop: 12 }}>{status}</p>
      <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
        Token is sent without “Bearer” to match your backend auth.
      </p>
    </div>
  );
}