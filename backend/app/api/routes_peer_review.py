import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.assignment import Assignment, Submission
from app.models.course import Course, Lesson, Module
from app.models.enrollment import Enrollment
from app.models.peer_review import PeerReview
from app.models.user import User, UserRole

router = APIRouter()


class PeerReviewSubmit(BaseModel):
    score: int
    feedback: str | None = None


@router.post("/assignments/{assignment_id}/peer-review/assign")
def assign_peer_reviews(
    assignment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Teacher triggers peer review assignment after deadline."""
    if user.role not in (UserRole.teacher, UserRole.admin, UserRole.co_admin):
        raise HTTPException(403, "Teachers only")

    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    if not assignment.peer_review_enabled:
        raise HTTPException(400, "Peer review is not enabled for this assignment")

    # Verify teacher owns the course
    lesson = db.get(Lesson, assignment.lesson_id)
    module = db.get(Module, lesson.module_id)
    course = db.get(Course, module.course_id)
    if user.role == UserRole.teacher and course.teacher_id != user.id:
        raise HTTPException(403, "You do not own this course")

    # Get all submitted submissions
    submissions = (
        db.query(Submission)
        .filter(Submission.assignment_id == assignment_id, Submission.is_submitted == True)  # noqa: E712
        .all()
    )

    if len(submissions) < 2:
        raise HTTPException(400, "Need at least 2 submissions to assign peer reviews")

    # Get all enrolled students for pool of reviewers
    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.course_id == course.id, Enrollment.status == "active")
        .all()
    )
    enrolled_ids = {e.student_id for e in enrollments}

    num_reviewers = min(assignment.num_reviewers, len(submissions) - 1)
    created = 0

    for sub in submissions:
        # Possible reviewers: enrolled students who didn't make this submission
        possible = [sid for sid in enrolled_ids if sid != sub.student_id]
        random.shuffle(possible)
        assigned = 0
        for reviewer_id in possible:
            if assigned >= num_reviewers:
                break
            # Skip if already assigned
            existing = (
                db.query(PeerReview)
                .filter(PeerReview.submission_id == sub.id, PeerReview.reviewer_id == reviewer_id)
                .first()
            )
            if not existing:
                db.add(PeerReview(submission_id=sub.id, reviewer_id=reviewer_id))
                assigned += 1
                created += 1

    db.commit()
    return {"status": "ok", "peer_reviews_created": created}


@router.get("/me/peer-reviews-pending")
def my_pending_reviews(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Student sees peer reviews they still need to complete."""
    pending = (
        db.query(PeerReview)
        .filter(PeerReview.reviewer_id == user.id, PeerReview.submitted_at.is_(None))
        .all()
    )

    result = []
    for pr in pending:
        sub = db.get(Submission, pr.submission_id)
        if not sub:
            continue
        assignment = db.get(Assignment, sub.assignment_id)
        if not assignment:
            continue
        lesson = db.get(Lesson, assignment.lesson_id)
        module = db.get(Module, lesson.module_id) if lesson else None
        course = db.get(Course, module.course_id) if module else None

        snippet = ""
        if sub.text_body:
            import re
            plain = re.sub(r"<[^>]+>", "", sub.text_body)
            snippet = plain[:200] + ("…" if len(plain) > 200 else "")

        result.append({
            "peer_review_id": pr.id,
            "submission_id": sub.id,
            "assignment_id": assignment.id,
            "assignment_title": assignment.title,
            "max_score": assignment.max_score,
            "course_title": course.title if course else "",
            "submission_snippet": snippet,
            "file_url": sub.file_url,
            "file_name": sub.file_name,
            "assigned_at": pr.assigned_at,
        })

    return {"pending": result}


@router.post("/peer-reviews/{peer_review_id}/submit")
def submit_peer_review(
    peer_review_id: int,
    payload: PeerReviewSubmit,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pr = db.get(PeerReview, peer_review_id)
    if not pr:
        raise HTTPException(404, "Peer review not found")
    if pr.reviewer_id != user.id:
        raise HTTPException(403, "Not your review")
    if pr.submitted_at is not None:
        raise HTTPException(400, "Already submitted")

    # Validate score range
    sub = db.get(Submission, pr.submission_id)
    assignment = db.get(Assignment, sub.assignment_id) if sub else None
    if assignment and (payload.score < 0 or payload.score > assignment.max_score):
        raise HTTPException(400, f"Score must be between 0 and {assignment.max_score}")

    pr.score = payload.score
    pr.feedback = payload.feedback
    pr.submitted_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok"}


@router.get("/submissions/{submission_id}/peer-reviews")
def get_submission_peer_reviews(
    submission_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get peer reviews for a submission (student sees their own; teacher sees all)."""
    sub = db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")

    # Authorization: student must own the submission, or be a teacher
    if user.role == UserRole.student and sub.student_id != user.id:
        raise HTTPException(403, "Not your submission")

    reviews = (
        db.query(PeerReview)
        .filter(PeerReview.submission_id == submission_id, PeerReview.submitted_at.isnot(None))
        .all()
    )

    return [
        {
            "id": pr.id,
            "score": pr.score,
            "feedback": pr.feedback,
            "submitted_at": pr.submitted_at,
        }
        for pr in reviews
    ]
