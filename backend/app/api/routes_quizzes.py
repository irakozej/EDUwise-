from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.services.notifications import push_notification

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.course import Course, Lesson, Module
from app.models.enrollment import Enrollment
from app.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from app.models.user import User, UserRole
from app.schemas.quizzes import (
    QuizCreate, QuizOut,
    QuestionCreate, QuestionOut,
    PublishRequest, TimeLimitRequest,
    StartAttemptRequest, AttemptOut,
    SubmitAttemptRequest, QuestionResult,
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

    quiz = Quiz(lesson_id=payload.lesson_id, title=payload.title, is_published=False, time_limit_minutes=payload.time_limit_minutes)
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    log_action(db, user.id, "CREATE", "Quiz", str(quiz.id))

    # Notify all enrolled students
    course_id = _get_course_id_for_lesson(db, payload.lesson_id)
    course = db.get(Course, course_id)
    enrolled_students = (
        db.query(Enrollment)
        .filter(Enrollment.course_id == course_id, Enrollment.status == "active")
        .all()
    )
    for enroll in enrolled_students:
        push_notification(
            db, enroll.student_id, "new_quiz",
            f'New quiz in "{course.title}"',
            f'"{quiz.title}" has been added. Check it out!',
            f"/student/courses/{course_id}",
        )
    db.commit()

    return QuizOut(id=quiz.id, lesson_id=quiz.lesson_id, title=quiz.title, is_published=quiz.is_published, time_limit_minutes=quiz.time_limit_minutes)


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
    return QuizOut(id=quiz.id, lesson_id=quiz.lesson_id, title=quiz.title, is_published=quiz.is_published, time_limit_minutes=quiz.time_limit_minutes)


@router.patch("/quizzes/{quiz_id}/time-limit", response_model=QuizOut)
def set_time_limit(
    quiz_id: int,
    payload: TimeLimitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")

    quiz.time_limit_minutes = payload.time_limit_minutes
    db.commit()
    db.refresh(quiz)

    log_action(db, user.id, "UPDATE", "Quiz", str(quiz.id))
    return QuizOut(id=quiz.id, lesson_id=quiz.lesson_id, title=quiz.title, is_published=quiz.is_published, time_limit_minutes=quiz.time_limit_minutes)


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
        QuizOut(id=q.id, lesson_id=q.lesson_id, title=q.title, is_published=q.is_published, time_limit_minutes=q.time_limit_minutes)
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
        results = []
        if attempt.is_submitted:
            answers = db.query(QuizAnswer).filter(QuizAnswer.attempt_id == attempt.id).all()
            qmap = {q.id: q for q in db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).all()}
            results = [
                QuestionResult(
                    question_id=a.question_id,
                    selected_option=a.selected_option,
                    correct_option=qmap[a.question_id].correct_option if a.question_id in qmap else "",
                    is_correct=a.is_correct,
                )
                for a in answers
            ]
        return AttemptOut(
            attempt_id=attempt.id,
            quiz_id=attempt.quiz_id,
            is_submitted=attempt.is_submitted,
            score_pct=attempt.score_pct,
            time_limit_minutes=quiz.time_limit_minutes,
            started_at=str(attempt.started_at) if attempt.started_at else None,
            results=results,
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
        time_limit_minutes=quiz.time_limit_minutes,
        started_at=str(attempt.started_at) if attempt.started_at else None,
        results=[],
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

    # Award XP based on score
    from app.services.gamification import award_xp
    if score_pct == 100:
        award_xp(db, user.id, "quiz_ace", attempt.id)
    elif score_pct >= 60:
        award_xp(db, user.id, "quiz_pass", attempt.id)

    # Notify student of quiz result
    result_label = "Perfect score!" if score_pct == 100 else ("Passed" if score_pct >= 60 else "Keep practising")
    push_notification(
        db,
        recipient_id=user.id,
        type_="quiz_graded",
        title=f"Quiz result: {score_pct}% — {result_label}",
        body=f"You scored {correct}/{total} on '{quiz.title}'.",
        link="/student/quizzes",
    )
    db.commit()

    # Auto-update lesson progress based on quiz performance
    try:
        from app.services.progress import auto_update_progress
        auto_update_progress(db, user.id, quiz.lesson_id)
    except Exception:
        pass

    # Build per-question results for instant feedback
    all_answers = db.query(QuizAnswer).filter(QuizAnswer.attempt_id == attempt.id).all()
    results = [
        QuestionResult(
            question_id=a.question_id,
            selected_option=a.selected_option,
            correct_option=qmap[a.question_id].correct_option,
            is_correct=a.is_correct,
        )
        for a in all_answers
        if a.question_id in qmap
    ]

    return AttemptOut(
        attempt_id=attempt.id,
        quiz_id=attempt.quiz_id,
        is_submitted=attempt.is_submitted,
        score_pct=attempt.score_pct,
        time_limit_minutes=quiz.time_limit_minutes,
        started_at=str(attempt.started_at) if attempt.started_at else None,
        results=results,
    )


# ---------- Quiz / Question editing (Teacher/Admin) ----------

def _quiz_owner_check(db: Session, quiz: Quiz, user: User) -> None:
    lesson = db.get(Lesson, quiz.lesson_id)
    if not lesson:
        raise HTTPException(500, "Lesson not found")
    module = db.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(500, "Module not found")
    course = db.get(Course, module.course_id)
    if not course:
        raise HTTPException(500, "Course not found")
    if user.role != UserRole.admin and course.teacher_id != user.id:
        raise HTTPException(403, "Not your course")


@router.patch("/quizzes/{quiz_id}", response_model=QuizOut)
def update_quiz(
    quiz_id: int,
    payload: QuizCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    _quiz_owner_check(db, quiz, user)
    if payload.title:
        quiz.title = payload.title.strip()
    quiz.time_limit_minutes = payload.time_limit_minutes
    db.commit()
    db.refresh(quiz)
    log_action(db, user.id, "UPDATE", "Quiz", str(quiz.id))
    return QuizOut(id=quiz.id, lesson_id=quiz.lesson_id, title=quiz.title, is_published=quiz.is_published, time_limit_minutes=quiz.time_limit_minutes)


@router.delete("/quizzes/{quiz_id}", status_code=204)
def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    _quiz_owner_check(db, quiz, user)
    # Delete attempts & answers first to avoid FK violations
    attempt_ids = [a.id for a in db.query(QuizAttempt.id).filter(QuizAttempt.quiz_id == quiz_id).all()]
    if attempt_ids:
        db.query(QuizAnswer).filter(QuizAnswer.attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
    db.query(QuizAttempt).filter(QuizAttempt.quiz_id == quiz_id).delete(synchronize_session=False)
    db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).delete(synchronize_session=False)
    log_action(db, user.id, "DELETE", "Quiz", str(quiz_id))
    db.delete(quiz)
    db.commit()


@router.patch("/quiz-questions/{question_id}", response_model=QuestionOut)
def update_question(
    question_id: int,
    payload: QuestionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    q = db.get(QuizQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found")
    quiz = db.get(Quiz, q.quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    _quiz_owner_check(db, quiz, user)
    q.question_text = payload.question_text
    q.option_a = payload.option_a
    q.option_b = payload.option_b
    q.option_c = payload.option_c
    q.option_d = payload.option_d
    q.correct_option = payload.correct_option
    q.topic = payload.topic
    q.difficulty = payload.difficulty
    db.commit()
    db.refresh(q)
    log_action(db, user.id, "UPDATE", "QuizQuestion", str(q.id))
    return QuestionOut(
        id=q.id, quiz_id=q.quiz_id, question_text=q.question_text,
        option_a=q.option_a, option_b=q.option_b, option_c=q.option_c, option_d=q.option_d,
        topic=q.topic, difficulty=q.difficulty,
    )


@router.delete("/quiz-questions/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.teacher, UserRole.admin)),
):
    q = db.get(QuizQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found")
    quiz = db.get(Quiz, q.quiz_id)
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    _quiz_owner_check(db, quiz, user)
    # Remove related answers before deleting the question
    db.query(QuizAnswer).filter(QuizAnswer.question_id == question_id).delete(synchronize_session=False)
    log_action(db, user.id, "DELETE", "QuizQuestion", str(question_id))
    db.delete(q)
    db.commit()