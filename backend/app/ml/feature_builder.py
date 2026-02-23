from __future__ import annotations
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
from app.models.course import Lesson, Module
from app.models.quiz import QuizAttempt, Quiz
from app.models.event import Event


def build_student_features(db: Session, student_id: int) -> dict:
    """
    Build per-student features from the platform tables.
    Returns a simple dict of numeric features for inference.
    """

    # Active enrollments
    active_courses = (
        db.query(func.count(Enrollment.id))
        .filter(Enrollment.student_id == student_id, Enrollment.status == "active")
        .scalar()
    ) or 0

    # Progress
    avg_progress = (
        db.query(func.avg(LessonProgress.progress_pct))
        .filter(LessonProgress.student_id == student_id)
        .scalar()
    )
    avg_progress = float(avg_progress) if avg_progress is not None else 0.0

    completed_lessons = (
        db.query(func.count(LessonProgress.id))
        .filter(LessonProgress.student_id == student_id, LessonProgress.progress_pct >= 100)
        .scalar()
    ) or 0

    # Quizzes
    attempts_total = (
        db.query(func.count(QuizAttempt.id))
        .filter(QuizAttempt.student_id == student_id)
        .scalar()
    ) or 0

    avg_quiz_score = (
        db.query(func.avg(QuizAttempt.score_pct))
        .filter(QuizAttempt.student_id == student_id, QuizAttempt.is_submitted == True)
        .scalar()
    )
    avg_quiz_score = float(avg_quiz_score) if avg_quiz_score is not None else 0.0

    # Events
    events_total = (
        db.query(func.count(Event.id))
        .filter(Event.student_id == student_id)
        .scalar()
    ) or 0

    # Event breakdown (basic)
    lesson_open = (
        db.query(func.count(Event.id))
        .filter(Event.student_id == student_id, Event.event_type == "lesson_open")
        .scalar()
    ) or 0

    quiz_submit = (
        db.query(func.count(Event.id))
        .filter(Event.student_id == student_id, Event.event_type == "quiz_submit")
        .scalar()
    ) or 0

    return {
        "active_courses": float(active_courses),
        "avg_progress": float(avg_progress),
        "completed_lessons": float(completed_lessons),
        "attempts_total": float(attempts_total),
        "avg_quiz_score": float(avg_quiz_score),
        "events_total": float(events_total),
        "lesson_open_events": float(lesson_open),
        "quiz_submit_events": float(quiz_submit),
    }