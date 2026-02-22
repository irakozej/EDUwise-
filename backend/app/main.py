from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes_health import router as health_router
from app.api.routes_auth import router as auth_router
from app.api.routes_learning import router as learning_router
from app.api.routes_events import router as events_router
from app.api.routes_quizzes import router as quizzes_router
from app.api.routes_analytics import router as analytics_router
from app.api.routes_student_dashboard import router as student_dashboard_router

app = FastAPI(title="EduWise API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(auth_router, prefix="/api/v1", tags=["auth"])
app.include_router(learning_router, prefix="/api/v1", tags=["learning"])
app.include_router(events_router, prefix="/api/v1", tags=["events"])
app.include_router(quizzes_router, prefix="/api/v1", tags=["quizzes"])
app.include_router(analytics_router, prefix="/api/v1", tags=["analytics"])
app.include_router(student_dashboard_router, prefix="/api/v1", tags=["student-dashboard"])