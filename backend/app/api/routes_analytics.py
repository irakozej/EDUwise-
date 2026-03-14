import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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

    # --- Quiz score distribution (5 buckets) ---
    all_scores = (
        db.query(QuizAttempt.score_pct)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id == course_id, QuizAttempt.is_submitted == True)  # noqa: E712
        .all()
    )
    buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for (score,) in all_scores:
        if score is None:
            continue
        if score <= 20:
            buckets["0-20"] += 1
        elif score <= 40:
            buckets["21-40"] += 1
        elif score <= 60:
            buckets["41-60"] += 1
        elif score <= 80:
            buckets["61-80"] += 1
        else:
            buckets["81-100"] += 1

    # --- Per-lesson completion breakdown ---
    modules_list = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index).all()
    module_map = {m.id: m.title for m in modules_list}
    lessons_list = (
        db.query(Lesson)
        .filter(Lesson.module_id.in_([m.id for m in modules_list]))
        .order_by(Lesson.order_index)
        .all()
    ) if modules_list else []

    lesson_completion = []
    for lesson in lessons_list:
        completed = (
            db.query(func.count(LessonProgress.id))
            .filter(LessonProgress.lesson_id == lesson.id, LessonProgress.progress_pct >= 100)
            .scalar()
        ) or 0
        lesson_completion.append({
            "lesson_id": lesson.id,
            "lesson_title": lesson.title,
            "module_title": module_map.get(lesson.module_id, ""),
            "completed": completed,
            "total_students": enrollments,
            "completion_rate": round(completed / enrollments * 100) if enrollments > 0 else 0,
        })

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
            "score_distribution": buckets,
        },
        "lesson_completion": lesson_completion,
        "events": {
            "total": events_total,
            "by_type": events_by_type,
        },
    }


@router.get("/courses/{course_id}/analytics/export")
def export_course_analytics_csv(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    """Download per-student analytics for a course as CSV."""
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    # All active enrolled students
    rows = (
        db.query(Enrollment, User)
        .join(User, User.id == Enrollment.student_id)
        .filter(Enrollment.course_id == course_id, Enrollment.status == "active")
        .all()
    )

    # All lessons in course
    modules = db.query(Module).filter(Module.course_id == course_id).all()
    module_ids = [m.id for m in modules]
    lessons = []
    lesson_ids: list[int] = []
    if module_ids:
        lessons = db.query(Lesson).filter(Lesson.module_id.in_(module_ids)).all()
        lesson_ids = [l.id for l in lessons]
    total_lessons = len(lessons)

    # Published quizzes
    quiz_ids: list[int] = []
    if lesson_ids:
        quizzes = (
            db.query(Quiz)
            .filter(Quiz.lesson_id.in_(lesson_ids), Quiz.is_published == True)  # noqa: E712
            .all()
        )
        quiz_ids = [q.id for q in quizzes]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "student_name", "student_email", "enrollment_status",
        "avg_progress_pct", "lessons_completed", "lessons_total",
        "quiz_attempts", "avg_quiz_score_pct",
    ])

    for enrollment, student in rows:
        avg_prog = ""
        completed = 0
        if lesson_ids:
            progress_rows = (
                db.query(LessonProgress)
                .filter(
                    LessonProgress.student_id == student.id,
                    LessonProgress.lesson_id.in_(lesson_ids),
                )
                .all()
            )
            if progress_rows:
                avg_prog = int(round(sum(p.progress_pct for p in progress_rows) / len(progress_rows)))
            completed = sum(1 for p in progress_rows if p.progress_pct >= 100)

        attempts = 0
        avg_score = ""
        if quiz_ids:
            attempts = (
                db.query(func.count(QuizAttempt.id))
                .filter(
                    QuizAttempt.student_id == student.id,
                    QuizAttempt.quiz_id.in_(quiz_ids),
                )
                .scalar()
                or 0
            )
            score_val = (
                db.query(func.avg(QuizAttempt.score_pct))
                .filter(
                    QuizAttempt.student_id == student.id,
                    QuizAttempt.quiz_id.in_(quiz_ids),
                    QuizAttempt.is_submitted == True,  # noqa: E712
                )
                .scalar()
            )
            if score_val is not None:
                avg_score = int(round(score_val))

        writer.writerow([
            student.full_name,
            student.email,
            enrollment.status,
            avg_prog,
            completed,
            total_lessons,
            attempts,
            avg_score,
        ])

    output.seek(0)
    safe_title = course.title.replace(" ", "_").replace("/", "-")[:40]
    filename = f"analytics_{safe_title}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )