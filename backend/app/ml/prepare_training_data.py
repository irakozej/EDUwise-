"""
Download and combine multiple student performance datasets for at-risk model training.

Datasets combined:
  1. student-mat.csv   (395 rows) — UCI Math course, already on disk
  2. student-por.csv   (649 rows) — UCI Portuguese course, identical columns
  3. UCI Dropout       (4424 rows)— Higher-ed dropout/success, columns mapped

Total: ~5468 rows  (well above the 3000-row target)

Usage (inside container):
  docker exec eduwise_backend python -m app.ml.prepare_training_data

Output:
  /app/data/combined_training.csv

Column mapping for UCI Dropout dataset
(only these 8 columns are consumed by train_risk_model.py):
  G1        ← Curricular units 1st sem (grade)        [0-20]
  G2        ← Curricular units 2nd sem (grade)         [0-20]
  G3        ← derived from Target (Graduate=14, Enrolled=11, Dropout=5)
  failures  ← derived from approved/enrolled pass-rate
  absences  ← Curricular units *_sem (without evaluations) × 2
  studytime ← Scholarship holder (1→3, 0→2)
  goout     ← 3 (median, not available in source)
  internet  ← "yes" (higher-education cohort, 2019-2022)
"""

from __future__ import annotations

import io
import os
import sys
import urllib.request
import zipfile

import numpy as np
import pandas as pd

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR = os.getenv("DATA_DIR", "/app/data")
MAT_PATH = os.path.join(DATA_DIR, "student-mat.csv")
POR_PATH = os.path.join(DATA_DIR, "student-por.csv")
OUT_PATH = os.path.join(DATA_DIR, "combined_training.csv")

# UCI download URLs (stable, no auth required)
_UCI_STUDENT_ZIP = (
    "https://archive.ics.uci.edu/static/public/320/student+performance.zip"
)
_UCI_DROPOUT_ZIP = (
    "https://archive.ics.uci.edu/static/public/697/"
    "predict+students+dropout+and+academic+success.zip"
)

# Columns the training script actually reads from the CSV
REQUIRED_COLS = ["G1", "G2", "G3", "failures", "absences", "studytime", "goout", "internet"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _download_zip(url: str, label: str) -> bytes:
    print(f"  Downloading {label} …", end=" ", flush=True)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        print(f"OK ({len(data)//1024} KB)")
        return data
    except Exception as exc:
        print(f"FAILED ({exc})")
        return b""


def _extract_csv_from_zip(zip_bytes: bytes, filename_hint: str) -> bytes:
    """Return raw bytes of the first CSV inside the zip whose name matches hint.
    Handles nested zip files (zip-inside-zip) as seen in some UCI archives."""
    def _search(zf: zipfile.ZipFile) -> bytes | None:
        names = zf.namelist()
        # Direct CSV match
        match = next(
            (n for n in names if filename_hint.lower() in n.lower() and n.endswith(".csv")),
            None,
        )
        if match:
            print(f"    Extracted: {match}")
            return zf.read(match)
        # Fallback: first CSV
        first_csv = next((n for n in names if n.endswith(".csv")), None)
        if first_csv:
            print(f"    Extracted: {first_csv}")
            return zf.read(first_csv)
        # Recurse into any nested zips
        for name in names:
            if name.endswith(".zip"):
                nested_bytes = zf.read(name)
                try:
                    with zipfile.ZipFile(io.BytesIO(nested_bytes)) as nested_zf:
                        result = _search(nested_zf)
                        if result is not None:
                            return result
                except zipfile.BadZipFile:
                    continue
        return None

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        result = _search(zf)
        if result is None:
            raise FileNotFoundError(f"No CSV found in zip (files: {zf.namelist()})")
        return result


# ── Dataset loaders ───────────────────────────────────────────────────────────

def load_student_mat() -> pd.DataFrame:
    """Load the existing student-mat.csv (already on disk)."""
    if not os.path.exists(MAT_PATH):
        raise FileNotFoundError(f"student-mat.csv not found at {MAT_PATH}")
    df = pd.read_csv(MAT_PATH, sep=";")
    print(f"  student-mat.csv   → {len(df):>5} rows")
    return df


def load_student_por() -> pd.DataFrame | None:
    """
    Load student-por.csv — same columns as student-mat.csv.
    Try disk first; download from UCI if not present.
    """
    # Already on disk?
    if os.path.exists(POR_PATH):
        df = pd.read_csv(POR_PATH, sep=";")
        print(f"  student-por.csv   → {len(df):>5} rows  (from disk)")
        return df

    # Download
    print("  student-por.csv not found on disk — downloading from UCI …")
    raw = _download_zip(_UCI_STUDENT_ZIP, "student performance")
    if not raw:
        print("  ⚠ Skipping student-por.csv (download failed)")
        return None

    try:
        csv_bytes = _extract_csv_from_zip(raw, "student-por")
        df = pd.read_csv(io.BytesIO(csv_bytes), sep=";")
        # Cache to disk for next run
        os.makedirs(DATA_DIR, exist_ok=True)
        df.to_csv(POR_PATH, sep=";", index=False)
        print(f"  student-por.csv   → {len(df):>5} rows  (downloaded & cached)")
        return df
    except Exception as exc:
        print(f"  ⚠ Skipping student-por.csv: {exc}")
        return None


def load_dropout_dataset() -> pd.DataFrame | None:
    """
    Download UCI 'Predict Students Dropout and Academic Success' dataset
    and map its columns to the student-mat.csv schema (only 8 required cols).
    """
    dropout_cache = os.path.join(DATA_DIR, "dropout_mapped.csv")

    # Cached mapped version already on disk?
    if os.path.exists(dropout_cache):
        df = pd.read_csv(dropout_cache, sep=";")
        print(f"  dropout_mapped.csv→ {len(df):>5} rows  (from cache)")
        return df

    print("  Downloading UCI Dropout dataset from UCI …")
    raw = _download_zip(_UCI_DROPOUT_ZIP, "dropout")
    if not raw:
        print("  ⚠ Skipping dropout dataset (download failed)")
        return None

    try:
        # The zip contains a single CSV (semicolon-separated)
        csv_bytes = _extract_csv_from_zip(raw, "data")
        # UCI dropout CSV uses semicolons
        df_raw = pd.read_csv(io.BytesIO(csv_bytes), sep=";")
        print(f"    Raw rows: {len(df_raw)}, columns: {list(df_raw.columns)[:6]} …")
    except Exception as exc:
        print(f"  ⚠ Skipping dropout dataset: {exc}")
        return None

    # ── Column mapping ────────────────────────────────────────────────────────
    # Strip whitespace from column names (UCI sometimes has trailing spaces)
    df_raw.columns = [c.strip() for c in df_raw.columns]

    def _col(name: str) -> pd.Series:
        """Safe column accessor — returns zeros if column missing."""
        if name in df_raw.columns:
            return df_raw[name]
        print(f"    ⚠ Column '{name}' not found; defaulting to 0")
        return pd.Series(0, index=df_raw.index)

    # G1, G2: already 0-20 scale in dropout dataset
    G1 = _col("Curricular units 1st sem (grade)").fillna(0).clip(0, 20)
    G2 = _col("Curricular units 2nd sem (grade)").fillna(0).clip(0, 20)

    # G3: derive from Target (categorical: Graduate, Enrolled, Dropout)
    target = _col("Target").astype(str).str.strip()
    G3 = target.map({"Graduate": 14, "Enrolled": 11, "Dropout": 5}).fillna(10).astype(float)
    # Smooth: Graduate shouldn't drop below G2 average; Dropout shouldn't exceed 9
    G3 = np.where(target == "Graduate", np.maximum(G3, (G1 + G2) / 2.0), G3)
    G3 = np.where(target == "Dropout",  np.minimum(G3, (G1 + G2) / 2.0 * 0.8), G3)
    G3 = np.clip(G3, 0, 20)

    # failures: derived from 1st-sem pass rate
    enrolled_1 = _col("Curricular units 1st sem (enrolled)").replace(0, np.nan).fillna(1)
    approved_1 = _col("Curricular units 1st sem (approved)").fillna(0)
    pass_rate = (approved_1 / enrolled_1).clip(0, 1)
    failures = np.where(pass_rate < 0.4, 3,
               np.where(pass_rate < 0.6, 2,
               np.where(pass_rate < 0.8, 1, 0))).astype(int)

    # absences: sum of "without evaluations" across both sems × 2 (rough proxy)
    wo_eval_1 = _col("Curricular units 1st sem (without evaluations)").fillna(0)
    wo_eval_2 = _col("Curricular units 2nd sem (without evaluations)").fillna(0)
    absences = ((wo_eval_1 + wo_eval_2) * 2).clip(0, 93).round().astype(int)

    # studytime: Scholarship holder → motivated → higher study time
    scholarship = _col("Scholarship holder").fillna(0).astype(int)
    studytime = np.where(scholarship == 1, 3, 2).astype(int)

    # goout: not available → use median value 3
    goout = pd.Series(3, index=df_raw.index)

    # internet: higher-education cohort (2019-2022) → virtually all have internet
    internet = pd.Series("yes", index=df_raw.index)

    # sex (optional but include for completeness)
    gender_raw = _col("Gender").fillna(1).astype(int)
    sex = gender_raw.map({1: "M", 0: "F"}).fillna("M")

    # age
    age = _col("Age at enrollment").fillna(18).clip(15, 30).round().astype(int)

    # Build mapped DataFrame with all student-mat columns (fill non-required with defaults)
    mapped = pd.DataFrame({
        "school": "GP",
        "sex": sex,
        "age": age,
        "address": "U",
        "famsize": "GT3",
        "Pstatus": "T",
        "Medu": 2,
        "Fedu": 2,
        "Mjob": "other",
        "Fjob": "other",
        "reason": "course",
        "guardian": "mother",
        "traveltime": 1,
        "studytime": studytime,
        "failures": failures,
        "schoolsup": "no",
        "famsup": "no",
        "paid": "no",
        "activities": "no",
        "nursery": "yes",
        "higher": "yes",
        "internet": internet,
        "romantic": "no",
        "famrel": 4,
        "freetime": 3,
        "goout": goout,
        "Dalc": 1,
        "Walc": 1,
        "health": 3,
        "absences": absences,
        "G1": G1.round().astype(int),
        "G2": G2.round().astype(int),
        "G3": pd.Series(G3).round().astype(int),
    })

    # Cache mapped version
    os.makedirs(DATA_DIR, exist_ok=True)
    mapped.to_csv(dropout_cache, sep=";", index=False)
    print(f"  dropout_mapped.csv→ {len(mapped):>5} rows  (downloaded & cached)")
    return mapped


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n=== EDUwise Training Data Preparation ===\n")
    print("Loading datasets:")

    frames: list[pd.DataFrame] = []

    # 1. student-mat.csv (guaranteed to exist)
    df_mat = load_student_mat()
    frames.append(df_mat)

    # 2. student-por.csv (same format)
    df_por = load_student_por()
    if df_por is not None:
        frames.append(df_por)

    # 3. UCI Dropout dataset (column-mapped)
    df_drop = load_dropout_dataset()
    if df_drop is not None:
        frames.append(df_drop)

    # ── Combine ───────────────────────────────────────────────────────────────
    combined = pd.concat(frames, ignore_index=True)

    # Validate required columns
    missing = [c for c in REQUIRED_COLS if c not in combined.columns]
    if missing:
        print(f"\n✗ Missing required columns: {missing}")
        sys.exit(1)

    # Drop rows with NaN in required columns
    before = len(combined)
    combined = combined.dropna(subset=REQUIRED_COLS)
    dropped = before - len(combined)
    if dropped:
        print(f"  Dropped {dropped} rows with NaN in required columns")

    # Save
    os.makedirs(DATA_DIR, exist_ok=True)
    combined.to_csv(OUT_PATH, sep=";", index=False)

    print(f"\n{'─'*46}")
    print(f"  student-mat.csv   : {len(df_mat):>5} rows")
    print(f"  student-por.csv   : {len(df_por) if df_por is not None else 0:>5} rows")
    print(f"  UCI Dropout (mapped): {len(df_drop) if df_drop is not None else 0:>5} rows")
    print(f"{'─'*46}")
    print(f"  Combined total    : {len(combined):>5} rows")
    print(f"\n✓ Saved → {OUT_PATH}")
    print("\nNext step:")
    print("  docker exec eduwise_backend python -m app.ml.train_risk_model")
    print()


if __name__ == "__main__":
    main()
