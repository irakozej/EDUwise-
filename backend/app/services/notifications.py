"""Central helper for creating in-app notifications."""
from sqlalchemy.orm import Session
from app.models.notification import Notification


def push_notification(
    db: Session,
    recipient_id: int,
    type_: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
) -> None:
    """Insert a Notification row. Call db.commit() after."""
    db.add(
        Notification(
            recipient_id=recipient_id,
            type=type_,
            title=title,
            body=body,
            link=link,
        )
    )
