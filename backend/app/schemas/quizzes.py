from pydantic import BaseModel, Field
from typing import Optional, List

class QuizCreate(BaseModel):
    lesson_id: int
    title: str

class QuizOut(BaseModel):
    id: int
    lesson_id: int
    title: str
    is_published: bool

class QuestionCreate(BaseModel):
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str = Field(pattern="^[ABCD]$")
    topic: Optional[str] = None
    difficulty: Optional[str] = None

class QuestionOut(BaseModel):
    id: int
    quiz_id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    topic: Optional[str] = None
    difficulty: Optional[str] = None

class PublishRequest(BaseModel):
    is_published: bool

class StartAttemptRequest(BaseModel):
    quiz_id: int

class AttemptOut(BaseModel):
    attempt_id: int
    quiz_id: int
    is_submitted: bool
    score_pct: int

class AnswerIn(BaseModel):
    question_id: int
    selected_option: str = Field(pattern="^[ABCD]$")

class SubmitAttemptRequest(BaseModel):
    answers: List[AnswerIn]