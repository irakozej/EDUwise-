from __future__ import annotations

# Keep these for backward compatibility with retrain.py (it still saves a .joblib
# for potential future use), but predict_risk now uses a deterministic formula
# that responds immediately to real platform activity.
import os

MODEL_PATH = os.getenv("RISK_MODEL_PATH", "/app/app/ml/models/risk_model.joblib")

FEATURE_ORDER = [
    "active_courses",
    "avg_progress",
    "completed_lessons",
    "attempts_total",
    "avg_quiz_score",
    "events_total",
    "lesson_open_events",
    "quiz_submit_events",
    "exercise_attempts",
    "avg_exercise_score",
    "assignments_submitted",
]


def predict_risk(features: dict) -> float:
    """
    Deterministic risk score 0..1 (higher = more at-risk).

    Weights:
      progress     → 35%  (avg lesson progress 0-100)
      quiz score   → 25%  (avg quiz score, only if attempts exist)
      exercise     → 15%  (avg exercise score, only if attempts exist)
      engagement   → 15%  (events, capped at 20)
      assignments  → 10%  (submissions, capped at 2)

    A student who has completed all lessons with high scores, taken quizzes,
    done exercises, submitted assignments, and is active will score near 0 risk.
    A student with no activity scores 1.0 (high risk).
    """
    avg_progress        = float(features.get("avg_progress", 0.0))
    avg_quiz_score      = float(features.get("avg_quiz_score", 0.0))
    attempts_total      = float(features.get("attempts_total", 0.0))
    events_total        = float(features.get("events_total", 0.0))
    avg_exercise_score  = float(features.get("avg_exercise_score", 0.0))
    exercise_attempts   = float(features.get("exercise_attempts", 0.0))
    assignments_submitted = float(features.get("assignments_submitted", 0.0))

    progress_score   = min(avg_progress / 100.0, 1.0) * 0.35
    quiz_score       = (min(avg_quiz_score / 100.0, 1.0) * 0.25) if attempts_total > 0 else 0.0
    exercise_score   = (min(avg_exercise_score / 100.0, 1.0) * 0.15) if exercise_attempts > 0 else 0.0
    engagement       = min(events_total / 20.0, 1.0) * 0.15
    assignment_score = min(assignments_submitted / 2.0, 1.0) * 0.10

    performance = progress_score + quiz_score + exercise_score + engagement + assignment_score
    return max(0.0, min(1.0, 1.0 - performance))
