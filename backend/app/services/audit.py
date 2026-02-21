from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog

def log_action(db: Session, actor_user_id: int | None, action: str, entity: str, entity_id: str | None = None):
    db.add(AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity=entity,
        entity_id=entity_id
    ))
    db.commit()
