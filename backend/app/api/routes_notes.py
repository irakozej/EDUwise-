from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.course import Lesson, Module
from app.models.enrollment import Enrollment
from app.models.note import StudentNote
from app.models.course import Course
from app.models.user import User, UserRole

router = APIRouter()


class NoteUpsert(BaseModel):
    content_html: str


@router.get("/me/notes/{lesson_id}")
def get_note(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != UserRole.student:
        raise HTTPException(403, "Students only")
    note = (
        db.query(StudentNote)
        .filter(StudentNote.student_id == user.id, StudentNote.lesson_id == lesson_id)
        .first()
    )
    if not note:
        return {"content_html": "", "updated_at": None}
    return {"content_html": note.content_html or "", "updated_at": note.updated_at}


@router.put("/me/notes/{lesson_id}")
def upsert_note(
    lesson_id: int,
    payload: NoteUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.student:
        raise HTTPException(403, "Students only")

    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    note = (
        db.query(StudentNote)
        .filter(StudentNote.student_id == user.id, StudentNote.lesson_id == lesson_id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if note:
        note.content_html = payload.content_html
        note.updated_at = now
    else:
        note = StudentNote(
            student_id=user.id,
            lesson_id=lesson_id,
            content_html=payload.content_html,
        )
        db.add(note)
    db.commit()
    db.refresh(note)
    return {"content_html": note.content_html, "updated_at": note.updated_at}


@router.get("/me/notes")
def list_notes(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != UserRole.student:
        raise HTTPException(403, "Students only")

    rows = (
        db.query(StudentNote, Lesson, Module, Course)
        .join(Lesson, StudentNote.lesson_id == Lesson.id)
        .join(Module, Lesson.module_id == Module.id)
        .join(Course, Module.course_id == Course.id)
        .filter(StudentNote.student_id == user.id)
        .order_by(StudentNote.updated_at.desc())
        .all()
    )

    return [
        {
            "lesson_id": note.lesson_id,
            "lesson_title": lesson.title,
            "course_id": course.id,
            "course_title": course.title,
            "content_html": note.content_html,
            "updated_at": note.updated_at,
        }
        for note, lesson, module, course in rows
    ]
