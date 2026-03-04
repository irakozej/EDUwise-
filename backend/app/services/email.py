"""
Email service for EDUwise.

Configure via environment variables:
  SMTP_HOST     — SMTP server hostname (e.g. smtp.gmail.com)
  SMTP_PORT     — SMTP port (default 587)
  SMTP_USER     — SMTP username / sender address
  SMTP_PASS     — SMTP password or app password
  FRONTEND_URL  — Base URL of the frontend (default http://localhost:5173)

If SMTP_HOST or SMTP_USER is not set, the reset link is printed to the
backend console instead (development mode).
"""

from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER)


def send_notification_email(to_email: str, title: str, body: str | None, link: str | None) -> None:
    """Send a general notification email. Silently falls back to console log if SMTP not configured."""
    if not _smtp_configured():
        print(f"\n[EMAIL] Notification to {to_email}: {title}")
        if body:
            print(f"[EMAIL] {body}")
        if link:
            print(f"[EMAIL] Link: {FRONTEND_URL}{link}\n")
        return

    cta_html = ""
    if link:
        url = f"{FRONTEND_URL}{link}"
        cta_html = f"""
        <div style="margin:24px 0;text-align:center;">
          <a href="{url}" style="background:#0284c7;color:#fff;padding:11px 26px;border-radius:8px;text-decoration:none;font-weight:600;">
            View in EDUwise
          </a>
        </div>"""

    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;">
      <h2 style="color:#0284c7;margin-bottom:4px;">EDUwise</h2>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:20px;">
      <h3 style="color:#1e293b;margin-bottom:8px;">{title}</h3>
      {f'<p style="color:#475569;font-size:14px;line-height:1.6;">{body}</p>' if body else ''}
      {cta_html}
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">
        You received this email because you have an EDUwise account.<br>
        Log in to manage your notification preferences.
      </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"EDUwise — {title}"
    msg["From"] = SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
    except Exception as exc:
        print(f"[EMAIL] Failed to send to {to_email}: {exc}")


def send_password_reset_email(to_email: str, token: str) -> None:
    """Send a password-reset email. Falls back to console logging in dev mode."""
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    if not _smtp_configured():
        print(f"\n[EMAIL] Password reset for {to_email}")
        print(f"[EMAIL] Reset link: {reset_link}\n")
        return

    subject = "EDUwise — Password Reset Request"
    html_body = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;">
      <h2 style="color:#0284c7;">EDUwise Password Reset</h2>
      <p>We received a request to reset the password for your account (<strong>{to_email}</strong>).</p>
      <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <div style="margin:32px 0;text-align:center;">
        <a href="{reset_link}" style="background:#0284c7;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
          Reset Password
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;">If you did not request a password reset, you can safely ignore this email.</p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, msg.as_string())
