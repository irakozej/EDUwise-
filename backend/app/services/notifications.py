"""Central helper for creating in-app notifications and sending email notifications."""
import asyncio
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
    """Insert a Notification row, push via WebSocket, and send email. Call db.commit() after."""
    notif = Notification(
        recipient_id=recipient_id,
        type=type_,
        title=title,
        body=body,
        link=link,
    )
    db.add(notif)

    # Push real-time via WebSocket (fire-and-forget, non-blocking)
    def _ws_push():
        from app.services.ws_manager import ws_manager
        payload = {
            "event": "notification",
            "type": type_,
            "title": title,
            "body": body,
            "link": link,
        }
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(ws_manager.send_to_user(recipient_id, payload))
            loop.close()
        except Exception:
            pass

    threading.Thread(target=_ws_push, daemon=True).start()

    # Send email in a background thread so it never blocks the request
    user = db.get(User, recipient_id)
    if user and user.email:
        email = user.email

        def _send():
            send_notification_email(email, title, body, link)

        threading.Thread(target=_send, daemon=True).start()
