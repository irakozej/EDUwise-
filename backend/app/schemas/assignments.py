from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AssignmentCreate(BaseModel):
    lesson_id: int
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_score: int = 100


class AssignmentOut(BaseModel):
    id: int
    lesson_id: int
    title: str
    description: Optional[str]
    due_date: Optional[datetime]
    max_score: int
    created_at: datetime
    model_config = {"from_attributes": True}


class SubmitRequest(BaseModel):
    text_body: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None


class GradeRequest(BaseModel):
    grade: int
    feedback: Optional[str] = None


class SubmissionOut(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    text_body: Optional[str]
    file_url: Optional[str]
    file_name: Optional[str]
    is_submitted: bool
    submitted_at: Optional[datetime]
    grade: Optional[int]
    feedback: Optional[str]
    graded_at: Optional[datetime]
    model_config = {"from_attributes": True}


class SubmissionWithStudentOut(SubmissionOut):
    student_name: str
    student_email: str
