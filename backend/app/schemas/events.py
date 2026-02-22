from pydantic import BaseModel
from typing import Optional, Dict, Any

class EventCreate(BaseModel):
    event_type: str
    course_id: Optional[int] = None
    lesson_id: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None