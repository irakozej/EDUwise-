from pydantic import BaseModel, Field
from typing import Optional, List


class QuizCreate(BaseModel):
    lesson_id: int
    title: str
    time_limit_minutes: Optional[int] = None
    quiz_type: str = "self_paced"   # "self_paced" | "live"
    deadline: Optional[str] = None  # ISO datetime string, only for self_paced


class QuizOut(BaseModel):
    id: int
    lesson_id: int
    title: str
    is_published: bool
    time_limit_minutes: Optional[int] = None
    quiz_type: str = "self_paced"
    deadline: Optional[str] = None


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
    correct_option: Optional[str] = None  # only returned to teachers
    topic: Optional[str] = None
    difficulty: Optional[str] = None


class PublishRequest(BaseModel):
    is_published: bool


class TimeLimitRequest(BaseModel):
    time_limit_minutes: Optional[int] = None


class StartAttemptRequest(BaseModel):
    quiz_id: int


class QuestionResult(BaseModel):
    question_id: int
    selected_option: str
    correct_option: str
    is_correct: bool


class AttemptOut(BaseModel):
    attempt_id: int
    quiz_id: int
    is_submitted: bool
    score_pct: int
    time_limit_minutes: Optional[int] = None
    started_at: Optional[str] = None
    results: List[QuestionResult] = []


class AnswerIn(BaseModel):
    question_id: int
    selected_option: str = Field(pattern="^[ABCD]$")


class SubmitAttemptRequest(BaseModel):
    answers: List[AnswerIn]
