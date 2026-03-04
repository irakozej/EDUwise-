from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.ml.feature_builder import build_student_features
from app.ml.risk_predictor import predict_risk
from app.services.notifications import push_notification

router = APIRouter()

_RISK_MESSAGES = {
    "low":    ("Your learning is on track", "Keep up the great work! Your risk score is low."),
    "medium": ("Your risk level has increased", "You may be falling behind. Try to complete more lessons and quizzes this week."),
    "high":   ("You are at high risk of falling behind", "Please engage with your courses urgently — complete lessons, attempt quizzes, and reach out to your teacher if you need help."),
}


@router.get("/me/risk-score")
def me_risk_score(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    feats = build_student_features(db, user.id)
    risk = predict_risk(feats)

    new_label = "high" if risk >= 0.7 else ("medium" if risk >= 0.4 else "low")
    prev_label = user.last_risk_label

    # Only notify when the label genuinely changes
    if prev_label != new_label:
        title, body = _RISK_MESSAGES[new_label]
        push_notification(
            db, recipient_id=user.id, type_="risk_change",
            title=title, body=body, link="/student",
        )
        user.last_risk_label = new_label
        db.commit()

    return {"student_id": user.id, "risk_score": risk, "risk_label": new_label, "features": feats}


@router.get("/teacher/courses/{course_id}/at-risk")
def course_at_risk_students(
    course_id: int,
    threshold: float = 0.5,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    """Return enrolled students with risk_score >= threshold (default 0.5)."""
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")

    enrollments = (
        db.query(Enrollment, User)
        .join(User, User.id == Enrollment.student_id)
        .filter(
            Enrollment.course_id == course_id,
            Enrollment.status == "active",
            User.role == UserRole.student,
        )
        .all()
    )

    result = []
    for _, student in enrollments:
        feats = build_student_features(db, student.id)
        risk = predict_risk(feats)
        result.append({
            "student_id": student.id,
            "full_name": student.full_name,
            "email": student.email,
            "risk_score": risk,
            "risk_label": "high" if risk >= 0.7 else ("medium" if risk >= 0.4 else "low"),
            "avg_progress": feats["avg_progress"],
            "avg_quiz_score": feats["avg_quiz_score"],
        })

    result.sort(key=lambda x: x["risk_score"], reverse=True)
    return [r for r in result if r["risk_score"] >= threshold]