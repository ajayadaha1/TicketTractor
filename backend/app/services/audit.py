import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

AUDIT_FILE = Path("/app/data/audit_log.json")
_lock = Lock()


def _load_log() -> list[dict]:
    if AUDIT_FILE.exists():
        try:
            return json.loads(AUDIT_FILE.read_text())
        except Exception as e:
            logger.warning(f"Could not load audit log: {e}")
    return []


def _save_log(entries: list[dict]):
    try:
        AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUDIT_FILE.write_text(json.dumps(entries, indent=2))
    except Exception as e:
        logger.warning(f"Could not save audit log: {e}")


def record_action(
    user_name: str,
    user_email: str,
    ticket_key: str,
    action: str,
    label: str = "",
    comment: str = "",
    details: str = "",
):
    """Record an audit trail entry."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "epoch": time.time(),
        "user_name": user_name,
        "user_email": user_email,
        "ticket_key": ticket_key,
        "action": action,
        "label": label,
        "comment": comment,
        "details": details,
    }
    with _lock:
        entries = _load_log()
        entries.append(entry)
        _save_log(entries)
    logger.info(f"Audit: {user_name} -> {action} on {ticket_key} (label={label})")


def get_history(limit: int = 200, offset: int = 0) -> dict:
    """Get audit log entries, newest first."""
    with _lock:
        entries = _load_log()
    entries.sort(key=lambda e: e.get("epoch", 0), reverse=True)
    total = len(entries)
    page = entries[offset:offset + limit]
    return {"entries": page, "total": total}
