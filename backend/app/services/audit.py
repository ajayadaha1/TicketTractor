import logging

from sqlalchemy import select, func

from ..database import get_session_factory
from ..models import ActivityLog

logger = logging.getLogger(__name__)


async def record_action(
    user_name: str,
    user_email: str,
    ticket_key: str,
    action: str,
    label: str = "",
    comment: str = "",
    details: str = "",
):
    """Record an audit trail entry to PostgreSQL."""
    async with get_session_factory()() as session:
        entry = ActivityLog(
            user_name=user_name,
            user_email=user_email,
            ticket_key=ticket_key,
            action=action,
            label=label,
            comment=comment,
            details=details,
        )
        session.add(entry)
        await session.commit()
    logger.info(f"Audit: {user_name} -> {action} on {ticket_key} (label={label})")


async def get_history(limit: int = 200, offset: int = 0, actions: list[str] | None = None) -> dict:
    """Get audit log entries, newest first. Optionally filter by action types."""
    async with get_session_factory()() as session:
        # Build base filter
        count_query = select(func.count(ActivityLog.id))
        data_query = select(ActivityLog).order_by(ActivityLog.created_at.desc())

        if actions:
            count_query = count_query.where(ActivityLog.action.in_(actions))
            data_query = data_query.where(ActivityLog.action.in_(actions))

        # Get total count
        count_result = await session.execute(count_query)
        total = count_result.scalar()

        # Get paginated entries
        data_query = data_query.offset(offset).limit(limit)
        result = await session.execute(data_query)
        logs = result.scalars().all()

    entries = [
        {
            "timestamp": log.created_at.isoformat() if log.created_at else "",
            "epoch": log.created_at.timestamp() if log.created_at else 0,
            "user_name": log.user_name,
            "user_email": log.user_email,
            "ticket_key": log.ticket_key,
            "action": log.action,
            "label": log.label or "",
            "comment": log.comment or "",
            "details": log.details or "",
        }
        for log in logs
    ]
    return {"entries": entries, "total": total}
