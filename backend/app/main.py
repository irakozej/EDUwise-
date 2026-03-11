from contextlib import asynccontextmanager

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
from app.api.routes_ml import router as ml_router
from app.api.routes_recommendations import router as recommendations_router
from app.api.routes_teacher import router as teacher_router
from app.api.routes_me import router as me_router
from app.api.routes_upload import router as upload_router
from app.api.routes_assignments import router as assignments_router
from app.api.routes_announcements import router as announcements_router
from app.api.routes_certificate import router as certificate_router
from app.api.routes_admin import router as admin_router
from app.api.routes_discussions import router as discussions_router
from app.api.routes_notifications import router as notifications_router
from app.api.routes_messages import router as messages_router
from app.api.routes_ai import router as ai_router
from app.api.routes_notes import router as notes_router
from app.api.routes_gamification import router as gamification_router
from app.api.routes_peer_review import router as peer_review_router
from app.api.routes_exercises import router as exercises_router
from app.api.routes_ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── MinIO bucket ─────────────────────────────────────────────────────────
    try:
        from app.services.storage import ensure_bucket
        ensure_bucket()
    except Exception as e:
        print(f"[startup] MinIO bucket init skipped: {e}")

    # ── Periodic ML retraining (every 24 h) ──────────────────────────────────
    scheduler = None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from app.services.retrain import retrain_model_job

        from app.services.quiz_deadline import send_deadline_reminders

        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(
            retrain_model_job,
            trigger="interval",
            hours=24,
            id="retrain_risk_model",
            replace_existing=True,
        )
        scheduler.add_job(
            send_deadline_reminders,
            trigger="interval",
            minutes=30,
            id="quiz_deadline_reminders",
            replace_existing=True,
        )
        scheduler.start()
        print("[startup] Schedulers started — ML retraining every 24h, deadline reminders every 30m")
    except ImportError:
        print("[startup] apscheduler not installed — scheduler disabled. Run: pip install apscheduler>=3.10.4")
    except Exception as e:
        print(f"[startup] Retraining scheduler failed to start: {e}")

    yield

    if scheduler is not None:
        scheduler.shutdown(wait=False)
        print("[shutdown] ML retraining scheduler stopped")


app = FastAPI(title="EduWise API", version="1.0.0", lifespan=lifespan)

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
app.include_router(ml_router, prefix="/api/v1", tags=["ml"])
app.include_router(recommendations_router, prefix="/api/v1", tags=["recommendations"])
app.include_router(teacher_router, prefix="/api/v1", tags=["teacher"])
app.include_router(me_router, prefix="/api/v1", tags=["me"])
app.include_router(upload_router, prefix="/api/v1", tags=["upload"])
app.include_router(assignments_router, prefix="/api/v1", tags=["assignments"])
app.include_router(announcements_router, prefix="/api/v1", tags=["announcements"])
app.include_router(certificate_router, prefix="/api/v1", tags=["certificate"])
app.include_router(admin_router, prefix="/api/v1", tags=["admin"])
app.include_router(discussions_router, prefix="/api/v1", tags=["discussions"])
app.include_router(notifications_router, prefix="/api/v1", tags=["notifications"])
app.include_router(messages_router, prefix="/api/v1", tags=["messages"])
app.include_router(ai_router, prefix="/api/v1", tags=["ai"])
app.include_router(notes_router, prefix="/api/v1", tags=["notes"])
app.include_router(gamification_router, prefix="/api/v1", tags=["gamification"])
app.include_router(peer_review_router, prefix="/api/v1", tags=["peer-review"])
app.include_router(exercises_router, prefix="/api/v1", tags=["exercises"])
app.include_router(ws_router, tags=["websocket"])
