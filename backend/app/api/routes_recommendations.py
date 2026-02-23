from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.api.deps import require_roles
from app.models.user import User, UserRole
from app.models.enrollment import Enrollment
from app.models.course import Course, Module, Lesson, Resource
from app.models.progress import LessonProgress
from app.models.quiz import QuizAttempt

router = APIRouter()


@router.get("/me/recommendations")
def me_recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    # 1) Only ACTIVE enrolled courses
    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == user.id, Enrollment.status == "active")
        .all()
    )
    course_ids = [e.course_id for e in enrollments]

    if not course_ids:
        return {
            "student_id": user.id,
            "count": 0,
            "recommendations": [],
            "note": "Student is not enrolled in any courses.",
        }

    # 2) Compute student performance signal (simple)
    avg_score = (
        db.query(func.avg(QuizAttempt.score_pct))
        .filter(QuizAttempt.student_id == user.id, QuizAttempt.is_submitted == True)
        .scalar()
    )
    avg_score = float(avg_score) if avg_score is not None else None

    # Determine preferred difficulty
    # If low quiz score, prefer easier resources
    prefer_easy = (avg_score is not None and avg_score < 60.0)

    # 3) Find lessons in enrolled courses + student progress
    # We use a left join-like approach by querying lessons then mapping progress
    lessons = (
        db.query(Lesson, Module)
        .join(Module, Module.id == Lesson.module_id)
        .filter(Module.course_id.in_(course_ids))
        .order_by(Module.order_index.asc(), Lesson.order_index.asc())
        .all()
    )

    if not lessons:
        return {
            "student_id": user.id,
            "count": 0,
            "recommendations": [],
            "note": "No lessons exist yet in your enrolled courses.",
        }

    # progress map: lesson_id -> progress_pct
    progress_rows = (
        db.query(LessonProgress.lesson_id, LessonProgress.progress_pct)
        .filter(LessonProgress.student_id == user.id)
        .all()
    )
    progress_map = {lid: float(pct) for lid, pct in progress_rows}

    # 4) Rank lessons by lowest progress (missing progress = 0)
    # Prefer lessons not completed (<100), then lowest progress first.
    lesson_rank = []
    for lesson, module in lessons:
        pct = progress_map.get(lesson.id, 0.0)
        is_completed = pct >= 100.0
        lesson_rank.append((is_completed, pct, module.course_id, lesson.id))

    # incomplete first, then lowest progress
    lesson_rank.sort(key=lambda x: (x[0], x[1]))

    # Pick top candidate lessons (up to 3) to pull resources from
    candidate_lessons = []
    for is_completed, pct, course_id, lesson_id in lesson_rank:
        if len(candidate_lessons) >= 3:
            break
        if pct < 100.0:
            candidate_lessons.append((course_id, lesson_id, pct))

    # If everything completed, still recommend the last lesson’s resources for revision
    if not candidate_lessons:
        # choose last lesson in list
        last_lesson, last_module = lessons[-1]
        candidate_lessons = [(last_module.course_id, last_lesson.id, progress_map.get(last_lesson.id, 100.0))]

    # 5) Fetch resources for candidate lessons
    recs = []
    for course_id, lesson_id, pct in candidate_lessons:
        lesson = db.get(Lesson, lesson_id)

        # pull resources in this lesson
        q = db.query(Resource).filter(Resource.lesson_id == lesson_id)

        # if low score, prefer easy resources when available
        if prefer_easy:
            # order: easy first, then medium, then hard, then others
            q = q.order_by(
                func.case(
                    (Resource.difficulty == "easy", 0),
                    (Resource.difficulty == "medium", 1),
                    (Resource.difficulty == "hard", 2),
                    else_=3,
                ),
                Resource.id.asc(),
            )
        else:
            q = q.order_by(Resource.id.asc())

        resources = q.all()

        # if a lesson has no resources, still recommend the lesson itself
        if not resources:
            recs.append({
                "type": "lesson",
                "course_id": course_id,
                "lesson_id": lesson_id,
                "resource_id": None,
                "title": lesson.title,
                "reason": f"Your progress is {pct:.0f}% on this lesson. Continue learning here.",
                "difficulty": None,
                "url": None,
            })
            continue

        for r in resources[:3]:  # cap per lesson
            reason_parts = [f"Your progress is {pct:.0f}% on this lesson."]
            if prefer_easy:
                reason_parts.append("Your average quiz score is low, so we're prioritizing easier resources.")

            recs.append({
                "type": "resource",
                "course_id": course_id,
                "lesson_id": lesson_id,
                "resource_id": r.id,
                "title": r.title,
                "reason": " ".join(reason_parts),
                "difficulty": r.difficulty,
                "url": r.url,
                "format": r.format,
                "topic": r.topic,
            })

    # Global cap
    recs = recs[:8]

    return {
        "student_id": user.id,
        "avg_quiz_score_pct": avg_score,
        "count": len(recs),
        "recommendations": recs,
    }