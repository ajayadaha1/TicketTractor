import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from ..config import get_settings
from ..schemas.ticket import (
    BulkLabelCheckResponse,
    BulkUpdateRequest,
    BulkUpdateResponse,
    DropdownConfig,
    LabelCheckResult,
    TicketLabelCheckRequest,
    TicketUpdateResult,
)
from ..services.atlassian_auth import AtlassianAuthService
from ..services.audit import record_action, get_history
from ..services.jira_cloud_service import JiraCloudService

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

# Load JSON config files
DATA_DIR = Path(__file__).parent.parent / "data"


def _load_json(filename: str) -> list:
    with open(DATA_DIR / filename, "r") as f:
        return json.load(f)


async def _get_session(request: Request) -> dict:
    """Extract and validate the session from the Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header.replace("Bearer ", "")
    session = await AtlassianAuthService.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return session


@router.get("/config", response_model=DropdownConfig)
async def get_dropdown_config():
    """Return Stage, Flow, and Results dropdown options from JSON config files."""
    return DropdownConfig(
        stages=_load_json("stages.json"),
        flows=_load_json("flows.json"),
        results=_load_json("results.json"),
    )


@router.get("/{ticket_key}/labels")
async def get_ticket_labels(ticket_key: str, request: Request):
    """Get existing labels for a ticket, highlighting results_ prefixed ones."""
    session = await _get_session(request)
    try:
        all_labels = await JiraCloudService.get_issue_labels(
            session["cloud_id"], session["access_token"], ticket_key
        )
        results_labels = [l for l in all_labels if l.startswith("results_")]
        return {
            "ticket_key": ticket_key,
            "labels": all_labels,
            "results_labels": results_labels,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get labels for {ticket_key}: {str(e)}")


@router.post("/check-labels", response_model=BulkLabelCheckResponse)
async def check_labels(body: TicketLabelCheckRequest, request: Request):
    """Bulk check which tickets already have results_ labels."""
    session = await _get_session(request)
    results = []
    for ticket_key in body.ticket_keys:
        try:
            results_labels = await JiraCloudService.get_results_labels(
                session["cloud_id"], session["access_token"], ticket_key
            )
            results.append(LabelCheckResult(
                ticket_key=ticket_key,
                existing_results_labels=results_labels,
                has_conflict=len(results_labels) > 0,
            ))
        except Exception as e:
            results.append(LabelCheckResult(
                ticket_key=ticket_key,
                existing_results_labels=[],
                has_conflict=False,
            ))
    return BulkLabelCheckResponse(results=results)


@router.post("/update", response_model=BulkUpdateResponse)
async def bulk_update_tickets(body: BulkUpdateRequest, request: Request):
    """Bulk update labels and add comments for multiple tickets."""
    session = await _get_session(request)
    cloud_id = session["cloud_id"]
    access_token = session["access_token"]
    user_info = session.get("user_info", {})
    user_name = user_info.get("name", "Unknown")
    user_email = user_info.get("email", "")

    results = []
    for ticket in body.tickets:
        try:
            # Build the new label
            new_label = JiraCloudService.build_label(
                ticket.stage, ticket.flow, ticket.result, ticket.failing_cmd or ""
            )
            logger.info(
                f"[{ticket.ticket_key}] Input: stage={ticket.stage!r}, flow={ticket.flow!r}, "
                f"result={ticket.result!r}, failing_cmd={ticket.failing_cmd!r} => label={new_label!r}"
            )

            # Get current labels
            current_labels = await JiraCloudService.get_issue_labels(
                cloud_id, access_token, ticket.ticket_key
            )
            logger.info(f"[{ticket.ticket_key}] Current labels: {current_labels}")

            # Handle label update based on action
            if ticket.label_action == "replace":
                removed = [l for l in current_labels if l.startswith("results_")]
                updated_labels = [l for l in current_labels if not l.startswith("results_")]
                updated_labels.append(new_label)
            else:
                removed = []
                updated_labels = list(current_labels)
                if new_label not in updated_labels:
                    updated_labels.append(new_label)

            logger.info(f"[{ticket.ticket_key}] Updating labels to: {updated_labels}")

            # Update labels on the issue
            await JiraCloudService.update_issue_labels(
                cloud_id, access_token, ticket.ticket_key, updated_labels
            )

            # Record audit: label update
            details_parts = [f"action={ticket.label_action}"]
            if removed:
                details_parts.append(f"replaced={removed}")
            if ticket.failing_cmd:
                details_parts.append(f"failing_cmd={ticket.failing_cmd}")
            record_action(
                user_name=user_name,
                user_email=user_email,
                ticket_key=ticket.ticket_key,
                action="label_update",
                label=new_label,
                details="; ".join(details_parts),
            )

            # Add comment if provided
            comment_added = False
            if ticket.comment and ticket.comment.strip():
                await JiraCloudService.add_issue_comment(
                    cloud_id, access_token, ticket.ticket_key, ticket.comment
                )
                comment_added = True
                record_action(
                    user_name=user_name,
                    user_email=user_email,
                    ticket_key=ticket.ticket_key,
                    action="comment_added",
                    comment=ticket.comment,
                )

            results.append(TicketUpdateResult(
                ticket_key=ticket.ticket_key,
                success=True,
                label_applied=new_label,
                comment_added=comment_added,
            ))
        except Exception as e:
            record_action(
                user_name=user_name,
                user_email=user_email,
                ticket_key=ticket.ticket_key,
                action="update_failed",
                details=str(e),
            )
            results.append(TicketUpdateResult(
                ticket_key=ticket.ticket_key,
                success=False,
                error=str(e),
            ))

    successful = sum(1 for r in results if r.success)
    return BulkUpdateResponse(
        results=results,
        total=len(results),
        successful=successful,
        failed=len(results) - successful,
    )


@router.get("/history")
async def get_audit_history(request: Request, limit: int = 200, offset: int = 0):
    """Get audit trail of all ticket updates."""
    await _get_session(request)
    return get_history(limit=limit, offset=offset)
