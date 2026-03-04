from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CoursePrerequisite(Base):
    __tablename__ = "course_prerequisites"
    __table_args__ = (
        UniqueConstraint("course_id", "prerequisite_course_id", name="uq_prerequisite"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), index=True)
    prerequisite_course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), index=True)
