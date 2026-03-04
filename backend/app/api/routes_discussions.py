from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.comment import Comment
from app.models.course import Lesson, Module
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.services.audit import log_action

router = APIRouter()


class CommentCreate(BaseModel):
    body: str


class CommentOut(BaseModel):
    id: int
    lesson_id: int
    author_id: int
    author_name: str
    author_role: str
    body: str
    created_at: datetime
    model_config = {"from_attributes": True}


def _get_module_course_for_lesson(db: Session, lesson_id: int):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    module = db.get(Module, lesson.module_id)
    return lesson, module


def _check_access(db: Session, user: User, lesson_id: int) -> None:
    """Student must be enrolled; teacher/admin always pass."""
    if user.role == UserRole.student:
        _, module = _get_module_course_for_lesson(db, lesson_id)
        enrolled = db.query(Enrollment).filter(
            Enrollment.student_id == user.id,
            Enrollment.course_id == module.course_id,
            Enrollment.status == "active",
        ).first()
        if not enrolled:
            raise HTTPException(403, "You are not enrolled in this course")


# ── Post a comment ────────────────────────────────────────────────────────────

@router.post("/lessons/{lesson_id}/comments", response_model=CommentOut, status_code=201)
def post_comment(
    lesson_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_access(db, user, lesson_id)

    if not payload.body.strip():
        raise HTTPException(400, "Comment body cannot be empty")

    comment = Comment(
        lesson_id=lesson_id,
        author_id=user.id,
        body=payload.body.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    log_action(db, user.id, "CREATE", "Comment", str(comment.id))

    # Award XP for discussion participation (students only)
    if user.role.value == "student":
        from app.services.gamification import award_xp
        award_xp(db, user.id, "discussion_post", comment.id)
        db.commit()

    return CommentOut(
        id=comment.id,
        lesson_id=comment.lesson_id,
        author_id=comment.author_id,
        author_name=user.full_name,
        author_role=user.role.value,
        body=comment.body,
        created_at=comment.created_at,
    )


# ── List comments for a lesson ────────────────────────────────────────────────

@router.get("/lessons/{lesson_id}/comments", response_model=list[CommentOut])
def list_comments(
    lesson_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_access(db, user, lesson_id)

    rows = (
        db.query(Comment, User)
        .join(User, User.id == Comment.author_id)
        .filter(Comment.lesson_id == lesson_id)
        .order_by(Comment.created_at.asc())
        .all()
    )

    return [
        CommentOut(
            id=c.id,
            lesson_id=c.lesson_id,
            author_id=c.author_id,
            author_name=u.full_name,
            author_role=u.role.value,
            body=c.body,
            created_at=c.created_at,
        )
        for c, u in rows
    ]


# ── Delete a comment ──────────────────────────────────────────────────────────

@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(404, "Comment not found")

    # Admin, teacher (of the course), or the original author can delete
    if user.role == UserRole.student and comment.author_id != user.id:
        raise HTTPException(403, "You can only delete your own comments")

    db.delete(comment)
    db.commit()
    log_action(db, user.id, "DELETE", "Comment", str(comment_id))
