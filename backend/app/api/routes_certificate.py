import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.course import Course, Module, Lesson
from app.models.enrollment import Enrollment
from app.models.progress import LessonProgress
from app.models.user import User, UserRole

router = APIRouter()


def _generate_certificate_pdf(student_name: str, course_title: str, date_str: str) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.add_page()

    # Background gradient effect using filled rectangles
    pdf.set_fill_color(248, 250, 252)  # slate-50
    pdf.rect(0, 0, 297, 210, "F")

    # Top accent bar
    pdf.set_fill_color(15, 23, 42)  # slate-900
    pdf.rect(0, 0, 297, 8, "F")

    # Bottom accent bar
    pdf.rect(0, 202, 297, 8, "F")

    # Decorative border
    pdf.set_draw_color(148, 163, 184)  # slate-400
    pdf.set_line_width(0.5)
    pdf.rect(15, 15, 267, 180)
    pdf.set_line_width(0.2)
    pdf.rect(17, 17, 263, 176)

    # EDUwise branding
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(100, 116, 139)  # slate-500
    pdf.set_xy(0, 25)
    pdf.cell(297, 10, "EDUwise Learning Platform", align="C")

    # Main heading
    pdf.set_font("Helvetica", "B", 38)
    pdf.set_text_color(15, 23, 42)  # slate-900
    pdf.set_xy(0, 42)
    pdf.cell(297, 20, "Certificate of Completion", align="C")

    # Decorative line
    pdf.set_draw_color(15, 23, 42)
    pdf.set_line_width(0.8)
    pdf.line(80, 67, 217, 67)

    # "This certifies that"
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(71, 85, 105)  # slate-600
    pdf.set_xy(0, 72)
    pdf.cell(297, 10, "This certifies that", align="C")

    # Student name
    pdf.set_font("Helvetica", "BI", 30)
    pdf.set_text_color(15, 23, 42)
    pdf.set_xy(0, 85)
    pdf.cell(297, 16, student_name, align="C")

    # "has successfully completed"
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(71, 85, 105)
    pdf.set_xy(0, 104)
    pdf.cell(297, 10, "has successfully completed the course", align="C")

    # Course title
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(15, 23, 42)
    pdf.set_xy(0, 116)
    pdf.cell(297, 14, course_title, align="C")

    # Bottom line
    pdf.set_draw_color(15, 23, 42)
    pdf.set_line_width(0.8)
    pdf.line(80, 138, 217, 138)

    # Date
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 116, 139)
    pdf.set_xy(0, 143)
    pdf.cell(297, 8, f"Awarded on {date_str}", align="C")

    # Footer
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(148, 163, 184)
    pdf.set_xy(0, 175)
    pdf.cell(297, 6, "EDUwise · AI-Powered Learning Management System", align="C")

    return pdf.output()


@router.get("/me/courses/{course_id}/certificate")
def download_certificate(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == user.id,
        Enrollment.course_id == course_id,
        Enrollment.status == "active",
    ).first()
    if not enrollment:
        raise HTTPException(403, "You are not enrolled in this course")

    # Get all lessons in the course
    modules = db.query(Module).filter(Module.course_id == course_id).all()
    module_ids = [m.id for m in modules]
    if not module_ids:
        raise HTTPException(400, "Course has no content yet")

    lessons = db.query(Lesson).filter(Lesson.module_id.in_(module_ids)).all()
    if not lessons:
        raise HTTPException(400, "Course has no lessons yet")

    lesson_ids = [l.id for l in lessons]

    # Check all lessons are 100% complete
    progress_rows = db.query(LessonProgress).filter(
        LessonProgress.student_id == user.id,
        LessonProgress.lesson_id.in_(lesson_ids),
    ).all()

    completed_count = sum(1 for p in progress_rows if p.progress_pct >= 100)
    if completed_count < len(lessons):
        raise HTTPException(
            400,
            f"Course not yet complete ({completed_count}/{len(lessons)} lessons done). "
            "Complete all lessons to earn your certificate."
        )

    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
    pdf_bytes = _generate_certificate_pdf(
        student_name=user.full_name,
        course_title=course.title,
        date_str=date_str,
    )

    safe_name = course.title.replace(" ", "_").replace("/", "-")[:60]
    filename = f"certificate_{safe_name}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
