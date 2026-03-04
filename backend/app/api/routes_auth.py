import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.refresh_token import RefreshToken
from app.models.password_reset import PasswordResetToken
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest, MeResponse
from app.services.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token
)
from app.services.audit import log_action
from app.services.email import send_password_reset_email
from app.api.deps import get_current_user

_optional_bearer = HTTPBearer(auto_error=False)

router = APIRouter()

def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

@router.post("/auth/register", response_model=MeResponse)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Security(_optional_bearer),
):
    # admin / co_admin accounts require a valid privileged token
    privileged_roles = {UserRole.admin, UserRole.co_admin}
    if payload.role in privileged_roles:
        if not creds:
            raise HTTPException(status_code=403, detail="Only existing admins can create privileged accounts")
        try:
            token_payload = jwt.decode(creds.credentials, settings.JWT_SECRET, algorithms=["HS256"])
            if token_payload.get("type") != "access":
                raise HTTPException(status_code=403, detail="Invalid token")
            actor_id = int(token_payload.get("sub"))
        except (JWTError, ValueError):
            raise HTTPException(status_code=403, detail="Invalid or expired token")
        actor = db.get(User, actor_id)
        if not actor or actor.role not in privileged_roles or not actor.is_active:
            raise HTTPException(status_code=403, detail="Only admins can create privileged accounts")
        # Co-admins cannot create admin or co_admin — only The Admin can
        if actor.role == UserRole.co_admin:
            raise HTTPException(status_code=403, detail="Co-admins cannot create admin or co-admin accounts")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action(db, actor_user_id=user.id, action="REGISTER", entity="User", entity_id=str(user.id))

    return MeResponse(id=user.id, full_name=user.full_name, email=user.email, role=user.role)

@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access = create_access_token(subject=str(user.id), role=user.role.value)
    refresh = create_refresh_token(subject=str(user.id), role=user.role.value)

    db.add(RefreshToken(user_id=user.id, token_hash=_hash_token(refresh)))
    db.commit()

    log_action(db, actor_user_id=user.id, action="LOGIN", entity="User", entity_id=str(user.id))

    return TokenResponse(access_token=access, refresh_token=refresh)

@router.post("/auth/refresh", response_model=TokenResponse)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    raw = payload.refresh_token
    try:
        decoded = jwt.decode(raw, settings.JWT_SECRET, algorithms=["HS256"])
        if decoded.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = int(decoded.get("sub"))
        role = decoded.get("role")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    token_row = db.query(RefreshToken).filter(RefreshToken.token_hash == _hash_token(raw)).first()
    if not token_row or token_row.is_revoked:
        raise HTTPException(status_code=401, detail="Refresh token revoked or not found")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found/inactive")

    # rotate refresh token
    token_row.is_revoked = True
    db.commit()

    new_access = create_access_token(subject=str(user.id), role=user.role.value)
    new_refresh = create_refresh_token(subject=str(user.id), role=user.role.value)
    db.add(RefreshToken(user_id=user.id, token_hash=_hash_token(new_refresh)))
    db.commit()

    log_action(db, actor_user_id=user.id, action="REFRESH", entity="User", entity_id=str(user.id))

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)

@router.post("/auth/logout")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    raw = payload.refresh_token
    token_row = db.query(RefreshToken).filter(RefreshToken.token_hash == _hash_token(raw)).first()
    if token_row:
        token_row.is_revoked = True
        db.commit()
    return {"status": "ok"}

@router.get("/auth/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return MeResponse(id=user.id, full_name=user.full_name, email=user.email, role=user.role)


# ── Forgot / Reset password ───────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/auth/forgot-password", status_code=202)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Always returns 202 regardless of whether the email exists (prevents email enumeration).
    The reset link is emailed if SMTP is configured, otherwise printed to server logs.
    Token expires in 1 hour.
    """
    user = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if user and user.is_active:
        # Invalidate any existing unused tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,  # noqa: E712
        ).update({"used": True}, synchronize_session=False)

        raw_token = secrets.token_urlsafe(48)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(PasswordResetToken(user_id=user.id, token=raw_token, expires_at=expires))
        db.commit()

        try:
            send_password_reset_email(user.email, raw_token)
        except Exception as exc:
            # Never fail the request if email sending fails — link already in logs
            print(f"[EMAIL ERROR] {exc}")

    return {"status": "accepted", "message": "If that email is registered, a reset link has been sent."}


@router.post("/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Validate token and update the user's password."""
    if len(payload.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    token_row = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token == payload.token,
            PasswordResetToken.used == False,  # noqa: E712
        )
        .first()
    )

    if not token_row:
        raise HTTPException(400, "Invalid or already-used reset token")

    now = datetime.now(timezone.utc)
    expires = token_row.expires_at
    if expires.tzinfo is None:
        from datetime import timezone as tz
        expires = expires.replace(tzinfo=tz.utc)

    if now > expires:
        raise HTTPException(400, "Reset token has expired. Please request a new one.")

    user = db.get(User, token_row.user_id)
    if not user or not user.is_active:
        raise HTTPException(400, "User not found or inactive")

    user.password_hash = hash_password(payload.new_password)
    token_row.used = True
    db.commit()

    log_action(db, user.id, "PASSWORD_RESET", "User", str(user.id))
    return {"status": "ok", "message": "Password updated successfully. You can now log in."}
