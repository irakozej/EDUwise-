"""Central helper for creating in-app notifications and sending email notifications."""
import threading

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.services.email import send_notification_email


def push_notification(
    db: Session,
    recipient_id: int,
    type_: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
) -> None:
    """Insert a Notification row and send an email. Call db.commit() after."""
    db.add(
        Notification(
            recipient_id=recipient_id,
            type=type_,
            title=title,
            body=body,
            link=link,
        )
    )

    # Send email in a background thread so it never blocks the request
    user = db.get(User, recipient_id)
    if user and user.email:
        email = user.email

        def _send():
            send_notification_email(email, title, body, link)

        threading.Thread(target=_send, daemon=True).start()
