from sqlalchemy import DateTime, func, Integer, ForeignKey, String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id"), index=True)

    score_pct: Mapped[int] = mapped_column(Integer, default=0)
    is_submitted: Mapped[bool] = mapped_column(Boolean, default=False)

    started_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExerciseQuestion(Base):
    __tablename__ = "exercise_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercise_attempts.id"), index=True)

    question_index: Mapped[int] = mapped_column(Integer, default=0)
    question_text: Mapped[str] = mapped_column(Text)
    option_a: Mapped[str] = mapped_column(String(400))
    option_b: Mapped[str] = mapped_column(String(400))
    option_c: Mapped[str] = mapped_column(String(400))
    option_d: Mapped[str] = mapped_column(String(400))
    correct_option: Mapped[str] = mapped_column(String(1))  # A/B/C/D
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExerciseAnswer(Base):
    __tablename__ = "exercise_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercise_attempts.id"), index=True)
    question_id: Mapped[int] = mapped_column(Integer, ForeignKey("exercise_questions.id"), index=True)

    selected_option: Mapped[str] = mapped_column(String(1))  # A/B/C/D
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
