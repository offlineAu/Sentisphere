from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Tuple, Optional, Any


def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _end_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=23, minute=59, second=59, microsecond=999999)


def _parse_date_str(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        # Supports YYYY-MM-DD and full ISO datetime
        if len(value) == 10:
            return datetime.strptime(value, "%Y-%m-%d").date()
        return datetime.fromisoformat(value).date()
    except Exception:
        return None


def safe_parse_datetime(value: Any) -> Optional[datetime]:
    """Robustly parse a datetime from various inputs (str, date, datetime)."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str):
        try:
            # Try ISO format first
            return datetime.fromisoformat(value)
        except ValueError:
            try:
                # Try simple date format
                d = datetime.strptime(value, "%Y-%m-%d").date()
                return datetime.combine(d, datetime.min.time())
            except ValueError:
                pass
    return None


def get_week_range(d: date) -> Tuple[date, date]:
    """Return the ISO week range (Mon..Sun) for the given date.

    Monday is the first day of the week (ISO-8601), Sunday is the last.
    """
    weekday = d.weekday()  # Monday=0 .. Sunday=6
    start = d - timedelta(days=weekday)
    end = start + timedelta(days=6)
    return start, end


def parse_global_range(
    range: Optional[str], start: Optional[str], end: Optional[str]
) -> Tuple[datetime, datetime]:
    """Parse the global date filter to concrete [start_dt, end_dt].

    - this_week: Mon 00:00:00 .. Sun 23:59:59 of current week
    - last_week: previous ISO week Mon..Sun
    - last_30d: last 30 calendar days inclusive
    - this_month: first..last day of the current month
    - this_semester: Jan–Jun or Jul–Dec of current year
    - custom: use provided start/end (YYYY-MM-DD or ISO)
    """
    today = date.today()
    now = datetime.now()
    key = (range or "this_week").lower()

    if key == "custom":
        s = _parse_date_str(start)
        e = _parse_date_str(end)
        if s and e:
            start_dt = _start_of_day(datetime(s.year, s.month, s.day))
            end_dt = _end_of_day(datetime(e.year, e.month, e.day))
            return start_dt, end_dt
        # Fallback to last_30d if custom inputs invalid
        key = "last_30d"

    if key == "this_week":
        ws, we = get_week_range(today)
        return _start_of_day(datetime(ws.year, ws.month, ws.day)), _end_of_day(
            datetime(we.year, we.month, we.day)
        )

    if key == "last_week":
        this_ws, _ = get_week_range(today)
        prev_s = this_ws - timedelta(days=7)
        prev_e = prev_s + timedelta(days=6)
        return _start_of_day(datetime(prev_s.year, prev_s.month, prev_s.day)), _end_of_day(
            datetime(prev_e.year, prev_e.month, prev_e.day)
        )

    if key == "last_30d":
        start_dt = _start_of_day(now - timedelta(days=29))
        end_dt = _end_of_day(now)
        return start_dt, end_dt

    if key == "this_month":
        first = date(today.year, today.month, 1)
        # next month first day
        if today.month == 12:
            next_first = date(today.year + 1, 1, 1)
        else:
            next_first = date(today.year, today.month + 1, 1)
        last = next_first - timedelta(days=1)
        return _start_of_day(datetime(first.year, first.month, first.day)), _end_of_day(
            datetime(last.year, last.month, last.day)
        )

    if key == "this_semester":
        if today.month <= 6:
            start_d = date(today.year, 1, 1)
            end_d = date(today.year, 6, 30)
        else:
            start_d = date(today.year, 7, 1)
            end_d = date(today.year, 12, 31)
        return _start_of_day(datetime(start_d.year, start_d.month, start_d.day)), _end_of_day(
            datetime(end_d.year, end_d.month, end_d.day)
        )

    # Default fallback
    ws, we = get_week_range(today)
    return _start_of_day(datetime(ws.year, ws.month, ws.day)), _end_of_day(
        datetime(we.year, we.month, we.day)
    )


def generate_weekly_labels(start_d: date, end_d: date) -> List[str]:
    """Generate weekly labels 'MMM dd - MMM dd' from start to end (Mon..Sun)."""
    labels: List[str] = []
    # normalize to week boundaries
    cur_s, _ = get_week_range(start_d)
    _, end_w = get_week_range(end_d)
    cur = cur_s
    while cur <= end_w:
        ws, we = get_week_range(cur)
        label = f"{ws.strftime('%b %d')} - {we.strftime('%b %d')}"
        labels.append(label)
        cur = we + timedelta(days=1)
    return labels


def format_range(start_dt: datetime, end_dt: datetime) -> str:
    """Format a date-time range compactly: 'MMM dd, YYYY — MMM dd, YYYY'"""
    left = start_dt.strftime("%b %d, %Y")
    right = end_dt.strftime("%b %d, %Y")
    return f"{left} — {right}"

