import re
from datetime import datetime
from pathlib import Path

SQL_PATH = Path(r"c:/Users/COMPUTER/Documents/GitHub/Sentisphere/ustp_full_schema_and_data_final.sql")

# Matches '2025-07-06 17:13:07' or '2025-07-06'
DATE_PATTERN = re.compile(r"'(?P<full>(?P<year>2025)-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12][0-9]|3[01])(?: [0-2][0-9]:[0-5][0-9]:[0-5][0-9])?)'")

TARGET_YEAR = 2025


def remap_date_literal(literal: str) -> str:
    """Remap a single 2025-.. date/datetime into Oct–Nov 2025.

    Rules:
    - If month is 10 or 11: keep as-is.
    - If month is 7, 8, or 9: map month to 11 (November), keep day/time, clamp day to 30.
    - If any other month (<7 or >11) appears, we leave it unchanged for safety.
    """
    # literal is like 2025-07-06 or 2025-07-06 17:13:07
    has_time = " " in literal
    if has_time:
        dt = datetime.strptime(literal, "%Y-%m-%d %H:%M:%S")
    else:
        dt = datetime.strptime(literal, "%Y-%m-%d")

    if dt.year != TARGET_YEAR:
        return literal

    month = dt.month

    # Leave October / November as-is
    if month in (10, 11):
        return literal

    # July, August, September -> November
    if month in (7, 8, 9):
        month = 11
        # November 2025 has 30 days
        day = min(dt.day, 30)
        dt = dt.replace(month=month, day=day)
    else:
        # For safety, leave other months untouched
        return literal

    return dt.strftime("%Y-%m-%d %H:%M:%S" if has_time else "%Y-%m-%d")


def process_sql(sql: str) -> str:
    def _replace(match: re.Match) -> str:
        full = match.group("full")
        new_literal = remap_date_literal(full)
        return f"'{new_literal}'"

    return DATE_PATTERN.sub(_replace, sql)


def main() -> None:
    original = SQL_PATH.read_text(encoding="utf-8")
    updated = process_sql(original)

    backup_path = SQL_PATH.with_suffix(".bak_before_date_remap.sql")
    if not backup_path.exists():
        backup_path.write_text(original, encoding="utf-8")

    SQL_PATH.write_text(updated, encoding="utf-8")
    print("Date remap complete. Backup saved to", backup_path)


if __name__ == "__main__":
    main()
