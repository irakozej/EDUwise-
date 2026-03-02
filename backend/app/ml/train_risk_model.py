"""
Train a deployable risk model using student-mat.csv (UCI dataset).

Run:
docker exec -it eduwise_backend python -m app.ml.train_risk_model

Output:
backend/app/ml/models/risk_model.joblib
"""

from __future__ import annotations

import os
import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score


MODEL_OUT = os.getenv("RISK_MODEL_PATH", "/app/app/ml/models/risk_model.joblib")

# Auto-select best available training data (combined > env-var > fallback)
_DATA_DIR = "/app/data"
_COMBINED = os.path.join(_DATA_DIR, "combined_training.csv")
_FALLBACK  = os.path.join(_DATA_DIR, "student-mat.csv")
DATA_PATH  = (
    _COMBINED
    if os.path.exists(_COMBINED)
    else os.getenv("RISK_TRAIN_DATA_PATH", _FALLBACK)
)

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


def _make_label(df: pd.DataFrame) -> pd.Series:
    """
    Define at_risk in a realistic way.

    at_risk = 1 if:
      - final grade G3 < 10 (fail) OR
      - failures >= 2 OR
      - absences >= 10
    """
    return ((df["G3"] < 10) | (df["failures"] >= 2) | (df["absences"] >= 10)).astype(int)


def _build_platform_like_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert student-mat columns into platform-like features that match live EduWise inference features.
    This lets us train now, and later retrain on real platform data without changing the API.
    """
    # avg_quiz_score: map grades (0..20) -> 0..100 using mean of G1,G2
    avg_quiz_score = ((df["G1"] + df["G2"]) / 2.0) * 5.0

    # avg_progress: simulate progress from absences (more absences => lower progress)
    avg_progress = (100.0 - (df["absences"] * 2.0)).clip(lower=0.0, upper=100.0)

    # completed_lessons: assume course has 10 lessons
    completed_lessons = np.round((avg_progress / 100.0) * 10.0)

    # attempts_total: simulate attempts from studytime(1..4) + goout(1..5)
    attempts_total = (df["studytime"] * 2.0 + df["goout"]).clip(lower=0.0)

    # events_total: engagement proxy (inverse of absences + internet boost)
    internet_boost = (df["internet"].astype(str).str.lower() == "yes").astype(float) * 10.0
    events_total = (60.0 - df["absences"].astype(float) + internet_boost).clip(lower=0.0, upper=120.0)

    # event types: derived split of events_total + attempts_total
    lesson_open_events = np.round(events_total * 0.7)
    quiz_submit_events = np.round(attempts_total * 0.5)

    out = pd.DataFrame({
        "active_courses": np.ones(len(df), dtype=float),
        "avg_progress": avg_progress.astype(float),
        "completed_lessons": completed_lessons.astype(float),
        "attempts_total": attempts_total.astype(float),
        "avg_quiz_score": avg_quiz_score.astype(float),
        "events_total": events_total.astype(float),
        "lesson_open_events": lesson_open_events.astype(float),
        "quiz_submit_events": quiz_submit_events.astype(float),
    })

    return out[FEATURE_ORDER]


def main():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"Training CSV not found at {DATA_PATH}. "
            "Run: docker exec eduwise_backend python -m app.ml.prepare_training_data"
        )

    print(f"Training data: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH, sep=";")
    y = _make_label(df)
    X = _build_platform_like_features(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X.values, y.values, test_size=0.2, random_state=42, stratify=y.values
    )

    model = RandomForestClassifier(
        n_estimators=400,
        random_state=42,
        class_weight="balanced",
        min_samples_leaf=2,
    )
    model.fit(X_train, y_train)

    # Evaluate
    preds = model.predict(X_test)
    probas = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, probas)

    print("\n=== Evaluation ===")
    print(f"ROC AUC: {auc:.4f}")
    print(classification_report(y_test, preds, digits=4))

    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    joblib.dump(model, MODEL_OUT)
    print(f"Saved model to {MODEL_OUT}")


if __name__ == "__main__":
    main()

    