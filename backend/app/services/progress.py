"""
Auto-progress service.

Calculates lesson progress from activity data and updates LessonProgress.
Rules (never decreases existing value unless a teacher explicitly overrides):

  lesson opened           → 20 pts
  avg quiz score          → up to 40 pts  (score * 0.40)
  avg exercise score      → up to 20 pts  (score * 0.20)
  assignment submitted    → 20 pts

Max = 100.  Auto-update only raises progress; teacher override can set any value.
"""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.assignment import Assignment, Submission
from app.models.course import Lesson, Module
from app.models.enrollment import Enrollment
from app.models.event import Event
from app.models.exercise import ExerciseAttempt
from app.models.progress import LessonProgress
from app.models.quiz import Quiz, QuizAttempt


def auto_update_progress(db: Session, student_id: int, lesson_id: int) -> int:
    """Recalculate and upsert a student's progress for one lesson.
    Returns the new progress_pct."""

    score = 0

    # ── 1. Lesson opened? (20 pts) ────────────────────────────────────────────
    opened = (
        db.query(Event)
        .filter(
            Event.student_id == student_id,
            Event.lesson_id == lesson_id,
            Event.event_type == "lesson_open",
        )
        .first()
    )
    if opened:
        score += 20

    # ── 2. Quiz performance (up to 40 pts) ────────────────────────────────────
    quiz_ids = [
        q.id
        for q in db.query(Quiz).filter(Quiz.lesson_id == lesson_id).all()
    ]
    if quiz_ids:
        avg_quiz = (
            db.query(func.avg(QuizAttempt.score_pct))
            .filter(
                QuizAttempt.student_id == student_id,
                QuizAttempt.quiz_id.in_(quiz_ids),
                QuizAttempt.is_submitted == True,  # noqa: E712
            )
            .scalar()
        )
        if avg_quiz is not None:
            score += int(float(avg_quiz) * 0.40)

    # ── 3. Exercise performance (up to 20 pts) ────────────────────────────────
    avg_ex = (
        db.query(func.avg(ExerciseAttempt.score_pct))
        .filter(
            ExerciseAttempt.student_id == student_id,
            ExerciseAttempt.lesson_id == lesson_id,
            ExerciseAttempt.is_submitted == True,  # noqa: E712
        )
        .scalar()
    )
    if avg_ex is not None:
        score += int(float(avg_ex) * 0.20)

    # ── 4. Assignment submitted (20 pts) ──────────────────────────────────────
    assignment_ids = [
        a.id
        for a in db.query(Assignment).filter(Assignment.lesson_id == lesson_id).all()
    ]
    if assignment_ids:
        submitted = (
            db.query(Submission)
            .filter(
                Submission.student_id == student_id,
                Submission.assignment_id.in_(assignment_ids),
                Submission.is_submitted == True,  # noqa: E712
            )
            .first()
        )
        if submitted:
            score += 20

    score = min(100, score)

    # ── Upsert: only raise via auto-update (never lower) ─────────────────────
    row = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.student_id == student_id,
            LessonProgress.lesson_id == lesson_id,
        )
        .first()
    )

    if not row:
        row = LessonProgress(
            student_id=student_id,
            lesson_id=lesson_id,
            progress_pct=score,
        )
        db.add(row)
    else:
        # Auto never decreases
        if score > row.progress_pct:
            row.progress_pct = score

    db.commit()
    return row.progress_pct
