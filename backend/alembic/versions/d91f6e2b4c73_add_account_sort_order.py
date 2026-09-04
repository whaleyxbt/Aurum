"""add account sort order

Revision ID: d91f6e2b4c73
Revises: c4e8f61a9d23
Create Date: 2026-09-04 18:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d91f6e2b4c73"
down_revision: Union[str, None] = "c4e8f61a9d23"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("sort_order", sa.Integer(), nullable=True),
    )
    # Preserve the order users saw before this feature: accounts were
    # sorted by name, with id as a stable tiebreak for duplicate names.
    op.execute(
        """
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY name, id) - 1 AS position
            FROM accounts
        )
        UPDATE accounts
        SET sort_order = ranked.position
        FROM ranked
        WHERE accounts.id = ranked.id
        """
    )
    op.alter_column(
        "accounts",
        "sort_order",
        existing_type=sa.Integer(),
        nullable=False,
        server_default=sa.text("0"),
    )


def downgrade() -> None:
    op.drop_column("accounts", "sort_order")
