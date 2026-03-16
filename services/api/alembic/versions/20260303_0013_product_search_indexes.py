"""add postgres search extensions and indexes for product name/brand lookup

Revision ID: 20260303_0013
Revises: 20260303_0012
Create Date: 2026-03-03 15:05:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260303_0013"
down_revision = "20260303_0012"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    bind = op.get_bind()
    return bool(bind and bind.dialect.name == "postgresql")


def upgrade() -> None:
    if not _is_postgres():
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION immutable_unaccent(text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        AS $$
          SELECT unaccent($1)
        $$
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_product_name_unaccent_trgm
        ON product
        USING gin (lower(immutable_unaccent(name)) gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_product_brand_unaccent_trgm
        ON product
        USING gin (lower(immutable_unaccent(coalesce(brand, ''))) gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_product_name_brand_search_tsv
        ON product
        USING gin (
            to_tsvector(
                'simple',
                lower(immutable_unaccent(coalesce(name, '') || ' ' || coalesce(brand, '')))
            )
        )
        """
    )


def downgrade() -> None:
    if not _is_postgres():
        return

    op.execute("DROP INDEX IF EXISTS ix_product_name_brand_search_tsv")
    op.execute("DROP INDEX IF EXISTS ix_product_brand_unaccent_trgm")
    op.execute("DROP INDEX IF EXISTS ix_product_name_unaccent_trgm")
    op.execute("DROP FUNCTION IF EXISTS immutable_unaccent(text)")
