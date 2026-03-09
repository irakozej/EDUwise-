from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.assignment import Assignment, Submission
from app.models.course import Course, Lesson, Module
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.schemas.assignments import (
    AssignmentCreate, AssignmentOut,
    SubmitRequest, SubmissionOut, SubmissionWithStudentOut,
    GradeRequest,
)
from app.models.notification import Notification
from app.services.audit import log_action

router = APIRouter()


def _push_notification(db: Session, recipient_id: int, type_: str, title: str, body: str | None = None, link: str | None = None) -> None:
    db.add(Notification(recipient_id=recipient_id, type=type_, title=title, body=body, link=link))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_course_for_lesson(db: Session, lesson_id: int) -> Course:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    module = db.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(500, "Module not found")
    course = db.get(Course, module.course_id)
    if not course:
        raise HTTPException(500, "Course not found")
    return course


def _ensure_teacher_owns(user: User, course: Course) -> None:
    if user.role == UserRole.admin:
        return
    if course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")


def _ensure_enrolled(db: Session, student_id: int, course_id: int) -> None:
    e = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.course_id == course_id,
        Enrollment.status == "active",
    ).first()
    if not e:
        raise HTTPException(403, "You are not enrolled in this course")


# ── Teacher: create assignment ────────────────────────────────────────────────

@router.post("/lessons/{lesson_id}/assignments", response_model=AssignmentOut, status_code=201)
def create_assignment(
    lesson_id: int,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = _get_course_for_lesson(db, lesson_id)
    _ensure_teacher_owns(user, course)

    a = Assignment(
        lesson_id=lesson_id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        max_score=payload.max_score,
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    log_action(db, user.id, "CREATE", "Assignment", str(a.id))

    # Notify all enrolled students
    enrolled_students = (
        db.query(Enrollment)
        .filter(Enrollment.course_id == course.id, Enrollment.status == "active")
        .all()
    )
    for enroll in enrolled_students:
        _push_notification(
            db, enroll.student_id, "new_assignment",
            f'New assignment in "{course.title}"',
            f'"{a.title}" has been added. Due: {a.due_date.strftime("%b %d") if a.due_date else "no deadline"}.',
            f"/student/courses/{course.id}",
        )
    db.commit()

    return a


# ── List assignments (teacher + enrolled student) ─────────────────────────────

@router.get("/lessons/{lesson_id}/assignments", response_model=list[AssignmentOut])
def list_assignments(
    lesson_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    # Students must be enrolled in the course
    if user.role == UserRole.student:
        module = db.get(Module, lesson.module_id)
        _ensure_enrolled(db, user.id, module.course_id)

    return db.query(Assignment).filter(Assignment.lesson_id == lesson_id).order_by(Assignment.id.asc()).all()


# ── Get assignment detail ─────────────────────────────────────────────────────

@router.get("/assignments/{assignment_id}", response_model=AssignmentOut)
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    return a


# ── Student: submit ───────────────────────────────────────────────────────────

@router.post("/assignments/{assignment_id}/submit", response_model=SubmissionOut)
def submit_assignment(
    assignment_id: int,
    payload: SubmitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")

    course = _get_course_for_lesson(db, a.lesson_id)
    _ensure_enrolled(db, user.id, course.id)

    if not payload.text_body and not payload.file_url:
        raise HTTPException(400, "Provide either a text answer or an uploaded file")

    existing = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.student_id == user.id,
    ).first()

    now = datetime.now(timezone.utc)

    if existing:
        if existing.is_submitted:
            raise HTTPException(409, "You have already submitted this assignment")
        existing.text_body = payload.text_body
        existing.file_url = payload.file_url
        existing.file_name = payload.file_name
        existing.is_submitted = True
        existing.submitted_at = now
        db.commit()
        db.refresh(existing)
        log_action(db, user.id, "SUBMIT", "Assignment", str(assignment_id))
        _push_notification(
            db, recipient_id=course.teacher_id, type_="assignment_submitted",
            title=f'{user.full_name} submitted "{a.title}"',
            body=f'New submission for "{a.title}" in {course.title}.',
            link=f"/teacher/assignments/{assignment_id}/grade",
        )
        db.commit()
        return existing

    sub = Submission(
        assignment_id=assignment_id,
        student_id=user.id,
        text_body=payload.text_body,
        file_url=payload.file_url,
        file_name=payload.file_name,
        is_submitted=True,
        submitted_at=now,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    log_action(db, user.id, "SUBMIT", "Assignment", str(assignment_id))

    # Notify teacher
    _push_notification(
        db, recipient_id=course.teacher_id, type_="assignment_submitted",
        title=f'{user.full_name} submitted "{a.title}"',
        body=f'New submission for "{a.title}" in {course.title}.',
        link=f"/teacher/assignments/{assignment_id}/grade",
    )

    # Award XP for submitting
    from app.services.gamification import award_xp
    award_xp(db, user.id, "assignment_submit", sub.id)
    db.commit()

    # Auto-update lesson progress
    try:
        from app.services.progress import auto_update_progress
        auto_update_progress(db, user.id, a.lesson_id)
    except Exception:
        pass

    return sub


# ── Teacher: list all submissions for an assignment ───────────────────────────

@router.get("/assignments/{assignment_id}/submissions", response_model=list[SubmissionWithStudentOut])
def list_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")

    course = _get_course_for_lesson(db, a.lesson_id)
    _ensure_teacher_owns(user, course)

    from app.models.user import User as UserModel
    rows = (
        db.query(Submission, UserModel)
        .join(UserModel, UserModel.id == Submission.student_id)
        .filter(Submission.assignment_id == assignment_id)
        .order_by(Submission.submitted_at.asc().nullslast())
        .all()
    )

    result = []
    for sub, student in rows:
        result.append(SubmissionWithStudentOut(
            id=sub.id,
            assignment_id=sub.assignment_id,
            student_id=sub.student_id,
            text_body=sub.text_body,
            file_url=sub.file_url,
            file_name=sub.file_name,
            is_submitted=sub.is_submitted,
            submitted_at=sub.submitted_at,
            grade=sub.grade,
            feedback=sub.feedback,
            graded_at=sub.graded_at,
            student_name=student.full_name,
            student_email=student.email,
        ))
    return result


# ── Student: view own submissions ─────────────────────────────────────────────

@router.get("/me/submissions", response_model=list[SubmissionOut])
def my_submissions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    return (
        db.query(Submission)
        .filter(Submission.student_id == user.id)
        .order_by(Submission.created_at.desc())
        .all()
    )


# ── Teacher: grade a submission ───────────────────────────────────────────────

@router.patch("/submissions/{submission_id}/grade", response_model=SubmissionOut)
def grade_submission(
    submission_id: int,
    payload: GradeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    sub = db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")

    a = db.get(Assignment, sub.assignment_id)
    course = _get_course_for_lesson(db, a.lesson_id)
    _ensure_teacher_owns(user, course)

    if not sub.is_submitted:
        raise HTTPException(400, "Student has not submitted yet")

    if payload.grade < 0 or payload.grade > a.max_score:
        raise HTTPException(400, f"Grade must be between 0 and {a.max_score}")

    sub.grade = payload.grade
    sub.feedback = payload.feedback
    sub.graded_at = datetime.now(timezone.utc)
    sub.graded_by = user.id

    _push_notification(
        db,
        recipient_id=sub.student_id,
        type_="assignment_graded",
        title=f"Your assignment '{a.title}' has been graded",
        body=f"Score: {payload.grade}/{a.max_score}" + (f" — {payload.feedback}" if payload.feedback else ""),
        link=f"/student/courses",
    )

    db.commit()
    db.refresh(sub)

    # Award XP to student if grade >= 80%
    if payload.grade >= int(a.max_score * 0.8):
        from app.services.gamification import award_xp
        award_xp(db, sub.student_id, "assignment_honor", sub.id)
        db.commit()

    log_action(db, user.id, "GRADE", "Submission", str(submission_id))
    return sub
