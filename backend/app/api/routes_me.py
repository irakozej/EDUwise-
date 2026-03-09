from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles, get_current_user
from app.db.session import get_db
from app.models.assignment import Assignment, Submission
from app.models.user import User, UserRole
from app.models.enrollment import Enrollment
from app.models.course import Course, Module, Lesson
from app.models.progress import LessonProgress
from app.models.quiz import Quiz, QuizAttempt
from app.services.security import hash_password, verify_password

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


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@router.patch("/me/password")
def change_my_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


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


@router.get("/me/people")
def my_people(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Return teachers and fellow students grouped by enrolled course."""
    enrollments = db.query(Enrollment).filter(
        Enrollment.student_id == user.id,
        Enrollment.status == "active",
    ).all()

    result = []
    for enroll in enrollments:
        course = db.get(Course, enroll.course_id)
        if not course:
            continue

        teacher = db.get(User, course.teacher_id)
        people = []
        if teacher:
            people.append({
                "id": teacher.id,
                "full_name": teacher.full_name,
                "email": teacher.email,
                "role": "teacher",
            })

        fellow_enrolls = db.query(Enrollment, User).join(
            User, User.id == Enrollment.student_id
        ).filter(
            Enrollment.course_id == course.id,
            Enrollment.status == "active",
            Enrollment.student_id != user.id,
        ).all()

        for _, student in fellow_enrolls:
            people.append({
                "id": student.id,
                "full_name": student.full_name,
                "email": student.email,
                "role": "student",
            })

        result.append({
            "course_id": course.id,
            "course_title": course.title,
            "people": people,
        })

    return result


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


# ── Student: quiz attempt history ─────────────────────────────────────────────

@router.get("/me/quiz-attempts")
def my_quiz_attempts(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Return all quiz attempts for the logged-in student, enriched with quiz and course title."""
    rows = (
        db.query(QuizAttempt, Quiz, Lesson, Module, Course)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .join(Course, Course.id == Module.course_id)
        .filter(QuizAttempt.student_id == user.id, QuizAttempt.is_submitted == True)  # noqa: E712
        .order_by(QuizAttempt.submitted_at.desc())
        .all()
    )

    return [
        {
            "attempt_id": attempt.id,
            "quiz_id": attempt.quiz_id,
            "quiz_title": quiz.title,
            "course_id": course.id,
            "course_title": course.title,
            "score_pct": attempt.score_pct,
            "submitted_at": str(attempt.submitted_at) if attempt.submitted_at else None,
        }
        for attempt, quiz, lesson, module, course in rows
    ]


# ── Student: assignment submission history ────────────────────────────────────

@router.get("/me/submission-history")
def my_submission_history(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Return all assignment submissions for the student, enriched with assignment and course info."""
    rows = (
        db.query(Submission, Assignment, Lesson, Module, Course)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(Lesson, Lesson.id == Assignment.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .join(Course, Course.id == Module.course_id)
        .filter(Submission.student_id == user.id, Submission.is_submitted == True)  # noqa: E712
        .order_by(Submission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": sub.id,
            "assignment_id": sub.assignment_id,
            "assignment_title": assignment.title,
            "course_id": course.id,
            "course_title": course.title,
            "max_score": assignment.max_score,
            "due_date": str(assignment.due_date) if assignment.due_date else None,
            "submitted_at": str(sub.submitted_at) if sub.submitted_at else None,
            "grade": sub.grade,
            "feedback": sub.feedback,
            "graded_at": str(sub.graded_at) if sub.graded_at else None,
        }
        for sub, assignment, lesson, module, course in rows
    ]


# ── Student: study streak ─────────────────────────────────────────────────────

@router.get("/me/streak")
def my_streak(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Compute study streak from existing activity data (no extra table needed)."""
    from datetime import date, timedelta
    from sqlalchemy import func as sqlfunc
    from app.models.assignment import Submission

    progress_dates = {
        r[0] for r in db.query(sqlfunc.date(LessonProgress.updated_at))
        .filter(LessonProgress.student_id == user.id).all()
        if r[0]
    }
    quiz_dates = {
        r[0] for r in db.query(sqlfunc.date(QuizAttempt.started_at))
        .filter(QuizAttempt.student_id == user.id).all()
        if r[0]
    }
    sub_dates = {
        r[0] for r in db.query(sqlfunc.date(Submission.submitted_at))
        .filter(Submission.student_id == user.id, Submission.submitted_at.isnot(None)).all()
        if r[0]
    }

    all_dates = sorted(progress_dates | quiz_dates | sub_dates, reverse=True)

    if not all_dates:
        return {
            "current_streak": 0,
            "longest_streak": 0,
            "total_study_days": 0,
            "last_study_date": None,
        }

    today = date.today()

    # Compute current streak (consecutive days ending today or yesterday)
    current = 0
    check = today
    for d in all_dates:
        if current == 0 and d == today - timedelta(days=1):
            check = d
        if d == check:
            current += 1
            check -= timedelta(days=1)
        elif d < check:
            break

    # Compute longest streak
    asc = sorted(all_dates)
    longest, run = 1, 1
    for i in range(1, len(asc)):
        if (asc[i] - asc[i - 1]).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1

    return {
        "current_streak": current,
        "longest_streak": max(longest, current),
        "total_study_days": len(all_dates),
        "last_study_date": str(all_dates[0]) if all_dates else None,
    }