from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.course import Course, Module, Lesson, Resource
from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
from app.schemas.learning import (
    CourseCreate, CourseOut,
    ModuleCreate, ModuleOut,
    LessonCreate, LessonOut,
    ResourceCreate, ResourceOut,
    EnrollRequest, ProgressUpdate
)
from app.api.deps import get_current_user, require_roles
from app.services.audit import log_action

router = APIRouter()

# ---------- Courses (Teacher/Admin) ----------
@router.post("/courses", response_model=CourseOut)
def create_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = Course(title=payload.title, description=payload.description, teacher_id=user.id)
    db.add(course)
    db.commit()
    db.refresh(course)

    log_action(db, user.id, "CREATE", "Course", str(course.id))
    return CourseOut(id=course.id, title=course.title, description=course.description, teacher_id=course.teacher_id)

@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Students see all courses (later: filter by enrollments)
    courses = db.query(Course).order_by(Course.id.desc()).all()
    return [CourseOut(id=c.id, title=c.title, description=c.description, teacher_id=c.teacher_id) for c in courses]

# ---------- Modules ----------
@router.post("/courses/{course_id}/modules", response_model=ModuleOut)
def create_module(
    course_id: int,
    payload: ModuleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    m = Module(course_id=course_id, title=payload.title, order_index=payload.order_index)
    db.add(m)
    db.commit()
    db.refresh(m)

    log_action(db, user.id, "CREATE", "Module", str(m.id))
    return ModuleOut(id=m.id, course_id=m.course_id, title=m.title, order_index=m.order_index)

@router.get("/courses/{course_id}/modules", response_model=list[ModuleOut])
def list_modules(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    modules = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index.asc()).all()
    return [ModuleOut(id=m.id, course_id=m.course_id, title=m.title, order_index=m.order_index) for m in modules]

# ---------- Lessons ----------
@router.post("/modules/{module_id}/lessons", response_model=LessonOut)
def create_lesson(
    module_id: int,
    payload: LessonCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    module = db.get(Module, module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    course = db.get(Course, module.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    lesson = Lesson(module_id=module_id, title=payload.title, content=payload.content, order_index=payload.order_index)
    db.add(lesson)
    db.commit()
    db.refresh(lesson)

    log_action(db, user.id, "CREATE", "Lesson", str(lesson.id))
    return LessonOut(id=lesson.id, module_id=lesson.module_id, title=lesson.title, content=lesson.content, order_index=lesson.order_index)

@router.get("/modules/{module_id}/lessons", response_model=list[LessonOut])
def list_lessons(module_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lessons = db.query(Lesson).filter(Lesson.module_id == module_id).order_by(Lesson.order_index.asc()).all()
    return [LessonOut(id=l.id, module_id=l.module_id, title=l.title, content=l.content, order_index=l.order_index) for l in lessons]

# ---------- Resources ----------
@router.post("/lessons/{lesson_id}/resources", response_model=ResourceOut)
def create_resource(
    lesson_id: int,
    payload: ResourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    module = db.get(Module, lesson.module_id)
    course = db.get(Course, module.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    r = Resource(
        lesson_id=lesson_id,
        title=payload.title,
        resource_type=payload.resource_type,
        url=payload.url,
        text_body=payload.text_body,
        topic=payload.topic,
        difficulty=payload.difficulty,
        format=payload.format,
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    log_action(db, user.id, "CREATE", "Resource", str(r.id))
    return ResourceOut(
        id=r.id, lesson_id=r.lesson_id, title=r.title, resource_type=r.resource_type,
        url=r.url, text_body=r.text_body, topic=r.topic, difficulty=r.difficulty, format=r.format
    )

@router.get("/lessons/{lesson_id}/resources", response_model=list[ResourceOut])
def list_resources(lesson_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    resources = db.query(Resource).filter(Resource.lesson_id == lesson_id).order_by(Resource.id.asc()).all()
    return [
        ResourceOut(
            id=r.id, lesson_id=r.lesson_id, title=r.title, resource_type=r.resource_type,
            url=r.url, text_body=r.text_body, topic=r.topic, difficulty=r.difficulty, format=r.format
        )
        for r in resources
    ]

# ---------- Edit / Delete endpoints (Teacher/Admin) ----------

@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(
    course_id: int,
    payload: CourseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    if payload.title:
        course.title = payload.title.strip()
    if payload.description is not None:
        course.description = payload.description
    db.commit()
    db.refresh(course)
    log_action(db, user.id, "UPDATE", "Course", str(course.id))
    return CourseOut(id=course.id, title=course.title, description=course.description, teacher_id=course.teacher_id)


@router.delete("/courses/{course_id}", status_code=204)
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    log_action(db, user.id, "DELETE", "Course", str(course.id))
    db.delete(course)
    db.commit()


@router.patch("/modules/{module_id}", response_model=ModuleOut)
def update_module(
    module_id: int,
    payload: ModuleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    m = db.get(Module, module_id)
    if not m:
        raise HTTPException(404, "Module not found")
    course = db.get(Course, m.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    if payload.title:
        m.title = payload.title.strip()
    m.order_index = payload.order_index
    db.commit()
    db.refresh(m)
    log_action(db, user.id, "UPDATE", "Module", str(m.id))
    return ModuleOut(id=m.id, course_id=m.course_id, title=m.title, order_index=m.order_index)


@router.delete("/modules/{module_id}", status_code=204)
def delete_module(
    module_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    m = db.get(Module, module_id)
    if not m:
        raise HTTPException(404, "Module not found")
    course = db.get(Course, m.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    log_action(db, user.id, "DELETE", "Module", str(m.id))
    db.delete(m)
    db.commit()


@router.patch("/lessons/{lesson_id}", response_model=LessonOut)
def update_lesson(
    lesson_id: int,
    payload: LessonCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    module = db.get(Module, lesson.module_id)
    course = db.get(Course, module.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    if payload.title:
        lesson.title = payload.title.strip()
    lesson.content = payload.content
    lesson.order_index = payload.order_index
    db.commit()
    db.refresh(lesson)
    log_action(db, user.id, "UPDATE", "Lesson", str(lesson.id))
    return LessonOut(id=lesson.id, module_id=lesson.module_id, title=lesson.title, content=lesson.content, order_index=lesson.order_index)


@router.delete("/lessons/{lesson_id}", status_code=204)
def delete_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")
    module = db.get(Module, lesson.module_id)
    course = db.get(Course, module.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    log_action(db, user.id, "DELETE", "Lesson", str(lesson.id))
    db.delete(lesson)
    db.commit()


@router.delete("/resources/{resource_id}", status_code=204)
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    r = db.get(Resource, resource_id)
    if not r:
        raise HTTPException(404, "Resource not found")
    lesson = db.get(Lesson, r.lesson_id)
    module = db.get(Module, lesson.module_id)
    course = db.get(Course, module.course_id)
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")
    log_action(db, user.id, "DELETE", "Resource", str(r.id))
    db.delete(r)
    db.commit()


# ---------- Enrollment (Student) ----------
@router.post("/enroll", status_code=201)
def enroll(
    payload: EnrollRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    course = db.get(Course, payload.course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    existing = db.query(Enrollment).filter(
        Enrollment.student_id == user.id,
        Enrollment.course_id == payload.course_id
    ).first()
    if existing:
        return {"status": "already_enrolled"}

    e = Enrollment(student_id=user.id, course_id=payload.course_id)
    db.add(e)
    db.commit()

    log_action(db, user.id, "ENROLL", "Course", str(payload.course_id))
    return {"status": "enrolled"}

# ---------- Progress (Student) ----------
@router.put("/lessons/{lesson_id}/progress")
def update_progress(
    lesson_id: int,
    payload: ProgressUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    if payload.progress_pct < 0 or payload.progress_pct > 100:
        raise HTTPException(400, "progress_pct must be 0..100")

    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    # ✅ Phase 2C.2: Enforce enrollment for the course owning this lesson
    module = db.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(500, "Module not found for lesson")

    enrolled = db.query(Enrollment).filter(
        Enrollment.student_id == user.id,
        Enrollment.course_id == module.course_id,
        Enrollment.status == "active",
    ).first()
    if not enrolled:
        raise HTTPException(403, "Student not enrolled in this course")

    row = db.query(LessonProgress).filter(
        LessonProgress.student_id == user.id,
        LessonProgress.lesson_id == lesson_id
    ).first()

    if not row:
        row = LessonProgress(student_id=user.id, lesson_id=lesson_id, progress_pct=payload.progress_pct)
        db.add(row)
    else:
        row.progress_pct = payload.progress_pct

    db.commit()
    log_action(db, user.id, "PROGRESS_UPDATE", "Lesson", str(lesson_id))

    # Award XP on first completion
    if payload.progress_pct >= 100:
        from app.services.gamification import award_xp
        award_xp(db, user.id, "lesson_complete", lesson_id)
        db.commit()

    return {"status": "ok", "progress_pct": row.progress_pct}


# ---------- Prerequisites ----------

@router.get("/courses/{course_id}/prerequisites")
def list_prerequisites(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.prerequisite import CoursePrerequisite
    prereqs = db.query(CoursePrerequisite).filter(CoursePrerequisite.course_id == course_id).all()
    result = []
    for p in prereqs:
        prereq_course = db.get(Course, p.prerequisite_course_id)
        result.append({
            "id": p.id,
            "course_id": p.course_id,
            "prerequisite_course_id": p.prerequisite_course_id,
            "prerequisite_title": prereq_course.title if prereq_course else "Unknown",
        })
    return result


@router.post("/courses/{course_id}/prerequisites", status_code=201)
def add_prerequisite(
    course_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin, UserRole.co_admin)),
):
    from pydantic import BaseModel
    from app.models.prerequisite import CoursePrerequisite

    prereq_course_id = payload.get("prerequisite_course_id")
    if not prereq_course_id:
        raise HTTPException(400, "prerequisite_course_id required")

    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role == UserRole.teacher and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    prereq = db.get(Course, prereq_course_id)
    if not prereq:
        raise HTTPException(404, "Prerequisite course not found")
    if prereq_course_id == course_id:
        raise HTTPException(400, "A course cannot be its own prerequisite")

    existing = db.query(CoursePrerequisite).filter(
        CoursePrerequisite.course_id == course_id,
        CoursePrerequisite.prerequisite_course_id == prereq_course_id,
    ).first()
    if existing:
        raise HTTPException(409, "This prerequisite already exists")

    p = CoursePrerequisite(course_id=course_id, prerequisite_course_id=prereq_course_id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "prerequisite_course_id": prereq_course_id, "prerequisite_title": prereq.title}


@router.delete("/courses/{course_id}/prerequisites/{prereq_course_id}", status_code=204)
def remove_prerequisite(
    course_id: int,
    prereq_course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin, UserRole.co_admin)),
):
    from app.models.prerequisite import CoursePrerequisite
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role == UserRole.teacher and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    p = db.query(CoursePrerequisite).filter(
        CoursePrerequisite.course_id == course_id,
        CoursePrerequisite.prerequisite_course_id == prereq_course_id,
    ).first()
    if not p:
        raise HTTPException(404, "Prerequisite not found")
    db.delete(p)
    db.commit()


@router.get("/courses/{course_id}/prerequisite-status")
def prerequisite_status(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Check if student meets prerequisites for a course."""
    from app.models.prerequisite import CoursePrerequisite
    from sqlalchemy import func as sqlfunc

    prereqs = db.query(CoursePrerequisite).filter(CoursePrerequisite.course_id == course_id).all()
    missing = []
    for p in prereqs:
        prereq_course = db.get(Course, p.prerequisite_course_id)
        if not prereq_course:
            continue
        # Compute progress in prerequisite course
        total_lessons = (
            db.query(sqlfunc.count(Lesson.id))
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id == p.prerequisite_course_id)
            .scalar()
        ) or 0
        if total_lessons == 0:
            continue
        completed = (
            db.query(sqlfunc.count(LessonProgress.id))
            .filter(LessonProgress.student_id == user.id, LessonProgress.progress_pct >= 100)
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id == p.prerequisite_course_id)
            .scalar()
        ) or 0
        progress_pct = int(round((completed / total_lessons) * 100))
        if progress_pct < 100:
            missing.append({
                "course_id": p.prerequisite_course_id,
                "title": prereq_course.title,
                "progress_pct": progress_pct,
            })

    return {"met": len(missing) == 0, "missing": missing}