"""
Periodic model retraining on live platform data.

Labelling heuristic (platform-native):
  at_risk = 1  if  avg_progress < 30
                OR avg_quiz_score < 40
                OR events_total  < 5
  at_risk = 0  otherwise

Minimum MIN_SAMPLES active students are required before retraining.
If the threshold is not met the existing risk_model.joblib is kept unchanged.
The new model is hot-swapped into memory immediately after saving — no restart needed.
"""

from __future__ import annotations

import logging
import os

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

import app.ml.risk_predictor as _predictor_module
from app.db.session import SessionLocal
from app.ml.feature_builder import build_student_features
from app.ml.risk_predictor import FEATURE_ORDER, MODEL_PATH
from app.models.user import User, UserRole

log = logging.getLogger("eduwise.retrain")

MIN_SAMPLES = 20  # minimum students needed to trigger a retrain


def _label(feats: dict) -> int:
    """Heuristic at-risk label derived entirely from platform behaviour."""
    return int(
        feats["avg_progress"] < 30
        or feats["avg_quiz_score"] < 40
        or feats["events_total"] < 5
    )


def retrain_model_job() -> None:
    """
    Collect features for every active student, label them, retrain the
    RandomForest, save the new .joblib and hot-swap it in the predictor module.

    Designed to be called by APScheduler — runs in a background thread so it
    never blocks the async event loop.
    """
    log.info("[retrain] Starting periodic model retraining…")
    db = SessionLocal()
    try:
        students = (
            db.query(User)
            .filter(User.role == UserRole.student, User.is_active == True)  # noqa: E712
            .all()
        )

        X_rows, y_rows = [], []
        for student in students:
            feats = build_student_features(db, student.id)
            X_rows.append([float(feats.get(k, 0.0)) for k in FEATURE_ORDER])
            y_rows.append(_label(feats))

        n = len(X_rows)
        if n == 0:
            log.info("[retrain] No students found — skipping.")
            return

        at_risk_rate = sum(y_rows) / n
        log.info(f"[retrain] {n} students collected, at-risk rate: {at_risk_rate:.1%}")

        if n < MIN_SAMPLES:
            log.info(
                f"[retrain] Only {n} students — need at least {MIN_SAMPLES}. "
                "Keeping current model."
            )
            return

        if len(set(y_rows)) < 2:
            log.info("[retrain] Only one class in labels — skipping retrain.")
            return

        X = np.array(X_rows, dtype=float)
        y = np.array(y_rows, dtype=int)

        model = RandomForestClassifier(
            n_estimators=400,
            random_state=42,
            class_weight="balanced",
            min_samples_leaf=2,
        )
        model.fit(X, y)

        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        joblib.dump(model, MODEL_PATH)

        # Hot-swap — next prediction call will use the new weights immediately
        _predictor_module._model = model

        log.info(f"[retrain] Done. Model saved to {MODEL_PATH} and hot-swapped.")

    except Exception:
        log.exception("[retrain] Retraining failed with an unexpected error")
    finally:
        db.close()
