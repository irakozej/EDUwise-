from pydantic import BaseModel
from typing import Optional, List

class CourseCreate(BaseModel):
    title: str
    description: Optional[str] = None

class CourseOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    teacher_id: int

class ModuleCreate(BaseModel):
    title: str
    order_index: int = 1

class ModuleOut(BaseModel):
    id: int
    course_id: int
    title: str
    order_index: int

class LessonCreate(BaseModel):
    title: str
    content: Optional[str] = None
    order_index: int = 1

class LessonOut(BaseModel):
    id: int
    module_id: int
    title: str
    content: Optional[str] = None
    order_index: int

class ResourceCreate(BaseModel):
    title: str
    resource_type: str
    url: Optional[str] = None
    text_body: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    format: Optional[str] = None

class ResourceOut(BaseModel):
    id: int
    lesson_id: int
    title: str
    resource_type: str
    url: Optional[str] = None
    text_body: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    format: Optional[str] = None

class EnrollRequest(BaseModel):
    course_id: int

class ProgressUpdate(BaseModel):
    progress_pct: int