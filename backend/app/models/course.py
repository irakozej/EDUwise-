from sqlalchemy import String, DateTime, func, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    teacher_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Module(Base):
    __tablename__ = "modules"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    order_index: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(Integer, ForeignKey("modules.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    resource_type: Mapped[str] = mapped_column(String(50))  # pdf/link/video/text
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    topic: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # beginner/intermediate/advanced
    format: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # video/pdf/interactive/etc

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())