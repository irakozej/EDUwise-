from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.announcement import Announcement
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.services.audit import log_action

router = APIRouter()


class AnnouncementCreate(BaseModel):
    title: str
    body: Optional[str] = None


class AnnouncementOut(BaseModel):
    id: int
    course_id: int
    teacher_id: int
    title: str
    body: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


def _ensure_teacher_owns(user: User, course: Course) -> None:
    if user.role == UserRole.admin:
        return
    if course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")


def _ensure_enrolled(db: Session, student_id: int, course_id: int) -> None:
    e = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.course_id == course_id,
        Enrollment.status == "active",
    ).first()
    if not e:
        raise HTTPException(403, "You are not enrolled in this course")


# ── Teacher: create announcement ──────────────────────────────────────────────

@router.post("/courses/{course_id}/announcements", response_model=AnnouncementOut, status_code=201)
def create_announcement(
    course_id: int,
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    _ensure_teacher_owns(user, course)

    ann = Announcement(
        course_id=course_id,
        teacher_id=user.id,
        title=payload.title.strip(),
        body=payload.body,
    )
    db.add(ann)
    db.flush()  # get ann.id before notifications

    # Notify all active enrolled students
    enrolled_students = (
        db.query(Enrollment.student_id)
        .filter(Enrollment.course_id == course_id, Enrollment.status == "active")
        .all()
    )
    for (student_id,) in enrolled_students:
        db.add(Notification(
            recipient_id=student_id,
            type="announcement",
            title=f"New announcement in {course.title}",
            body=payload.title,
            link="/student/courses",
        ))

    db.commit()
    db.refresh(ann)

    log_action(db, user.id, "CREATE", "Announcement", str(ann.id))
    return ann


# ── List announcements (teacher + enrolled student) ───────────────────────────

@router.get("/courses/{course_id}/announcements", response_model=list[AnnouncementOut])
def list_announcements(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    if user.role == UserRole.student:
        _ensure_enrolled(db, user.id, course_id)

    return (
        db.query(Announcement)
        .filter(Announcement.course_id == course_id)
        .order_by(Announcement.created_at.desc())
        .all()
    )


# ── Teacher: delete announcement ──────────────────────────────────────────────

@router.delete("/announcements/{announcement_id}", status_code=204)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    ann = db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(404, "Announcement not found")

    course = db.get(Course, ann.course_id)
    _ensure_teacher_owns(user, course)

    db.delete(ann)
    db.commit()
    log_action(db, user.id, "DELETE", "Announcement", str(announcement_id))
