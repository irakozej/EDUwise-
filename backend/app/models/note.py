from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StudentNote(Base):
    __tablename__ = "student_notes"
    __table_args__ = (UniqueConstraint("student_id", "lesson_id", name="uq_note_student_lesson"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id"), index=True)
    content_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
