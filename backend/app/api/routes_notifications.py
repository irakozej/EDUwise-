from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User

router = APIRouter()


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str | None
    link: str | None
    is_read: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── List my notifications ─────────────────────────────────────────────────────

@router.get("/me/notifications", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=30, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Notification).filter(Notification.recipient_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    return q.order_by(Notification.created_at.desc()).limit(limit).all()


# ── Unread count ──────────────────────────────────────────────────────────────

@router.get("/me/notifications/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import func
    count = (
        db.query(func.count(Notification.id))
        .filter(Notification.recipient_id == user.id, Notification.is_read == False)  # noqa: E712
        .scalar()
        or 0
    )
    return {"count": count}


# ── Mark single notification as read ─────────────────────────────────────────

@router.patch("/me/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = db.get(Notification, notification_id)
    if not n or n.recipient_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


# ── Mark all as read ──────────────────────────────────────────────────────────

@router.post("/me/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.recipient_id == user.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}


# ── Delete a notification ─────────────────────────────────────────────────────

@router.delete("/me/notifications/{notification_id}", status_code=204)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = db.get(Notification, notification_id)
    if not n or n.recipient_id != user.id:
        raise HTTPException(404, "Notification not found")
    db.delete(n)
    db.commit()
