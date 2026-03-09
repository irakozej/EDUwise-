import json
import os
import re
from datetime import datetime, timezone
from typing import List

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles, get_current_user
from app.db.session import get_db
from app.models.course import Lesson, Module
from app.models.enrollment import Enrollment
from app.models.event import Event
from app.models.exercise import ExerciseAttempt, ExerciseAnswer, ExerciseQuestion
from app.models.user import User, UserRole

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ExerciseQuestionOut(BaseModel):
    id: int
    question_index: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str

    model_config = {"from_attributes": True}


class GenerateExercisesResponse(BaseModel):
    attempt_id: int
    lesson_id: int
    lesson_title: str
    questions: List[ExerciseQuestionOut]


class AnswerIn(BaseModel):
    question_id: int
    selected_option: str  # A/B/C/D


class SubmitExerciseRequest(BaseModel):
    answers: List[AnswerIn]


class QuestionResult(BaseModel):
    question_id: int
    question_index: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    selected_option: str
    correct_option: str
    is_correct: bool
    explanation: str | None


class SubmitExerciseResponse(BaseModel):
    attempt_id: int
    score_pct: int
    correct_count: int
    total: int
    results: List[QuestionResult]


class ExerciseAttemptSummary(BaseModel):
    attempt_id: int
    lesson_id: int
    lesson_title: str
    course_id: int
    course_title: str
    score_pct: int
    submitted_at: str | None
    total_questions: int


# ── Generate exercises ────────────────────────────────────────────────────────

@router.post("/lessons/{lesson_id}/generate-exercises", response_model=GenerateExercisesResponse)
def generate_exercises(
    lesson_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Generate 10 AI-powered MCQ exercises for a lesson. Student must be enrolled."""
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    # Check enrollment via module → course
    module = db.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(404, "Module not found")

    enrolled = (
        db.query(Enrollment)
        .filter(
            Enrollment.student_id == user.id,
            Enrollment.course_id == module.course_id,
            Enrollment.status == "active",
        )
        .first()
    )
    if not enrolled:
        raise HTTPException(403, "You are not enrolled in this course")

    content = (lesson.content or "").strip()
    plain = re.sub(r"<[^>]+>", "", content).strip()
    if len(plain) < 50:
        raise HTTPException(
            400,
            "This lesson doesn't have enough content yet to generate exercises. "
            "Ask your teacher to add more lesson content.",
        )

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "AI service not configured")

    client = Anthropic(api_key=api_key)
    prompt = (
        "Generate exactly 10 multiple-choice practice exercises based on the following lesson content. "
        "Return ONLY a valid JSON array with no markdown, no explanation, no other text. "
        "Each element must be an object with these exact keys: "
        '"question_text", "option_a", "option_b", "option_c", "option_d", '
        '"correct_option" (must be exactly "A", "B", "C", or "D"), '
        '"explanation" (1–2 sentences explaining why the correct answer is right). '
        "Make the questions varied — test understanding, application, and recall. "
        "Do not repeat similar questions.\n\n"
        f"Lesson content:\n{plain[:5000]}"
    )

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=3000,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        raise HTTPException(502, f"AI service error: {exc}")

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        questions_data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(500, "AI returned invalid JSON — please try again")

    if not isinstance(questions_data, list):
        raise HTTPException(500, "AI returned unexpected format — please try again")

    required = {"question_text", "option_a", "option_b", "option_c", "option_d", "correct_option"}
    valid = [
        q for q in questions_data
        if isinstance(q, dict)
        and required.issubset(q.keys())
        and q.get("correct_option", "").upper() in {"A", "B", "C", "D"}
    ]

    if len(valid) < 5:
        raise HTTPException(500, "AI could not generate enough valid questions — please try again")

    # Limit to 10
    valid = valid[:10]

    # Persist attempt and questions
    attempt = ExerciseAttempt(student_id=user.id, lesson_id=lesson_id)
    db.add(attempt)
    db.flush()  # get attempt.id

    eq_list: List[ExerciseQuestion] = []
    for idx, q in enumerate(valid):
        eq = ExerciseQuestion(
            attempt_id=attempt.id,
            question_index=idx,
            question_text=q["question_text"],
            option_a=q["option_a"],
            option_b=q["option_b"],
            option_c=q["option_c"],
            option_d=q["option_d"],
            correct_option=q["correct_option"].upper(),
            explanation=q.get("explanation"),
        )
        db.add(eq)
        eq_list.append(eq)

    # Log event
    db.add(Event(
        student_id=user.id,
        course_id=module.course_id,
        lesson_id=lesson_id,
        event_type="exercise_start",
    ))

    db.commit()
    db.refresh(attempt)
    for eq in eq_list:
        db.refresh(eq)

    return GenerateExercisesResponse(
        attempt_id=attempt.id,
        lesson_id=lesson_id,
        lesson_title=lesson.title,
        questions=[
            ExerciseQuestionOut(
                id=eq.id,
                question_index=eq.question_index,
                question_text=eq.question_text,
                option_a=eq.option_a,
                option_b=eq.option_b,
                option_c=eq.option_c,
                option_d=eq.option_d,
            )
            for eq in eq_list
        ],
    )


# ── Submit attempt ────────────────────────────────────────────────────────────

@router.post("/exercise-attempts/{attempt_id}/submit", response_model=SubmitExerciseResponse)
def submit_exercise(
    attempt_id: int,
    payload: SubmitExerciseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Submit answers for an exercise attempt. Returns graded results with corrections."""
    attempt = db.get(ExerciseAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Exercise attempt not found")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Not your attempt")
    if attempt.is_submitted:
        raise HTTPException(400, "This exercise has already been submitted")

    questions = (
        db.query(ExerciseQuestion)
        .filter(ExerciseQuestion.attempt_id == attempt_id)
        .order_by(ExerciseQuestion.question_index)
        .all()
    )

    answer_map = {a.question_id: a.selected_option.upper() for a in payload.answers}

    results: List[QuestionResult] = []
    correct_count = 0

    for q in questions:
        selected = answer_map.get(q.id, "A")  # default A if not answered
        is_correct = selected == q.correct_option

        if is_correct:
            correct_count += 1

        db.add(ExerciseAnswer(
            attempt_id=attempt_id,
            question_id=q.id,
            selected_option=selected,
            is_correct=is_correct,
        ))

        results.append(QuestionResult(
            question_id=q.id,
            question_index=q.question_index,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            selected_option=selected,
            correct_option=q.correct_option,
            is_correct=is_correct,
            explanation=q.explanation,
        ))

    total = len(questions)
    score_pct = int(round((correct_count / total) * 100)) if total else 0

    attempt.score_pct = score_pct
    attempt.is_submitted = True
    attempt.submitted_at = datetime.now(timezone.utc)

    # Log exercise_submit event for risk prediction (contributes to events_total)
    lesson = db.get(Lesson, attempt.lesson_id)
    module = db.get(Module, lesson.module_id) if lesson else None
    db.add(Event(
        student_id=user.id,
        course_id=module.course_id if module else None,
        lesson_id=attempt.lesson_id,
        event_type="exercise_submit",
        metadata={"score_pct": score_pct, "correct_count": correct_count, "total": total},
    ))

    db.commit()

    # Auto-update lesson progress
    try:
        from app.services.progress import auto_update_progress
        auto_update_progress(db, user.id, attempt.lesson_id)
    except Exception:
        pass

    return SubmitExerciseResponse(
        attempt_id=attempt_id,
        score_pct=score_pct,
        correct_count=correct_count,
        total=total,
        results=results,
    )


# ── Exercise history ──────────────────────────────────────────────────────────

@router.get("/me/exercise-attempts")
def my_exercise_attempts(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Return all submitted exercise attempts for the student."""
    from app.models.course import Course

    rows = (
        db.query(ExerciseAttempt, Lesson, Module)
        .join(Lesson, Lesson.id == ExerciseAttempt.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(
            ExerciseAttempt.student_id == user.id,
            ExerciseAttempt.is_submitted == True,  # noqa: E712
        )
        .order_by(ExerciseAttempt.submitted_at.desc())
        .all()
    )

    result = []
    for attempt, lesson, module in rows:
        course = db.get(Course, module.course_id)
        total_questions = (
            db.query(func.count(ExerciseQuestion.id))
            .filter(ExerciseQuestion.attempt_id == attempt.id)
            .scalar()
        ) or 0

        result.append({
            "attempt_id": attempt.id,
            "lesson_id": attempt.lesson_id,
            "lesson_title": lesson.title,
            "course_id": module.course_id,
            "course_title": course.title if course else "Unknown",
            "score_pct": attempt.score_pct,
            "submitted_at": str(attempt.submitted_at) if attempt.submitted_at else None,
            "total_questions": total_questions,
        })

    return result
