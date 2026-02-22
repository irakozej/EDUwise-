from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.course import Lesson, Module
from app.models.enrollment import Enrollment
from app.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from app.models.user import User, UserRole
from app.schemas.quizzes import (
    QuizCreate, QuizOut,
    QuestionCreate, QuestionOut,
    PublishRequest,
    StartAttemptRequest, AttemptOut,
    SubmitAttemptRequest,
)
from app.services.audit import log_action

router = APIRouter()


def _get_lesson(db: Session, lesson_id: int) -> Lesson | None:
    return db.get(Lesson, lesson_id)


def _get_course_id_for_lesson(db: Session, lesson_id: int) -> int:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    module = db.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(500, "Module not found for lesson")

    return module.course_id


# ---------- Teacher/Admin ----------
@router.post("/quizzes", response_model=QuizOut)
def create_quiz(
    payload: QuizCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    lesson = _get_lesson(db, payload.lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    quiz = Quiz(lesson_id=payload.lesson_id, title=payload.title, is_published=False)
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    log_action(db, user.id, "CREATE", "Quiz", str(quiz.id))
    return QuizOut(id=quiz.id, lesson_id=quiz.lesson_id, title=quiz.title, is_published=quiz.is_published)


@router.post("/quizzes/{quiz_id}/questions", response_model=QuestionOut)
def add_question(
    quiz_id: int,
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")

    q = QuizQuestion(
        quiz_id=quiz_id,
        question_text=payload.question_text,
        option_a=payload.option_a,
        option_b=payload.option_b,
        option_c=payload.option_c,
        option_d=payload.option_d,
        correct_option=payload.correct_option,
        topic=payload.topic,
        difficulty=payload.difficulty,
    )
    db.add(q)
    db.commit()
    db.refresh(q)

    log_action(db, user.id, "CREATE", "QuizQuestion", str(q.id))
    return QuestionOut(
        id=q.id,
        quiz_id=q.quiz_id,
        question_text=q.question_text,
        option_a=q.option_a,
        option_b=q.option_b,
        option_c=q.option_c,
        option_d=q.option_d,
        topic=q.topic,
        difficulty=q.difficulty,
    )


@router.patch("/quizzes/{quiz_id}/publish", response_model=QuizOut)
def publish_quiz(
    quiz_id: int,
    payload: PublishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")

    quiz.is_published = payload.is_published
    db.commit()
    db.refresh(quiz)

    log_action(db, user.id, "UPDATE", "Quiz", str(quiz.id))
    return QuizOut(id=quiz.id, lesson_id=quiz.lesson_id, title=quiz.title, is_published=quiz.is_published)


@router.get("/lessons/{lesson_id}/quizzes", response_model=list[QuizOut])
def list_quizzes_for_lesson(
    lesson_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quizzes = db.query(Quiz).filter(Quiz.lesson_id == lesson_id).order_by(Quiz.id.asc()).all()

    # Students should only see published quizzes
    if user.role == UserRole.student:
        quizzes = [q for q in quizzes if q.is_published]

    return [
        QuizOut(id=q.id, lesson_id=q.lesson_id, title=q.title, is_published=q.is_published)
        for q in quizzes
    ]


@router.get("/quizzes/{quiz_id}/questions", response_model=list[QuestionOut])
def list_questions(
    quiz_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")

    if user.role == UserRole.student and not quiz.is_published:
        raise HTTPException(403, "Quiz not published")

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.id.asc())
        .all()
    )

    return [
        QuestionOut(
            id=q.id,
            quiz_id=q.quiz_id,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            topic=q.topic,
            difficulty=q.difficulty,
        )
        for q in questions
    ]


# ---------- Student Attempt ----------
@router.post("/attempts/start", response_model=AttemptOut)
def start_attempt(
    payload: StartAttemptRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    quiz = db.get(Quiz, payload.quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if not quiz.is_published:
        raise HTTPException(403, "Quiz not published")

    course_id = _get_course_id_for_lesson(db, quiz.lesson_id)

    enrolled = (
        db.query(Enrollment)
        .filter(
            Enrollment.student_id == user.id,
            Enrollment.course_id == course_id,
            Enrollment.status == "active",
        )
        .first()
    )
    if not enrolled:
        raise HTTPException(403, "Student not enrolled in this course")

    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == user.id,
            QuizAttempt.quiz_id == payload.quiz_id,
        )
        .first()
    )

    # Return existing attempt if already started (or submitted)
    if attempt:
        return AttemptOut(
            attempt_id=attempt.id,
            quiz_id=attempt.quiz_id,
            is_submitted=attempt.is_submitted,
            score_pct=attempt.score_pct,
        )

    attempt = QuizAttempt(student_id=user.id, quiz_id=payload.quiz_id, score_pct=0, is_submitted=False)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    log_action(db, user.id, "CREATE", "QuizAttempt", str(attempt.id))
    return AttemptOut(
        attempt_id=attempt.id,
        quiz_id=attempt.quiz_id,
        is_submitted=attempt.is_submitted,
        score_pct=attempt.score_pct,
    )


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptOut)
def submit_attempt(
    attempt_id: int,
    payload: SubmitAttemptRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    attempt = db.get(QuizAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if attempt.student_id != user.id:
        raise HTTPException(403, "Not your attempt")

    if attempt.is_submitted:
        return AttemptOut(
            attempt_id=attempt.id,
            quiz_id=attempt.quiz_id,
            is_submitted=True,
            score_pct=attempt.score_pct,
        )

    quiz = db.get(Quiz, attempt.quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if not quiz.is_published:
        raise HTTPException(403, "Quiz not published")

    # Ensure enrollment (defense-in-depth)
    course_id = _get_course_id_for_lesson(db, quiz.lesson_id)
    enrolled = (
        db.query(Enrollment)
        .filter(
            Enrollment.student_id == user.id,
            Enrollment.course_id == course_id,
            Enrollment.status == "active",
        )
        .first()
    )
    if not enrolled:
        raise HTTPException(403, "Student not enrolled in this course")

    questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).all()
    if not questions:
        raise HTTPException(400, "Quiz has no questions")

    qmap = {q.id: q for q in questions}
    correct = 0
    total = len(questions)

    # Upsert answers
    for ans in payload.answers:
        q = qmap.get(ans.question_id)
        if not q:
            raise HTTPException(400, f"Question {ans.question_id} not in quiz")

        is_correct = (ans.selected_option == q.correct_option)
        existing = (
            db.query(QuizAnswer)
            .filter(
                QuizAnswer.attempt_id == attempt.id,
                QuizAnswer.question_id == q.id,
            )
            .first()
        )

        if existing:
            existing.selected_option = ans.selected_option
            existing.is_correct = is_correct
        else:
            db.add(
                QuizAnswer(
                    attempt_id=attempt.id,
                    question_id=q.id,
                    selected_option=ans.selected_option,
                    is_correct=is_correct,
                )
            )

        if is_correct:
            correct += 1

    score_pct = int(round((correct / total) * 100))
    attempt.score_pct = score_pct
    attempt.is_submitted = True
    attempt.submitted_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(attempt)

    log_action(db, user.id, "SUBMIT", "QuizAttempt", str(attempt.id))
    return AttemptOut(
        attempt_id=attempt.id,
        quiz_id=attempt.quiz_id,
        is_submitted=attempt.is_submitted,
        score_pct=attempt.score_pct,
    )