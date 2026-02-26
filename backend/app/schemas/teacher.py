from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict


class TeacherCreateStudentRequest(BaseModel):
    full_name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)


class TeacherStudentOut(BaseModel):
    id: int
    full_name: str
    email: str


class TeacherEnrollmentOut(BaseModel):
    student: TeacherStudentOut
    status: str


class LessonProgressOut(BaseModel):
    lesson_id: int
    lesson_title: str
    progress_pct: int


class StudentCourseProgressOut(BaseModel):
    course: dict
    student: TeacherStudentOut
    enrolled_status: str
    progress: dict
    lessons: List[LessonProgressOut]
    quizzes: dict
    events: dict