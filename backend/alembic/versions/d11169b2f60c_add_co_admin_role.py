"""add_co_admin_role

Revision ID: d11169b2f60c
Revises: e477a7ec68a0
Create Date: 2026-03-01 16:32:31.884811

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd11169b2f60c'
down_revision: Union[str, None] = 'e477a7ec68a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL requires ALTER TYPE to add enum values
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'co_admin'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; intentionally a no-op.
    pass
