"""
=============================================================================
DEPRECATED MODULE: mobile_database.py
=============================================================================
As of December 2024, Sentisphere uses a UNIFIED database for both mobile 
and web applications. This file is kept for backward compatibility only.

All mobile DB operations now use the shared database from app.db.database.
Schema creation is disabled — Railway uses full SQL schema import.

DO NOT add new code here. Use app.db.database instead.
=============================================================================
"""

from typing import Generator

# =============================================================================
# BACKWARD COMPATIBILITY SHIMS
# These imports ensure existing code that imports from this module won't break.
# All operations now use the unified/shared database.
# =============================================================================

from app.db.database import engine as mobile_engine
from app.db.database import SessionLocal as MobileSessionLocal
from app.db.database import get_db as get_mobile_db

# Legacy URL variable (deprecated, kept for any code that references it)
MOBILE_DATABASE_URL: str | None = None


def initialize_mobile_database() -> None:
    """
    DEPRECATED: Schema creation disabled.
    
    Railway/production uses the full SQL schema import (ustp_full_schema_and_data_final.sql).
    This function now only verifies the connection works.
    """
    from sqlalchemy import text
    
    # Just verify connection works - no schema creation
    try:
        with mobile_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        # Log but don't crash - let health check report the issue
        import logging
        logging.warning(f"[mobile_database] Connection check failed: {e}")


# =============================================================================
# DEPRECATED CODE BELOW (kept as comments for reference)
# =============================================================================
#
# The following code has been deprecated and replaced with shims above.
# Schema creation SQL has been removed - use ustp_full_schema_and_data_final.sql
#
# Old code reference:
# - _ensure_database_exists(url) - Created DB if not exists
# - _create_engine() - Created separate mobile engine
# - initialize_mobile_database() - Created tables via SQL
# - mobile_engine = _create_engine() - Separate engine instance
# - MobileSessionLocal = sessionmaker(...) - Separate session factory
#
# All of these now point to the unified database in app.db.database
# =============================================================================
