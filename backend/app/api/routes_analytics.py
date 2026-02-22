from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.course import Course, Module, Lesson
from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
from app.models.quiz import Quiz, QuizAttempt
from app.models.event import Event

router = APIRouter()


@router.get("/courses/{course_id}/analytics")
def course_analytics(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    # Only owner teacher (unless admin)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    # --- Enrollments ---
    enrollments = (
        db.query(func.count(Enrollment.id))
        .filter(Enrollment.course_id == course_id, Enrollment.status == "active")
        .scalar()
    ) or 0

    # --- Lessons count ---
    lessons_total = (
        db.query(func.count(Lesson.id))
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id)
        .scalar()
    ) or 0

    # --- Progress stats ---
    # avg progress across all LessonProgress rows for lessons in this course
    avg_progress = (
        db.query(func.avg(LessonProgress.progress_pct))
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id)
        .scalar()
    )
    avg_progress = float(avg_progress) if avg_progress is not None else None

    completed_count = (
        db.query(func.count(LessonProgress.id))
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id, LessonProgress.progress_pct >= 100)
        .scalar()
    ) or 0

    # --- Quizzes stats ---
    quizzes_published = (
        db.query(func.count(Quiz.id))
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id, Quiz.is_published == True)
        .scalar()
    ) or 0

    attempts_total = (
        db.query(func.count(QuizAttempt.id))
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id)
        .scalar()
    ) or 0

    avg_quiz_score = (
        db.query(func.avg(QuizAttempt.score_pct))
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id, QuizAttempt.is_submitted == True)
        .scalar()
    )
    avg_quiz_score = float(avg_quiz_score) if avg_quiz_score is not None else None

    # --- Events stats ---
    events_total = (
        db.query(func.count(Event.id))
        .filter(Event.course_id == course_id)
        .scalar()
    ) or 0

    # breakdown by event_type
    breakdown_rows = (
        db.query(Event.event_type, func.count(Event.id))
        .filter(Event.course_id == course_id)
        .group_by(Event.event_type)
        .all()
    )
    events_by_type = {etype: int(cnt) for etype, cnt in breakdown_rows}

    return {
        "course": {
            "id": course.id,
            "title": course.title,
            "teacher_id": course.teacher_id,
        },
        "enrollments_active": enrollments,
        "lessons_total": lessons_total,
        "progress": {
            "avg_progress_pct": avg_progress,
            "completed_progress_rows": completed_count,
        },
        "quizzes": {
            "published": quizzes_published,
            "attempts_total": attempts_total,
            "avg_score_pct": avg_quiz_score,
        },
        "events": {
            "total": events_total,
            "by_type": events_by_type,
        },
    }