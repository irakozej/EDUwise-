from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class XPLog(Base):
    __tablename__ = "xp_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(50))
    xp_earned: Mapped[int] = mapped_column(Integer)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StudentBadge(Base):
    __tablename__ = "student_badges"
    __table_args__ = (UniqueConstraint("student_id", "badge_key", name="uq_student_badge"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    badge_key: Mapped[str] = mapped_column(String(50))
    earned_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
