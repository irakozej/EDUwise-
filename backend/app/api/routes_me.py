from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles, get_current_user
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.enrollment import Enrollment
from app.models.course import Course, Module, Lesson
from app.models.progress import LessonProgress
from app.models.quiz import Quiz, QuizAttempt

router = APIRouter()


# ── Profile ───────────────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


def _profile_out(user: User) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "created_at": str(user.created_at),
    }


@router.get("/me/profile")
def get_my_profile(
    user: User = Depends(get_current_user),
):
    return _profile_out(user)


@router.patch("/me/profile")
def update_my_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.full_name is not None:
        stripped = payload.full_name.strip()
        if not stripped:
            raise HTTPException(400, "full_name cannot be empty")
        user.full_name = stripped
    if payload.bio is not None:
        user.bio = payload.bio or None
    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url or None
    db.commit()
    db.refresh(user)
    return _profile_out(user)


@router.get("/users/{user_id}/profile")
def get_user_profile(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Public profile — any authenticated user can view another's basic info."""
    target = db.get(User, user_id)
    if not target or not target.is_active:
        raise HTTPException(404, "User not found")
    return _profile_out(target)

@router.get("/me/courses")
def my_courses_student(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    enrolls = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == user.id, Enrollment.status == "active")
        .all()
    )

    results = []
    for e in enrolls:
        course = db.get(Course, e.course_id)
        if not course:
            continue

        # total lessons in course
        total_lessons = (
            db.query(func.count(Lesson.id))
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id == course.id)
            .scalar()
        ) or 0

        # completed lessons for student
        completed_lessons = (
            db.query(func.count(LessonProgress.id))
            .filter(LessonProgress.student_id == user.id, LessonProgress.progress_pct >= 100)
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id == course.id)
            .scalar()
        ) or 0

        # average quiz score for that course
        avg_score = (
            db.query(func.avg(QuizAttempt.score_pct))
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .filter(QuizAttempt.student_id == user.id)
            .join(Lesson, Lesson.id == Quiz.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id == course.id)
            .scalar()
        )
        avg_score = float(avg_score) if avg_score is not None else None

        progress_pct = int(round((completed_lessons / total_lessons) * 100)) if total_lessons else 0

        results.append({
            "course_id": course.id,
            "title": course.title,
            "description": course.description,
            "progress_pct": progress_pct,
            "lessons_completed": completed_lessons,
            "lessons_total": total_lessons,
            "avg_quiz_score": avg_score,
        })

    return {"items": results}


@router.get("/me/teaching")
def my_courses_teacher(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    courses = db.query(Course).filter(Course.teacher_id == user.id).all()

    items = []
    for c in courses:
        enrollment_count = (
            db.query(func.count(Enrollment.id))
            .filter(Enrollment.course_id == c.id, Enrollment.status == "active")
            .scalar()
        ) or 0

        items.append({
            "course_id": c.id,
            "title": c.title,
            "description": c.description,
            "enrollments": enrollment_count,
        })

    return {"items": items}