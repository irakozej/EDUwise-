from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.event import Event
from app.models.enrollment import Enrollment
from app.schemas.events import EventCreate
from app.api.deps import require_roles
from app.services.audit import log_action

router = APIRouter()

@router.post("/events", status_code=201)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    # If course_id is provided, enforce enrollment
    if payload.course_id is not None:
        enrolled = db.query(Enrollment).filter(
            Enrollment.student_id == user.id,
            Enrollment.course_id == payload.course_id,
            Enrollment.status == "active",
        ).first()
        if not enrolled:
            raise HTTPException(403, "Student not enrolled in this course")

    e = Event(
    student_id=user.id,
    course_id=payload.course_id,
    lesson_id=payload.lesson_id,
    event_type=payload.event_type,
    event_metadata=payload.metadata,
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    log_action(db, user.id, "CREATE", "Event", str(e.id))

    # Auto-update lesson progress when a student opens a lesson
    if payload.event_type == "lesson_open" and payload.lesson_id is not None:
        try:
            from app.services.progress import auto_update_progress
            auto_update_progress(db, user.id, payload.lesson_id)
        except Exception:
            pass  # never break event logging

    return {"status": "ok", "event_id": e.id}