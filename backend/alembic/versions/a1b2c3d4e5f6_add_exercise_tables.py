"""add_exercise_tables

Revision ID: a1b2c3d4e5f6
Revises: 0e59b3d0c3ae
Create Date: 2026-03-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '0e59b3d0c3ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'exercise_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('lesson_id', sa.Integer(), nullable=False),
        sa.Column('score_pct', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_submitted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id']),
        sa.ForeignKeyConstraint(['student_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exercise_attempts_student_id'), 'exercise_attempts', ['student_id'], unique=False)
    op.create_index(op.f('ix_exercise_attempts_lesson_id'), 'exercise_attempts', ['lesson_id'], unique=False)

    op.create_table(
        'exercise_questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('attempt_id', sa.Integer(), nullable=False),
        sa.Column('question_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('option_a', sa.String(length=400), nullable=False),
        sa.Column('option_b', sa.String(length=400), nullable=False),
        sa.Column('option_c', sa.String(length=400), nullable=False),
        sa.Column('option_d', sa.String(length=400), nullable=False),
        sa.Column('correct_option', sa.String(length=1), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['attempt_id'], ['exercise_attempts.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exercise_questions_attempt_id'), 'exercise_questions', ['attempt_id'], unique=False)

    op.create_table(
        'exercise_answers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('attempt_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('selected_option', sa.String(length=1), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['attempt_id'], ['exercise_attempts.id']),
        sa.ForeignKeyConstraint(['question_id'], ['exercise_questions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exercise_answers_attempt_id'), 'exercise_answers', ['attempt_id'], unique=False)
    op.create_index(op.f('ix_exercise_answers_question_id'), 'exercise_answers', ['question_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_exercise_answers_question_id'), table_name='exercise_answers')
    op.drop_index(op.f('ix_exercise_answers_attempt_id'), table_name='exercise_answers')
    op.drop_table('exercise_answers')
    op.drop_index(op.f('ix_exercise_questions_attempt_id'), table_name='exercise_questions')
    op.drop_table('exercise_questions')
    op.drop_index(op.f('ix_exercise_attempts_lesson_id'), table_name='exercise_attempts')
    op.drop_index(op.f('ix_exercise_attempts_student_id'), table_name='exercise_attempts')
    op.drop_table('exercise_attempts')
