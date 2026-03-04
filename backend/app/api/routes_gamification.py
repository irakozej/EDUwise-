from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enrollment import Enrollment
from app.models.gamification import XPLog, StudentBadge
from app.models.user import User, UserRole
from app.services.gamification import BADGES, get_total_xp, xp_to_level

router = APIRouter()


@router.get("/me/xp")
def my_xp(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    total = get_total_xp(db, user.id)
    level = xp_to_level(total)
    xp_to_next = (level * 100) - total if level < 10 else 0

    recent = (
        db.query(XPLog)
        .filter(XPLog.student_id == user.id)
        .order_by(XPLog.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "total_xp": total,
        "level": level,
        "xp_to_next_level": xp_to_next,
        "recent_events": [
            {
                "event_type": e.event_type,
                "xp_earned": e.xp_earned,
                "created_at": e.created_at,
            }
            for e in recent
        ],
    }


@router.get("/me/badges")
def my_badges(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    earned_rows = (
        db.query(StudentBadge)
        .filter(StudentBadge.student_id == user.id)
        .all()
    )
    earned_map = {b.badge_key: b.earned_at for b in earned_rows}

    return {
        "earned": [
            {
                "badge_key": key,
                "name": info["name"],
                "desc": info["desc"],
                "icon": info["icon"],
                "earned_at": earned_map[key],
            }
            for key, info in BADGES.items()
            if key in earned_map
        ],
        "all_badges": [
            {
                "badge_key": key,
                "name": info["name"],
                "desc": info["desc"],
                "icon": info["icon"],
                "earned": key in earned_map,
                "earned_at": earned_map.get(key),
            }
            for key, info in BADGES.items()
        ],
    }


@router.get("/courses/{course_id}/leaderboard")
def course_leaderboard(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Only enrolled students or teachers can see the leaderboard
    if user.role == UserRole.student:
        enrolled = (
            db.query(Enrollment)
            .filter(Enrollment.course_id == course_id, Enrollment.student_id == user.id, Enrollment.status == "active")
            .first()
        )
        if not enrolled:
            raise HTTPException(403, "Not enrolled in this course")

    # Get all active enrollments for this course
    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.course_id == course_id, Enrollment.status == "active")
        .all()
    )
    student_ids = [e.student_id for e in enrollments]

    if not student_ids:
        return {"leaderboard": []}

    # Sum XP per student
    xp_rows = (
        db.query(XPLog.student_id, func.sum(XPLog.xp_earned).label("total_xp"))
        .filter(XPLog.student_id.in_(student_ids))
        .group_by(XPLog.student_id)
        .all()
    )
    xp_map = {row.student_id: row.total_xp for row in xp_rows}

    # Get student names
    from app.models.user import User as UserModel
    students = db.query(UserModel).filter(UserModel.id.in_(student_ids)).all()
    name_map = {s.id: s.full_name for s in students}

    # Sort by XP descending
    ranked = sorted(student_ids, key=lambda sid: xp_map.get(sid, 0), reverse=True)[:10]

    return {
        "leaderboard": [
            {
                "rank": i + 1,
                "student_id": sid,
                "student_name": name_map.get(sid, "Unknown"),
                "total_xp": xp_map.get(sid, 0),
                "level": xp_to_level(xp_map.get(sid, 0)),
                "is_me": sid == user.id,
            }
            for i, sid in enumerate(ranked)
        ]
    }
