import hashlib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest, MeResponse
from app.services.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token
)
from app.services.audit import log_action
from app.api.deps import get_current_user
from jose import jwt, JWTError
from app.core.config import settings

router = APIRouter()

def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

@router.post("/auth/register", response_model=MeResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
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
