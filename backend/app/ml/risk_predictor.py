from __future__ import annotations
import os
import joblib
import numpy as np

MODEL_PATH = os.getenv("RISK_MODEL_PATH", "/app/app/ml/models/risk_model.joblib")

_model = None

FEATURE_ORDER = [
    "active_courses",
    "avg_progress",
    "completed_lessons",
    "attempts_total",
    "avg_quiz_score",
    "events_total",
    "lesson_open_events",
    "quiz_submit_events",
]


def load_model():
    global _model
    if _model is None:
        _model = joblib.load(MODEL_PATH)
    return _model


def predict_risk(features: dict) -> float:
    """
    Returns risk probability 0..1 (higher = more at-risk)
    """
    model = load_model()
    x = np.array([[float(features.get(k, 0.0)) for k in FEATURE_ORDER]], dtype=float)

    # If model supports predict_proba:
    if hasattr(model, "predict_proba"):
        p = model.predict_proba(x)[0][1]
        return float(p)

    # fallback
    y = model.predict(x)[0]
    return float(y)