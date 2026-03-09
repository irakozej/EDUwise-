import json
import os
import re

from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.course import Course, Lesson, Module
from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
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


@router.post("/lessons/{lesson_id}/ai-resources")
def recommend_resources(
    lesson_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Use Claude to recommend free online resources relevant to this lesson's content."""
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    module = db.get(Module, lesson.module_id)
    if not module:
        raise HTTPException(500, "Module not found")

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

    plain = re.sub(r"<[^>]+>", "", (lesson.content or "")).strip()

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "AI service not configured")

    # Use lesson title alone if content is too short
    content_section = (
        f"Lesson content:\n{plain[:3000]}"
        if len(plain) >= 30
        else "(No detailed lesson content available — use the lesson title to infer the topic.)"
    )

    client = Anthropic(api_key=api_key)
    prompt = (
        "Based on the lesson information below, recommend exactly 6 free online learning resources "
        "that would help a student understand the topic better. "
        "Return ONLY a valid JSON array with no markdown, no explanation, no other text. "
        "Each element must have these exact keys: "
        '"title" (resource title), '
        '"platform" (e.g. YouTube, Khan Academy, freeCodeCamp, MDN, Coursera, edX, Wikipedia, GeeksforGeeks, W3Schools), '
        '"description" (one sentence explaining what the resource covers), '
        '"resource_type" (one of: video, article, tutorial, course, documentation), '
        '"search_query" (exact search phrase the student can type into Google or the platform to find it). '
        "Recommend only genuinely free and widely available resources. "
        "Vary the platforms and resource types.\n\n"
        f"Lesson title: {lesson.title}\n"
        f"{content_section}"
    )

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1200,
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
        resources = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(500, "AI returned invalid JSON — please try again")

    if not isinstance(resources, list):
        raise HTTPException(500, "AI returned unexpected format — please try again")

    required_keys = {"title", "platform", "description", "resource_type", "search_query"}
    valid = [r for r in resources if isinstance(r, dict) and required_keys.issubset(r.keys())]

    return {
        "lesson_id": lesson_id,
        "lesson_title": lesson.title,
        "resources": valid[:6],
    }


@router.post("/me/ai-study-suggestions")
def ai_study_suggestions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    """Generate personalised AI study suggestions based on enrolled courses and progress."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(503, "AI service not configured")

    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == user.id, Enrollment.status == "active")
        .all()
    )
    if not enrollments:
        raise HTTPException(400, "You are not enrolled in any courses")

    # Build a summary of the student's courses + lesson progress
    course_summaries = []
    for enroll in enrollments:
        course = db.get(Course, enroll.course_id)
        if not course:
            continue
        lessons = (
            db.query(Lesson)
            .join(Module, Module.id == Lesson.module_id)
            .filter(Module.course_id == course.id)
            .order_by(Module.order_index, Lesson.order_index)
            .all()
        )
        lesson_ids = [l.id for l in lessons]
        progress_rows = (
            db.query(LessonProgress)
            .filter(LessonProgress.student_id == user.id, LessonProgress.lesson_id.in_(lesson_ids))
            .all()
        ) if lesson_ids else []
        prog_map = {r.lesson_id: r.progress_pct for r in progress_rows}

        lesson_lines = [
            f"  - {l.title}: {prog_map.get(l.id, 0):.0f}% complete"
            for l in lessons[:10]  # cap per course
        ]
        course_summaries.append(
            f'Course: "{course.title}"\n' + ("\n".join(lesson_lines) if lesson_lines else "  (no lessons yet)")
        )

    context = "\n\n".join(course_summaries)

    prompt = (
        f"You are a study advisor. A student named {user.full_name} is enrolled in the following courses "
        "with the progress shown below.\n\n"
        f"{context}\n\n"
        "Based on this information, generate exactly 6 personalised study suggestions to help them improve. "
        "Focus on lessons with low progress. "
        "Return ONLY a valid JSON array with no markdown, no explanation. "
        "Each element must have: "
        '"title" (short action title, max 8 words), '
        '"description" (1-2 sentences explaining what to do and why), '
        '"priority" (one of: high, medium, low), '
        '"category" (one of: review, practice, explore, assess).'
    )

    try:
        msg = Anthropic(api_key=api_key).messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
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
        suggestions = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(500, "AI returned invalid JSON — please try again")

    required = {"title", "description", "priority", "category"}
    valid_suggestions = [s for s in suggestions if isinstance(s, dict) and required.issubset(s.keys())]

    return {"suggestions": valid_suggestions[:6]}
