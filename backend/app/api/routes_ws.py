"""
WebSocket routes:
  - /ws/notifications?token=...   — real-time notifications per user
  - /ws/quiz/{quiz_id}?token=...  — live quiz session (teacher broadcasts, students receive)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from jose import jwt, JWTError

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.services.ws_manager import ws_manager

router = APIRouter()

# ── per-quiz live state (in-memory, resets on restart) ────────────────────────
# quiz_id -> {
#   "question": {..., "question_id": int, "correct_option": str},
#   "question_idx": int,   # index in questions list (for grading)
#   "accepting": bool,
#   "time_limit": int | None,   # seconds per question, set by teacher
#   "answers": {student_id: option},
#   "all_answers": {student_id: {question_id: option}},  # accumulates all questions
#   "questions": [...],   # full ordered list with question_ids
#   "participants": set(),
# }
_live_sessions: dict[int, dict[str, Any]] = {}


def _get_user_from_token(token: str) -> User | None:
    """Validate JWT and return User, or None if invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id = int(payload.get("sub", 0))
    except (JWTError, ValueError, Exception):
        return None
    db: Session = SessionLocal()
    try:
        return db.get(User, user_id)
    finally:
        db.close()


def _grade_and_save(quiz_id: int, session: dict[str, Any]) -> None:
    """Grade all student answers from the live session and persist to DB."""
    db: Session = SessionLocal()
    try:
        quiz = db.get(Quiz, quiz_id)
        if not quiz:
            return

        all_answers: dict[int, dict[int, str]] = session.get("all_answers", {})
        if not all_answers:
            return

        # Build correct_option map from DB questions
        questions = (
            db.query(QuizQuestion)
            .filter(QuizQuestion.quiz_id == quiz_id)
            .all()
        )
        correct_map = {q.id: q.correct_option for q in questions}
        total = len(questions)
        if total == 0:
            return

        for student_id, answers in all_answers.items():
            correct_count = sum(
                1 for qid, opt in answers.items()
                if correct_map.get(qid, "").upper() == opt.upper()
            )
            score_pct = int(round(correct_count / total * 100))

            # Upsert attempt — if student already has one, update it
            existing = (
                db.query(QuizAttempt)
                .filter(
                    QuizAttempt.student_id == student_id,
                    QuizAttempt.quiz_id == quiz_id,
                )
                .first()
            )
            if existing:
                attempt = existing
                attempt.score_pct = score_pct
                attempt.is_submitted = True
                attempt.submitted_at = datetime.now(timezone.utc)
                # Remove old answers
                db.query(QuizAnswer).filter(QuizAnswer.attempt_id == attempt.id).delete()
            else:
                attempt = QuizAttempt(
                    student_id=student_id,
                    quiz_id=quiz_id,
                    score_pct=score_pct,
                    is_submitted=True,
                    submitted_at=datetime.now(timezone.utc),
                )
                db.add(attempt)
                db.flush()

            for qid, opt in answers.items():
                is_correct = correct_map.get(qid, "").upper() == opt.upper()
                db.add(QuizAnswer(
                    attempt_id=attempt.id,
                    question_id=qid,
                    selected_option=opt.upper(),
                    is_correct=is_correct,
                ))

        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


# ── Notifications WebSocket ────────────────────────────────────────────────────

@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str = Query(...)):
    user = _get_user_from_token(token)
    if not user:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    ws_manager.connect(user.id, websocket)
    try:
        await websocket.send_text(json.dumps({"event": "connected", "user_id": user.id}))
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(user.id, websocket)


# ── Live Quiz WebSocket ────────────────────────────────────────────────────────

@router.websocket("/ws/quiz/{quiz_id}")
async def ws_live_quiz(websocket: WebSocket, quiz_id: int, token: str = Query(...)):
    user = _get_user_from_token(token)
    if not user:
        await websocket.close(code=4001)
        return

    db: Session = SessionLocal()
    try:
        quiz = db.get(Quiz, quiz_id)
        if not quiz:
            await websocket.close(code=4004)
            return

        is_teacher = user.role in {UserRole.teacher, UserRole.admin, UserRole.co_admin}

        if not is_teacher:
            from app.models.course import Lesson, Module
            lesson = db.get(Lesson, quiz.lesson_id)
            module = lesson and db.get(Module, lesson.module_id)
            if not module:
                await websocket.close(code=4004)
                return
            enrolled = db.query(Enrollment).filter(
                Enrollment.student_id == user.id,
                Enrollment.course_id == module.course_id,
                Enrollment.status == "active",
            ).first()
            if not enrolled:
                await websocket.close(code=4003)
                return

        # Load questions for this quiz (teacher only needs them for grading reference)
        if is_teacher:
            questions = (
                db.query(QuizQuestion)
                .filter(QuizQuestion.quiz_id == quiz_id)
                .order_by(QuizQuestion.id)
                .all()
            )
            questions_list = [
                {
                    "question_id": q.id,
                    "question_text": q.question_text,
                    "option_a": q.option_a,
                    "option_b": q.option_b,
                    "option_c": q.option_c,
                    "option_d": q.option_d,
                    "correct_option": q.correct_option,
                }
                for q in questions
            ]
        else:
            questions_list = []
    finally:
        db.close()

    await websocket.accept()

    if quiz_id not in _live_sessions:
        _live_sessions[quiz_id] = {
            "question": None,
            "accepting": False,
            "time_limit": None,
            "answers": {},
            "all_answers": {},
            "questions": questions_list if is_teacher else [],
            "participants": set(),
            "teacher_id": user.id if is_teacher else None,
        }
    elif is_teacher:
        if not _live_sessions[quiz_id].get("questions"):
            _live_sessions[quiz_id]["questions"] = questions_list
        _live_sessions[quiz_id]["teacher_id"] = user.id

    session = _live_sessions[quiz_id]

    if not is_teacher:
        session["participants"].add(user.id)

    await websocket.send_text(json.dumps({
        "event": "state",
        "question": session["question"],
        "accepting": session["accepting"],
        "time_limit": session["time_limit"],
        "is_teacher": is_teacher,
        "participant_count": len(session["participants"]),
    }))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = msg.get("event")

            if is_teacher:
                if event == "set_time_limit":
                    # Teacher sets seconds per question (0 = no limit)
                    secs = int(msg.get("seconds", 0))
                    session["time_limit"] = secs if secs > 0 else None
                    await websocket.send_text(json.dumps({
                        "event": "time_limit_set",
                        "seconds": session["time_limit"],
                    }))

                elif event == "push_question":
                    question = msg.get("question")
                    session["question"] = question
                    session["accepting"] = True
                    session["answers"] = {}

                    broadcast = {
                        "event": "question",
                        "question": {k: v for k, v in (question or {}).items() if k != "correct_option"},
                        "accepting": True,
                        "time_limit": session["time_limit"],
                    }
                    await ws_manager.broadcast_to_users(
                        list(session["participants"]), broadcast
                    )
                    await websocket.send_text(json.dumps({
                        "event": "question_pushed",
                        "participant_count": len(session["participants"]),
                    }))

                elif event == "close_answers":
                    session["accepting"] = False
                    await websocket.send_text(json.dumps({
                        "event": "results",
                        "answers": session["answers"],
                        "total": len(session["participants"]),
                        "responded": len(session["answers"]),
                    }))
                    correct = session["question"].get("correct_option") if session["question"] else None
                    await ws_manager.broadcast_to_users(
                        list(session["participants"]),
                        {"event": "answers_closed", "correct": correct},
                    )

                elif event == "end_session":
                    # Grade and save before ending
                    _grade_and_save(quiz_id, session)

                    # Send score to each student
                    db3: Session = SessionLocal()
                    try:
                        for student_id in list(session["participants"]):
                            attempt = (
                                db3.query(QuizAttempt)
                                .filter(
                                    QuizAttempt.student_id == student_id,
                                    QuizAttempt.quiz_id == quiz_id,
                                )
                                .first()
                            )
                            score = attempt.score_pct if attempt else None
                            await ws_manager.send_to_user(student_id, {
                                "event": "session_ended",
                                "score_pct": score,
                            })
                    finally:
                        db3.close()

                    _live_sessions.pop(quiz_id, None)
                    break

            else:
                if event == "answer" and session["accepting"]:
                    chosen = msg.get("option", "").upper()
                    session["answers"][user.id] = chosen

                    # Accumulate for final grading
                    qid = (session["question"] or {}).get("question_id")
                    if qid:
                        if user.id not in session["all_answers"]:
                            session["all_answers"][user.id] = {}
                        session["all_answers"][user.id][qid] = chosen

                    await websocket.send_text(json.dumps({
                        "event": "answer_received",
                        "option": chosen,
                    }))

                    # Tally update to teacher — compute per-option counts
                    teacher_id = session.get("teacher_id")
                    if teacher_id:
                        counts = {"A": 0, "B": 0, "C": 0, "D": 0}
                        for opt in session["answers"].values():
                            if opt in counts:
                                counts[opt] += 1
                        await ws_manager.send_to_user(teacher_id, {
                            "event": "tally",
                            "responded": len(session["answers"]),
                            "total": len(session["participants"]),
                            "counts": counts,
                        })

    except WebSocketDisconnect:
        pass
    finally:
        if not is_teacher:
            session.get("participants", set()).discard(user.id)
