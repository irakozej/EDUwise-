import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.course import Course, Module, Lesson, Resource
from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
from app.models.quiz import Quiz, QuizAttempt
from app.models.event import Event  # you already created events table/model
from app.schemas.teacher import (
    TeacherCreateStudentRequest,
    TeacherStudentOut,
    TeacherEnrollmentOut,
    StudentCourseProgressOut,
    LessonProgressOut,
    TeacherEnrollByEmailRequest,
)
from app.services.security import hash_password
from app.services.audit import log_action

router = APIRouter()


def _ensure_teacher_owns_course(user: User, course: Course):
    if user.role == UserRole.admin:
        return
    if course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")


@router.post("/teacher/students", response_model=TeacherStudentOut)
def teacher_create_student(
    payload: TeacherCreateStudentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(409, "Email already registered")

    student = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.student,
        is_active=True,
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    log_action(db, user.id, "CREATE", "User", str(student.id))
    return TeacherStudentOut(id=student.id, full_name=student.full_name, email=student.email)


@router.get("/teacher/my-courses")
def teacher_list_my_courses(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    q = db.query(Course)
    if user.role != UserRole.admin:
        q = q.filter(Course.teacher_id == user.id)
    courses = q.order_by(Course.id.desc()).all()
    return [{"id": c.id, "title": c.title, "description": c.description, "teacher_id": c.teacher_id} for c in courses]


@router.get("/teacher/courses/{course_id}/enrollments", response_model=list[TeacherEnrollmentOut])
def teacher_list_enrollments(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    _ensure_teacher_owns_course(user, course)

    rows = (
        db.query(Enrollment, User)
        .join(User, User.id == Enrollment.student_id)
        .filter(Enrollment.course_id == course_id)
        .order_by(Enrollment.id.desc())
        .all()
    )

    out: list[TeacherEnrollmentOut] = []
    for e, u in rows:
        out.append(
            TeacherEnrollmentOut(
                student=TeacherStudentOut(id=u.id, full_name=u.full_name, email=u.email),
                status=e.status,
            )
        )
    return out


@router.delete("/teacher/courses/{course_id}/students/{student_id}")
def teacher_remove_student_from_course(
    course_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    _ensure_teacher_owns_course(user, course)

    e = (
        db.query(Enrollment)
        .filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
            Enrollment.status == "active",
        )
        .first()
    )
    if not e:
        raise HTTPException(404, "Active enrollment not found")

    e.status = "removed"
    db.commit()

    log_action(db, user.id, "REMOVE", "Enrollment", f"{course_id}:{student_id}")
    return {"status": "removed"}


@router.get("/teacher/courses/{course_id}/students/{student_id}/progress", response_model=StudentCourseProgressOut)
def teacher_student_progress(
    course_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    _ensure_teacher_owns_course(user, course)

    student = db.get(User, student_id)
    if not student or student.role != UserRole.student:
        raise HTTPException(404, "Student not found")

    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.course_id == course_id, Enrollment.student_id == student_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(404, "Student not enrolled in this course")

    modules = db.query(Module).filter(Module.course_id == course_id).all()
    module_ids = [m.id for m in modules]
    lessons = []
    if module_ids:
        lessons = db.query(Lesson).filter(Lesson.module_id.in_(module_ids)).order_by(Lesson.id.asc()).all()

    lesson_ids = [l.id for l in lessons]

    # Lesson progress rows
    progress_rows = {}
    if lesson_ids:
        rows = (
            db.query(LessonProgress)
            .filter(LessonProgress.student_id == student_id, LessonProgress.lesson_id.in_(lesson_ids))
            .all()
        )
        progress_rows = {r.lesson_id: r.progress_pct for r in rows}

    lessons_out: list[LessonProgressOut] = []
    for l in lessons:
        pct = int(progress_rows.get(l.id, 0) or 0)
        lessons_out.append(LessonProgressOut(lesson_id=l.id, lesson_title=l.title, progress_pct=pct))

    avg_progress = 0
    if lessons_out:
        avg_progress = int(round(sum(x.progress_pct for x in lessons_out) / len(lessons_out)))

    completed = sum(1 for x in lessons_out if x.progress_pct >= 100)

    # Quiz stats (for lessons in this course)
    quizzes = []
    if lesson_ids:
        quizzes = db.query(Quiz).filter(Quiz.lesson_id.in_(lesson_ids), Quiz.is_published == True).all()  # noqa: E712
    quiz_ids = [q.id for q in quizzes]

    attempts_total = 0
    avg_score = None
    if quiz_ids:
        attempts_total = (
            db.query(func.count(QuizAttempt.id))
            .filter(QuizAttempt.student_id == student_id, QuizAttempt.quiz_id.in_(quiz_ids))
            .scalar()
            or 0
        )
        avg_score_val = (
            db.query(func.avg(QuizAttempt.score_pct))
            .filter(
                QuizAttempt.student_id == student_id,
                QuizAttempt.quiz_id.in_(quiz_ids),
                QuizAttempt.is_submitted == True,  # noqa: E712
            )
            .scalar()
        )
        avg_score = int(round(avg_score_val)) if avg_score_val is not None else None

    # Events breakdown (per course + student)
    events_total = 0
    by_type = {}
    ev_rows = (
        db.query(Event.event_type, func.count(Event.id))
        .filter(Event.course_id == course_id, Event.student_id == student_id)
        .group_by(Event.event_type)
        .all()
    )
    if ev_rows:
        by_type = {k: int(v) for k, v in ev_rows}
        events_total = sum(by_type.values())

    return StudentCourseProgressOut(
        course={"id": course.id, "title": course.title, "teacher_id": course.teacher_id},
        student=TeacherStudentOut(id=student.id, full_name=student.full_name, email=student.email),
        enrolled_status=enrollment.status,
        progress={"avg_progress_pct": avg_progress, "completed_lessons": completed, "lessons_total": len(lessons_out)},
        lessons=lessons_out,
        quizzes={"published_total": len(quizzes), "attempts_total": attempts_total, "avg_score_pct": avg_score},
        events={"total": events_total, "by_type": by_type},
    )


@router.post("/teacher/courses/{course_id}/enroll")
def teacher_enroll_student(
    course_id: int,
    payload: TeacherEnrollByEmailRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    _ensure_teacher_owns_course(user, course)

    student = db.query(User).filter(User.email == payload.email).first()
    if not student:
        raise HTTPException(404, "No registered user with that email")
    if student.role != UserRole.student:
        raise HTTPException(400, "That user is not a student")
    if not student.is_active:
        raise HTTPException(400, "Student account is inactive")

    existing = db.query(Enrollment).filter(
        Enrollment.student_id == student.id,
        Enrollment.course_id == course_id,
    ).first()

    if existing:
        if existing.status == "active":
            return {"status": "already_enrolled", "student_id": student.id, "full_name": student.full_name}
        existing.status = "active"
        db.commit()
        log_action(db, user.id, "ENROLL", "Course", f"{course_id}:{student.id}")
        return {"status": "re_enrolled", "student_id": student.id, "full_name": student.full_name}

    db.add(Enrollment(student_id=student.id, course_id=course_id, status="active"))
    db.commit()
    log_action(db, user.id, "ENROLL", "Course", f"{course_id}:{student.id}")
    return {"status": "enrolled", "student_id": student.id, "full_name": student.full_name}


@router.post("/teacher/courses/{course_id}/enroll-bulk")
async def teacher_enroll_bulk(
    course_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    """Upload a CSV file (one email per row or with 'email' header) to bulk-enroll students."""
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    _ensure_teacher_owns_course(user, course)

    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))

    emails: list[str] = []
    for i, row in enumerate(reader):
        if not row:
            continue
        cell = row[0].strip()
        # Skip header row
        if i == 0 and cell.lower() in ("email", "emails", "student_email"):
            continue
        if cell and "@" in cell:
            emails.append(cell.lower())

    enrolled: list[str] = []
    already_enrolled: list[str] = []
    not_found: list[str] = []
    errors: list[str] = []

    for email in emails:
        try:
            student = db.query(User).filter(User.email == email).first()
            if not student:
                not_found.append(email)
                continue
            if student.role != UserRole.student:
                errors.append(f"{email}: not a student account")
                continue
            if not student.is_active:
                errors.append(f"{email}: account is inactive")
                continue

            existing = db.query(Enrollment).filter(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course_id,
            ).first()

            if existing:
                if existing.status == "active":
                    already_enrolled.append(email)
                else:
                    existing.status = "active"
                    enrolled.append(email)
            else:
                db.add(Enrollment(student_id=student.id, course_id=course_id, status="active"))
                enrolled.append(email)
        except Exception as e:
            errors.append(f"{email}: {str(e)}")

    db.commit()
    log_action(db, user.id, "BULK_ENROLL", "Course", str(course_id))

    return {
        "enrolled": enrolled,
        "already_enrolled": already_enrolled,
        "not_found": not_found,
        "errors": errors,
    }