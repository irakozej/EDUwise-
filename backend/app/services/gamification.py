"""Gamification service: XP awarding + badge checking."""
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.gamification import XPLog, StudentBadge

XP_TABLE = {
    "lesson_complete": 10,
    "quiz_pass": 25,
    "quiz_ace": 50,
    "assignment_submit": 15,
    "assignment_honor": 30,
    "discussion_post": 5,
    "streak_7": 100,
    "streak_30": 500,
}

BADGES = {
    "first_step":      {"name": "First Step",        "desc": "Complete your first lesson",         "icon": "🎯"},
    "bookworm":        {"name": "Bookworm",           "desc": "Complete 10 lessons",                "icon": "📚"},
    "quiz_ace":        {"name": "Quiz Ace",           "desc": "Score 100% on a quiz",              "icon": "🏆"},
    "streak_7":        {"name": "Week Warrior",       "desc": "Study 7 days in a row",             "icon": "🔥"},
    "streak_30":       {"name": "Month Master",       "desc": "Study 30 days in a row",            "icon": "⚡"},
    "submitter":       {"name": "Submitter",          "desc": "Submit your first assignment",      "icon": "📝"},
    "honor_roll":      {"name": "Honor Roll",         "desc": "Score 90%+ on an assignment",       "icon": "🌟"},
    "certified":       {"name": "Certified",          "desc": "Earn your first certificate",       "icon": "🎓"},
    "conversational":  {"name": "Conversationalist",  "desc": "Post 10 discussion comments",       "icon": "💬"},
    "fast_learner":    {"name": "Fast Learner",       "desc": "Complete a course within 7 days",   "icon": "⚡"},
}


def award_xp(db: Session, student_id: int, event_type: str, ref_id: int | None = None) -> int:
    """Award XP for an event. Returns XP awarded (0 if unknown event)."""
    xp = XP_TABLE.get(event_type, 0)
    if xp == 0:
        return 0
    db.add(XPLog(student_id=student_id, event_type=event_type, xp_earned=xp, ref_id=ref_id))
    db.flush()
    _check_badges(db, student_id, event_type)
    return xp


def _has_badge(db: Session, student_id: int, key: str) -> bool:
    return db.query(StudentBadge).filter(
        StudentBadge.student_id == student_id,
        StudentBadge.badge_key == key,
    ).first() is not None


def _grant_badge(db: Session, student_id: int, key: str):
    if not _has_badge(db, student_id, key):
        db.add(StudentBadge(student_id=student_id, badge_key=key))
        db.flush()


def _check_badges(db: Session, student_id: int, event_type: str):
    from app.models.progress import LessonProgress
    from app.models.quiz import QuizAttempt
    from app.models.assignment import Submission
    from app.models.comment import Comment

    # first_step: first lesson completed
    if event_type == "lesson_complete":
        count = db.query(LessonProgress).filter(
            LessonProgress.student_id == student_id,
            LessonProgress.progress_pct >= 100,
        ).count()
        if count >= 1:
            _grant_badge(db, student_id, "first_step")
        if count >= 10:
            _grant_badge(db, student_id, "bookworm")

    # quiz_ace: perfect quiz
    if event_type == "quiz_ace":
        _grant_badge(db, student_id, "quiz_ace")

    # submitter: first assignment submitted
    if event_type == "assignment_submit":
        count = db.query(Submission).filter(
            Submission.student_id == student_id,
            Submission.is_submitted == True,  # noqa: E712
        ).count()
        if count >= 1:
            _grant_badge(db, student_id, "submitter")

    # honor_roll: grade >= 90%
    if event_type == "assignment_honor":
        _grant_badge(db, student_id, "honor_roll")

    # conversational: 10 discussion posts
    if event_type == "discussion_post":
        count = db.query(Comment).filter(Comment.author_id == student_id).count()
        if count >= 10:
            _grant_badge(db, student_id, "conversational")

    # streak badges
    if event_type in ("streak_7", "streak_30"):
        if event_type == "streak_7":
            _grant_badge(db, student_id, "streak_7")
        else:
            _grant_badge(db, student_id, "streak_30")


def get_total_xp(db: Session, student_id: int) -> int:
    from sqlalchemy import func
    result = db.query(func.sum(XPLog.xp_earned)).filter(XPLog.student_id == student_id).scalar()
    return result or 0


def xp_to_level(total_xp: int) -> int:
    """Level formula: 1 + total_xp // 100, capped at 10."""
    return min(10, 1 + total_xp // 100)
