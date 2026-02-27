import logging

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select, delete

from ..database import get_session_factory
from ..models import AssigneeUser
from ..schemas.assignee import (
    AssigneeUserOut,
    AssigneeUserCreate,
    AssigneeTicketItem,
    BulkAssigneeUpdateRequest,
    BulkAssigneeUpdateResponse,
    AssigneeUpdateResult,
    CurrentAssigneeLookupRequest,
    CurrentAssigneeLookupResponse,
    CurrentAssigneeItem,
    JiraSearchUserResult,
)
from ..services.atlassian_auth import AtlassianAuthService
from ..services.audit import record_action
from ..services.jira_cloud_service import JiraCloudService

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Seed data ──────────────────────────────────────────────────────────────────
SEED_USERS = [
    ("John Lundy", "johlundy", "john.lundy@amd.com"),
    ("Yucheng Guo", "yucheguo", "yucheng.guo@amd.com"),
    ("Drew Schwarzlose", "dschwarz", "drew.schwarzlose@amd.com"),
    ("Paul Jerry", "jerrpaul", "paul.jerry@amd.com"),
    ("Rizwan Rahman", "rirahman", "rizwan.rahman@amd.com"),
    ("Balasubramanian, Neha", "nvellaka", "neha.balasubramanian@amd.com"),
]


async def seed_assignee_users():
    """Insert seed users if the table is empty (runs once at startup)."""
    async with get_session_factory()() as session:
        count_result = await session.execute(
            select(AssigneeUser.id).limit(1)
        )
        if count_result.first() is not None:
            return  # already seeded

        for display_name, username, email in SEED_USERS:
            session.add(AssigneeUser(display_name=display_name, username=username, email=email))
        await session.commit()
        logger.info(f"Seeded {len(SEED_USERS)} assignee users")


# ── Auth helper (same pattern as tickets router) ──────────────────────────────
async def _get_session(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.replace("Bearer ", "")
    session = await AtlassianAuthService.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return session


# ── CRUD: Assignee Users ──────────────────────────────────────────────────────

@router.get("/users", response_model=list[AssigneeUserOut])
async def list_users(request: Request):
    """Return all active assignee users."""
    await _get_session(request)
    async with get_session_factory()() as session:
        result = await session.execute(
            select(AssigneeUser)
            .where(AssigneeUser.is_active == True)
            .order_by(AssigneeUser.display_name)
        )
        users = result.scalars().all()
    return [
        AssigneeUserOut(
            id=u.id,
            display_name=u.display_name,
            username=u.username,
            email=u.email,
            is_active=u.is_active,
        )
        for u in users
    ]


@router.post("/users", response_model=AssigneeUserOut, status_code=201)
async def add_user(body: AssigneeUserCreate, request: Request):
    """Add a new assignee user."""
    session_data = await _get_session(request)
    user_info = session_data.get("user_info", {})
    actor_name = user_info.get("name", "Unknown")
    actor_email = user_info.get("email", "")

    async with get_session_factory()() as session:
        # Check for duplicate username
        existing = await session.execute(
            select(AssigneeUser).where(AssigneeUser.username == body.username)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"User '{body.username}' already exists")

        user = AssigneeUser(display_name=body.display_name, username=body.username, email=body.email)
        session.add(user)
        await session.commit()
        await session.refresh(user)

    await record_action(
        user_name=actor_name,
        user_email=actor_email,
        ticket_key="—",
        action="user_added",
        details=f"Added assignee user: {body.display_name} ({body.username}) <{body.email}>",
    )
    return AssigneeUserOut(
        id=user.id,
        display_name=user.display_name,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
    )


@router.delete("/users/{user_id}", status_code=204)
async def remove_user(user_id: int, request: Request):
    """Remove an assignee user."""
    session_data = await _get_session(request)
    user_info = session_data.get("user_info", {})
    actor_name = user_info.get("name", "Unknown")
    actor_email = user_info.get("email", "")

    async with get_session_factory()() as session:
        result = await session.execute(
            select(AssigneeUser).where(AssigneeUser.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        removed_name = user.display_name
        removed_username = user.username
        await session.delete(user)
        await session.commit()

    await record_action(
        user_name=actor_name,
        user_email=actor_email,
        ticket_key="—",
        action="user_removed",
        details=f"Removed assignee user: {removed_name} ({removed_username})",
    )


# ── Search Jira users (live directory search) ─────────────────────────────────

@router.get("/search-jira", response_model=list[JiraSearchUserResult])
async def search_jira_users(query: str = Query(min_length=2), request: Request = None):
    """Search Jira user directory by name or email. Returns matching real users."""
    session_data = await _get_session(request)
    cloud_id = session_data["cloud_id"]
    access_token = session_data["access_token"]

    raw_users = await JiraCloudService.search_users(cloud_id, access_token, query)
    return [
        JiraSearchUserResult(
            account_id=u.get("accountId", ""),
            display_name=u.get("displayName", ""),
            email_address=u.get("emailAddress", ""),
            avatar_url=(u.get("avatarUrls") or {}).get("24x24", ""),
        )
        for u in raw_users
        if u.get("accountType") == "atlassian"  # filter out bots / service accounts
    ]


# ── Look up current assignees ─────────────────────────────────────────────────

@router.post("/current-assignees", response_model=CurrentAssigneeLookupResponse)
async def get_current_assignees(body: CurrentAssigneeLookupRequest, request: Request):
    """Bulk-fetch the current assignee for a list of ticket keys."""
    session_data = await _get_session(request)
    cloud_id = session_data["cloud_id"]
    access_token = session_data["access_token"]

    results: list[CurrentAssigneeItem] = []
    for ticket_key in body.ticket_keys:
        try:
            assignee = await JiraCloudService.get_issue_assignee(
                cloud_id, access_token, ticket_key
            )
            if assignee:
                results.append(CurrentAssigneeItem(
                    ticket_key=ticket_key,
                    display_name=assignee.get("displayName", ""),
                    account_id=assignee.get("accountId", ""),
                ))
            else:
                results.append(CurrentAssigneeItem(
                    ticket_key=ticket_key,
                    display_name="Unassigned",
                    account_id="",
                ))
        except Exception as e:
            logger.warning(f"Failed to get assignee for {ticket_key}: {e}")
            results.append(CurrentAssigneeItem(
                ticket_key=ticket_key,
                display_name="Error",
                account_id="",
                error=str(e),
            ))
    return CurrentAssigneeLookupResponse(results=results)


# ── Bulk assign ───────────────────────────────────────────────────────────────

@router.post("/update", response_model=BulkAssigneeUpdateResponse)
async def bulk_update_assignees(body: BulkAssigneeUpdateRequest, request: Request):
    """Bulk update assignees (and optionally add comments) on Jira tickets."""
    session_data = await _get_session(request)
    cloud_id = session_data["cloud_id"]
    access_token = session_data["access_token"]
    user_info = session_data.get("user_info", {})
    user_name = user_info.get("name", "Unknown")
    user_email = user_info.get("email", "")

    is_bulk = len(body.tickets) > 1

    # Pre-load emails from our DB as fallback (for users without direct accountId)
    username_to_email: dict[str, str] = {}
    async with get_session_factory()() as session:
        all_users = await session.execute(
            select(AssigneeUser).where(AssigneeUser.is_active == True)
        )
        for u in all_users.scalars():
            username_to_email[u.username] = u.email

    # Cache account-id lookups so we don't re-search the same username
    account_id_cache: dict[str, str | None] = {}

    results: list[AssigneeUpdateResult] = []
    for ticket in body.tickets:
        try:
            username = ticket.assignee_username

            # If accountId was provided directly (from Jira search), use it
            if ticket.account_id:
                account_id = ticket.account_id
            else:
                # Fallback: resolve via email from local DB
                email = username_to_email.get(username, "")
                if not email:
                    raise ValueError(
                        f"No email configured for user '{username}'. Update the user's email in Manage Users."
                    )

                if username not in account_id_cache:
                    jira_user = await JiraCloudService.search_user(
                        cloud_id, access_token, email
                    )
                    account_id_cache[username] = (
                        jira_user.get("accountId") if jira_user else None
                    )

                account_id = account_id_cache[username]

            if not account_id:
                raise ValueError(
                    f"Could not resolve Jira user for '{username}'"
                )

            # Assign the issue
            await JiraCloudService.assign_issue(
                cloud_id, access_token, ticket.ticket_key, account_id
            )

            # Audit
            detail_parts = [f"assignee={username}"]
            if is_bulk:
                detail_parts.append("bulk=true")
            await record_action(
                user_name=user_name,
                user_email=user_email,
                ticket_key=ticket.ticket_key,
                action="assignee_update",
                label="",
                details="; ".join(detail_parts),
            )

            # Optional comment
            comment_added = False
            if ticket.comment and ticket.comment.strip():
                await JiraCloudService.add_issue_comment(
                    cloud_id, access_token, ticket.ticket_key, ticket.comment
                )
                comment_added = True
                await record_action(
                    user_name=user_name,
                    user_email=user_email,
                    ticket_key=ticket.ticket_key,
                    action="comment_added",
                    comment=ticket.comment,
                )

            results.append(
                AssigneeUpdateResult(
                    ticket_key=ticket.ticket_key,
                    success=True,
                    assignee_set=username,
                    comment_added=comment_added,
                )
            )

        except Exception as e:
            await record_action(
                user_name=user_name,
                user_email=user_email,
                ticket_key=ticket.ticket_key,
                action="assignee_failed",
                details=f"assignee_update failed: {e}",
            )
            results.append(
                AssigneeUpdateResult(
                    ticket_key=ticket.ticket_key,
                    success=False,
                    error=str(e),
                )
            )

    successful = sum(1 for r in results if r.success)
    return BulkAssigneeUpdateResponse(
        results=results,
        total=len(results),
        successful=successful,
        failed=len(results) - successful,
    )
