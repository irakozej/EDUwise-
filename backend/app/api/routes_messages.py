from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.message import Message
from app.models.notification import Notification
from app.models.user import User

router = APIRouter()


class SendMessageRequest(BaseModel):
    body: str


def _user_snippet(u: User) -> dict:
    return {
        "id": u.id,
        "full_name": u.full_name,
        "role": u.role,
        "avatar_url": u.avatar_url,
    }


# ── Unread count ──────────────────────────────────────────────────────────────

@router.get("/me/messages/unread-count")
def messages_unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = (
        db.query(func.count(Message.id))
        .filter(Message.recipient_id == user.id, Message.is_read == False)  # noqa: E712
        .scalar()
    ) or 0
    return {"count": count}


# ── Conversation list ─────────────────────────────────────────────────────────

@router.get("/me/messages/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Returns one entry per conversation partner, with the latest message
    and the count of unread messages from that partner.
    """
    # All distinct partner IDs
    sent_to = (
        db.query(Message.recipient_id.label("partner_id"))
        .filter(Message.sender_id == user.id)
    )
    received_from = (
        db.query(Message.sender_id.label("partner_id"))
        .filter(Message.recipient_id == user.id)
    )
    partner_ids = {row.partner_id for row in sent_to.union(received_from).all()}

    conversations = []
    for pid in partner_ids:
        partner = db.get(User, pid)
        if not partner:
            continue

        latest = (
            db.query(Message)
            .filter(
                or_(
                    and_(Message.sender_id == user.id, Message.recipient_id == pid),
                    and_(Message.sender_id == pid, Message.recipient_id == user.id),
                )
            )
            .order_by(Message.created_at.desc())
            .first()
        )

        unread = (
            db.query(func.count(Message.id))
            .filter(
                Message.sender_id == pid,
                Message.recipient_id == user.id,
                Message.is_read == False,  # noqa: E712
            )
            .scalar()
        ) or 0

        conversations.append({
            "partner": _user_snippet(partner),
            "latest_message": {
                "id": latest.id,
                "body": latest.body,
                "sender_id": latest.sender_id,
                "created_at": str(latest.created_at),
            } if latest else None,
            "unread_count": unread,
        })

    # Sort by latest message timestamp descending
    conversations.sort(
        key=lambda c: c["latest_message"]["created_at"] if c["latest_message"] else "",
        reverse=True,
    )
    return conversations


# ── Message thread ────────────────────────────────────────────────────────────

@router.get("/me/messages/{partner_id}")
def get_thread(
    partner_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    partner = db.get(User, partner_id)
    if not partner or not partner.is_active:
        raise HTTPException(404, "User not found")

    messages = (
        db.query(Message)
        .filter(
            or_(
                and_(Message.sender_id == user.id, Message.recipient_id == partner_id),
                and_(Message.sender_id == partner_id, Message.recipient_id == user.id),
            )
        )
        .order_by(Message.created_at.asc())
        .all()
    )

    # Mark incoming messages as read
    unread_ids = [m.id for m in messages if m.recipient_id == user.id and not m.is_read]
    if unread_ids:
        db.query(Message).filter(Message.id.in_(unread_ids)).update(
            {"is_read": True}, synchronize_session=False
        )
        db.commit()

    return {
        "partner": _user_snippet(partner),
        "messages": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "body": m.body,
                "is_read": m.is_read,
                "created_at": str(m.created_at),
            }
            for m in messages
        ],
    }


# ── Send message ──────────────────────────────────────────────────────────────

@router.post("/me/messages/{partner_id}", status_code=201)
def send_message(
    partner_id: int,
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload.body.strip():
        raise HTTPException(400, "Message body cannot be empty")

    partner = db.get(User, partner_id)
    if not partner or not partner.is_active:
        raise HTTPException(404, "User not found")

    if partner_id == user.id:
        raise HTTPException(400, "Cannot send a message to yourself")

    msg = Message(
        sender_id=user.id,
        recipient_id=partner_id,
        body=payload.body.strip(),
    )
    db.add(msg)

    # Push in-app notification to recipient
    notif = Notification(
        recipient_id=partner_id,
        type="direct_message",
        title=f"New message from {user.full_name}",
        body=payload.body.strip()[:120],
        link=f"/messages/{user.id}",
    )
    db.add(notif)
    db.commit()
    db.refresh(msg)

    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "recipient_id": msg.recipient_id,
        "body": msg.body,
        "created_at": str(msg.created_at),
    }
