import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.quiz import Quiz, QuizAttempt
from app.models.user import User, UserRole
from app.services.security import hash_password
from app.services.audit import log_action

router = APIRouter()

# Roles that are allowed to access admin routes
_ADMIN_ROLES = (UserRole.admin, UserRole.co_admin)


def _is_super_admin(user: User) -> bool:
    return user.role == UserRole.admin


def _is_privileged(role: UserRole) -> bool:
    """admin and co_admin are privileged — co_admin cannot touch them."""
    return role in {UserRole.admin, UserRole.co_admin}


# ── Stats ────────────────────────────────────────────────────────────────────

@router.get("/admin/stats")
def admin_stats(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    total_users = db.query(func.count(User.id)).scalar() or 0
    students = db.query(func.count(User.id)).filter(User.role == UserRole.student).scalar() or 0
    teachers = db.query(func.count(User.id)).filter(User.role == UserRole.teacher).scalar() or 0
    admins = db.query(func.count(User.id)).filter(User.role == UserRole.admin).scalar() or 0
    co_admins = db.query(func.count(User.id)).filter(User.role == UserRole.co_admin).scalar() or 0
    inactive = db.query(func.count(User.id)).filter(User.is_active == False).scalar() or 0  # noqa: E712

    total_courses = db.query(func.count(Course.id)).scalar() or 0
    total_enrollments = db.query(func.count(Enrollment.id)).scalar() or 0
    active_enrollments = (
        db.query(func.count(Enrollment.id)).filter(Enrollment.status == "active").scalar() or 0
    )
    total_quizzes = db.query(func.count(Quiz.id)).scalar() or 0
    quiz_attempts = db.query(func.count(QuizAttempt.id)).scalar() or 0
    total_activity = db.query(func.count(AuditLog.id)).scalar() or 0

    return {
        "users": {
            "total": total_users,
            "students": students,
            "teachers": teachers,
            "admins": admins,
            "co_admins": co_admins,
            "inactive": inactive,
        },
        "courses": {"total": total_courses},
        "enrollments": {"total": total_enrollments, "active": active_enrollments},
        "quizzes": {"total": total_quizzes, "attempts": quiz_attempts},
        "activity": {"total": total_activity},
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/admin/users")
def admin_list_users(
    role: Optional[str] = None,
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    q = db.query(User)
    if role:
        try:
            q = q.filter(User.role == UserRole(role))
        except ValueError:
            raise HTTPException(400, f"Invalid role: {role}")
    if active is not None:
        q = q.filter(User.is_active == active)
    users = q.order_by(User.id.desc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": str(u.created_at),
        }
        for u in users
    ]


class CreateUserRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str  # student | teacher | co_admin (admin can also create admin)


@router.post("/admin/users", status_code=201)
def admin_create_user(
    payload: CreateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    try:
        new_role = UserRole(payload.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role: {payload.role}")

    # Co-admin cannot create admin or co_admin accounts
    if _is_privileged(new_role) and not _is_super_admin(current_user):
        raise HTTPException(403, "Only The Admin can create admin or co-admin accounts")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(409, "Email already registered")

    new_user = User(
        full_name=payload.full_name.strip(),
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=new_role,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    log_action(db, current_user.id, "CREATE", "User", str(new_user.id))
    return {
        "id": new_user.id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "role": new_user.role,
        "is_active": new_user.is_active,
    }


@router.patch("/admin/users/{user_id}/toggle-active")
def admin_toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "Cannot deactivate your own account")
    # Co-admin cannot deactivate admin or co_admin accounts
    if _is_privileged(target.role) and not _is_super_admin(current_user):
        raise HTTPException(403, "Co-admins cannot deactivate admin or co-admin accounts")

    target.is_active = not target.is_active
    db.commit()
    db.refresh(target)
    log_action(db, current_user.id, "UPDATE", "User", str(target.id))
    return {"id": target.id, "is_active": target.is_active}


class RoleChangeRequest(BaseModel):
    role: str


@router.patch("/admin/users/{user_id}/role")
def admin_change_user_role(
    user_id: int,
    payload: RoleChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == current_user.id:
        raise HTTPException(400, "Cannot change your own role")
    # Co-admin cannot touch privileged users' roles
    if _is_privileged(target.role) and not _is_super_admin(current_user):
        raise HTTPException(403, "Co-admins cannot change roles of admin or co-admin accounts")
    try:
        new_role = UserRole(payload.role)
    except ValueError:
        raise HTTPException(400, f"Invalid role: {payload.role}")
    # Co-admin cannot assign privileged roles
    if _is_privileged(new_role) and not _is_super_admin(current_user):
        raise HTTPException(403, "Co-admins cannot assign admin or co-admin roles")

    target.role = new_role
    db.commit()
    db.refresh(target)
    log_action(db, current_user.id, "UPDATE", "User", str(target.id))
    return {"id": target.id, "role": target.role}


@router.get("/admin/users/export")
def admin_export_users_csv(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    users = db.query(User).order_by(User.role, User.full_name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "full_name", "email", "role", "is_active", "created_at"])
    for u in users:
        writer.writerow([u.id, u.full_name, u.email, u.role, u.is_active, u.created_at])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="users_export.csv"'},
    )


# ── Courses ───────────────────────────────────────────────────────────────────

@router.get("/admin/courses")
def admin_list_courses(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    courses = db.query(Course).order_by(Course.id.desc()).all()

    teacher_ids = list({c.teacher_id for c in courses if c.teacher_id})
    teachers_map: dict[int, User] = {}
    if teacher_ids:
        teachers = db.query(User).filter(User.id.in_(teacher_ids)).all()
        teachers_map = {t.id: t for t in teachers}

    result = []
    for c in courses:
        enrollment_count = (
            db.query(func.count(Enrollment.id))
            .filter(Enrollment.course_id == c.id, Enrollment.status == "active")
            .scalar()
            or 0
        )
        teacher = teachers_map.get(c.teacher_id)
        result.append({
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "created_at": str(c.created_at),
            "enrollments": enrollment_count,
            "teacher": {
                "id": teacher.id,
                "full_name": teacher.full_name,
                "email": teacher.email,
            } if teacher else None,
        })
    return result


# ── Activity feed (audit log) ─────────────────────────────────────────────────

@router.get("/admin/activity")
def admin_activity(
    limit: int = Query(default=60, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.id.desc())
        .limit(limit)
        .all()
    )

    actor_ids = list({log.actor_user_id for log in logs if log.actor_user_id})
    actors_map: dict[int, User] = {}
    if actor_ids:
        actors = db.query(User).filter(User.id.in_(actor_ids)).all()
        actors_map = {a.id: a for a in actors}

    result = []
    for log in logs:
        actor = actors_map.get(log.actor_user_id) if log.actor_user_id else None
        result.append({
            "id": log.id,
            "action": log.action,
            "entity": log.entity,
            "entity_id": log.entity_id,
            "created_at": str(log.created_at),
            "actor": {
                "id": actor.id,
                "full_name": actor.full_name,
                "email": actor.email,
                "role": actor.role,
            } if actor else None,
        })
    return result


# ── ML Retraining ─────────────────────────────────────────────────────────────

@router.post("/admin/retrain", status_code=202)
def admin_trigger_retrain(
    user: User = Depends(require_roles(*_ADMIN_ROLES)),
):
    """
    Manually trigger an immediate model retrain in a background thread.
    Returns 202 Accepted — check server logs for completion status.
    """
    import threading
    from app.services.retrain import retrain_model_job

    thread = threading.Thread(target=retrain_model_job, daemon=True, name="manual-retrain")
    thread.start()
    return {"status": "accepted", "message": "Retraining started in background. Check server logs for results."}
