from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User, UserRole
from app.ml.feature_builder import build_student_features
from app.ml.risk_predictor import predict_risk

router = APIRouter()

@router.get("/me/risk-score")
def me_risk_score(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.student)),
):
    feats = build_student_features(db, user.id)
    risk = predict_risk(feats)
    return {"student_id": user.id, "risk_score": risk, "features": feats}