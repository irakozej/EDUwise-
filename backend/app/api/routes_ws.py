"""
WebSocket routes:
  - /ws/notifications?token=...   — real-time notifications per user
  - /ws/quiz/{quiz_id}?token=...  — live quiz session (teacher broadcasts, students receive)
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from jose import jwt, JWTError

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.quiz import Quiz
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.services.ws_manager import ws_manager

router = APIRouter()

# ── per-quiz live state (in-memory, resets on restart) ────────────────────────
# quiz_id -> {"question": {...}, "accepting": bool, "answers": {student_id: option}}
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
        # Send welcome ping
        await websocket.send_text(json.dumps({"event": "connected", "user_id": user.id}))
        # Keep alive — client can send pings, we echo pong
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

        # Students must be enrolled in the course that owns this quiz
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
    finally:
        db.close()

    await websocket.accept()

    # Init session state if first teacher
    if quiz_id not in _live_sessions:
        _live_sessions[quiz_id] = {
            "question": None,
            "accepting": False,
            "answers": {},       # student_id -> chosen option
            "participants": set(),  # student user_ids
        }

    session = _live_sessions[quiz_id]

    if not is_teacher:
        session["participants"].add(user.id)

    # Send current state immediately on join
    await websocket.send_text(json.dumps({
        "event": "state",
        "question": session["question"],
        "accepting": session["accepting"],
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
                if event == "push_question":
                    # Teacher broadcasts a question to all students
                    session["question"] = msg.get("question")
                    session["accepting"] = True
                    session["answers"] = {}

                    broadcast = {
                        "event": "question",
                        "question": session["question"],
                        "accepting": True,
                    }
                    await ws_manager.broadcast_to_users(
                        list(session["participants"]), broadcast
                    )
                    await websocket.send_text(json.dumps({"event": "question_pushed", "participant_count": len(session["participants"])}))

                elif event == "close_answers":
                    session["accepting"] = False
                    # Send results to teacher
                    await websocket.send_text(json.dumps({
                        "event": "results",
                        "answers": session["answers"],
                        "total": len(session["participants"]),
                        "responded": len(session["answers"]),
                    }))
                    # Tell students answers are closed
                    await ws_manager.broadcast_to_users(
                        list(session["participants"]),
                        {"event": "answers_closed", "correct": session["question"].get("correct_option") if session["question"] else None},
                    )

                elif event == "end_session":
                    await ws_manager.broadcast_to_users(
                        list(session["participants"]),
                        {"event": "session_ended"},
                    )
                    _live_sessions.pop(quiz_id, None)
                    break

            else:
                # Student submitting an answer
                if event == "answer" and session["accepting"]:
                    chosen = msg.get("option")
                    session["answers"][user.id] = chosen
                    await websocket.send_text(json.dumps({"event": "answer_received", "option": chosen}))

                    # Notify teacher of live tally update
                    # (teacher connection tracked via ws_manager)
                    db2: Session = SessionLocal()
                    try:
                        quiz2 = db2.get(Quiz, quiz_id)
                        if quiz2:
                            teacher_id = None
                            from app.models.course import Lesson, Module
                            lesson2 = db2.get(Lesson, quiz2.lesson_id)
                            module2 = lesson2 and db2.get(Module, lesson2.module_id)
                            if module2:
                                from app.models.course import Course
                                course2 = db2.get(Course, module2.course_id)
                                if course2:
                                    teacher_id = course2.teacher_id
                            if teacher_id:
                                await ws_manager.send_to_user(teacher_id, {
                                    "event": "tally",
                                    "responded": len(session["answers"]),
                                    "total": len(session["participants"]),
                                })
                    finally:
                        db2.close()

    except WebSocketDisconnect:
        pass
    finally:
        if not is_teacher:
            session.get("participants", set()).discard(user.id)
