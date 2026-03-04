import json
import os

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.course import Lesson
from app.models.user import User, UserRole

router = APIRouter()

_PRIVILEGED = {UserRole.teacher, UserRole.admin, UserRole.co_admin}


@router.post("/lessons/{lesson_id}/ai-generate-questions")
def generate_questions(
    lesson_id: int,
    count: int = Query(default=5, ge=1, le=10),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate MCQ quiz questions from lesson content using Claude AI."""
    if user.role not in _PRIVILEGED:
        raise HTTPException(403, "Only teachers can use AI question generation")

    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    content = (lesson.content or "").strip()
    # Strip HTML tags roughly to get text length
    import re
    plain = re.sub(r"<[^>]+>", "", content).strip()
    if len(plain) < 100:
        raise HTTPException(400, "Lesson content is too short — add more content first (min 100 chars)")

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "AI service not configured — set ANTHROPIC_API_KEY in environment")

    client = Anthropic(api_key=api_key)
    prompt = (
        f"Generate exactly {count} multiple choice questions based on the following lesson content. "
        "Return ONLY a valid JSON array with no markdown, no explanation, no other text. "
        "Each element must be: "
        '{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"A"} '
        "(correct_option must be A, B, C, or D).\n\n"
        f"Lesson content:\n{plain[:4000]}"
    )

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        raise HTTPException(502, f"AI service error: {exc}")

    raw = msg.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        questions = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(500, "AI returned invalid JSON — please try again")

    if not isinstance(questions, list):
        raise HTTPException(500, "AI returned unexpected format — please try again")

    # Validate each question has required fields
    required = {"question_text", "option_a", "option_b", "option_c", "option_d", "correct_option"}
    valid = [q for q in questions if isinstance(q, dict) and required.issubset(q.keys())]

    return {"questions": valid, "lesson_id": lesson_id, "lesson_title": lesson.title}
