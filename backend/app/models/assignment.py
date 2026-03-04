from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    peer_review_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    num_reviewers: Mapped[int] = mapped_column(Integer, default=2)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(Integer, ForeignKey("assignments.id"), index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    text_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    submitted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    graded_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
