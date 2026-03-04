from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PeerReview(Base):
    __tablename__ = "peer_reviews"
    __table_args__ = (UniqueConstraint("submission_id", "reviewer_id", name="uq_peer_review"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(Integer, ForeignKey("submissions.id"), index=True)
    reviewer_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
