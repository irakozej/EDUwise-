from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.enrollment import Enrollment
from app.models.course import Course, Module, Lesson
from app.models.progress import LessonProgress
from app.models.quiz import QuizAttempt, Quiz
from app.models.event import Event

router = APIRouter()


@router.get("/me/dashboard")
def me_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    # Enrolled courses
    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == user.id, Enrollment.status == "active")
        .all()
    )
    course_ids = [e.course_id for e in enrollments]

    courses_count = len(course_ids)

    # Overall lesson progress (only lessons belonging to enrolled courses)
    avg_progress = None
    completed_lessons = 0
    total_lessons = 0

    if course_ids:
        total_lessons = (
            db.query(func.count(Lesson.id))
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id.in_(course_ids))
            .scalar()
        ) or 0

        avg_progress_val = (
            db.query(func.avg(LessonProgress.progress_pct))
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .filter(
                LessonProgress.student_id == user.id,
                Module.course_id.in_(course_ids),
            )
            .scalar()
        )
        avg_progress = float(avg_progress_val) if avg_progress_val is not None else None

        completed_lessons = (
            db.query(func.count(LessonProgress.id))
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .filter(
                LessonProgress.student_id == user.id,
                Module.course_id.in_(course_ids),
                LessonProgress.progress_pct >= 100,
            )
            .scalar()
        ) or 0

    # Quiz performance
    attempts_total = (
        db.query(func.count(QuizAttempt.id))
        .filter(QuizAttempt.student_id == user.id)
        .scalar()
    ) or 0

    avg_quiz_score_val = (
        db.query(func.avg(QuizAttempt.score_pct))
        .filter(QuizAttempt.student_id == user.id, QuizAttempt.is_submitted == True)
        .scalar()
    )
    avg_quiz_score = float(avg_quiz_score_val) if avg_quiz_score_val is not None else None

    # Engagement events
    events_total = (
        db.query(func.count(Event.id))
        .filter(Event.student_id == user.id)
        .scalar()
    ) or 0

    breakdown_rows = (
        db.query(Event.event_type, func.count(Event.id))
        .filter(Event.student_id == user.id)
        .group_by(Event.event_type)
        .all()
    )
    events_by_type = {etype: int(cnt) for etype, cnt in breakdown_rows}

    # Recent activity (last 10)
    recent = (
        db.query(Event)
        .filter(Event.student_id == user.id)
        .order_by(desc(Event.created_at))
        .limit(10)
        .all()
    )
    recent_activity = [
        {
            "id": e.id,
            "event_type": e.event_type,
            "course_id": e.course_id,
            "lesson_id": e.lesson_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in recent
    ]

    return {
        "student": {"id": user.id, "full_name": user.full_name, "email": user.email},
        "courses_enrolled": courses_count,
        "progress": {
            "avg_progress_pct": avg_progress,
            "completed_lessons": completed_lessons,
            "total_lessons": total_lessons,
        },
        "quizzes": {
            "attempts_total": attempts_total,
            "avg_score_pct": avg_quiz_score,
        },
        "events": {
            "total": events_total,
            "by_type": events_by_type,
            "recent_activity": recent_activity,
        },
    }