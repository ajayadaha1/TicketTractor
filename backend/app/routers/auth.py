import logging
import traceback
from urllib.parse import quote_plus

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from ..config import get_settings
from ..services.atlassian_auth import AtlassianAuthService

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()


@router.get("/login")
async def atlassian_login():
    """Return the Atlassian OAuth authorize URL for the frontend to redirect to."""
    auth_url = AtlassianAuthService.build_authorize_url()
    return {"auth_url": auth_url}


@router.get("/callback")
async def atlassian_callback(code: str, state: str | None = None):
    """Handle Atlassian OAuth callback. Exchanges code for tokens and redirects to frontend."""
    try:
        # Exchange authorization code for tokens
        logger.info("Exchanging code for tokens...")
        token_data = await AtlassianAuthService.exchange_code_for_tokens(code)
        logger.info(f"Token exchange response keys: {list(token_data.keys())}")
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)

        if not access_token:
            error_msg = token_data.get("error_description", token_data.get("error", "No access token"))
            logger.error(f"No access token in response: {token_data}")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/login?error={quote_plus(error_msg)}"
            )

        # Get the cloud ID for amd.atlassian.net
        logger.info("Getting cloud ID...")
        cloud_id = await AtlassianAuthService.get_cloud_id(access_token)
        if not cloud_id:
            logger.error("No accessible Jira site found")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/login?error=No+accessible+Jira+site+found"
            )
        logger.info(f"Cloud ID: {cloud_id}")

        # Get user info via Jira Cloud API (uses read:jira-user scope)
        logger.info("Getting user info...")
        try:
            user_info = await AtlassianAuthService.get_user_info(access_token, cloud_id)
            logger.info(f"User: {user_info.get('name', user_info.get('email', 'unknown'))}")
        except Exception as user_err:
            logger.warning(f"Could not fetch user info (read:jira-user scope may not be granted): {user_err}")
            user_info = {
                "account_id": "",
                "name": "Jira User",
                "email": "",
                "picture": "",
            }

        # Create session
        session_token = AtlassianAuthService.create_session(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            cloud_id=cloud_id,
            user_info=user_info,
        )

        # Redirect to frontend with token
        display_name = user_info.get("name", user_info.get("email", "User"))
        redirect_url = f"{settings.FRONTEND_URL}/login?token={session_token}&display_name={quote_plus(display_name)}"
        logger.info(f"Redirecting to frontend: {settings.FRONTEND_URL}/login?token=...&display_name={display_name}")
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        error_detail = str(e)
        logger.error(f"OAuth callback failed: {error_detail}")
        logger.error(traceback.format_exc())
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error={quote_plus(error_detail)}"
        )


@router.get("/me")
async def get_current_user(request: Request):
    """Get current user information from the session."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header.replace("Bearer ", "")
    session = await AtlassianAuthService.get_session(token)

    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_info = session["user_info"]
    return {
        "account_id": user_info.get("account_id", ""),
        "display_name": user_info.get("name", ""),
        "email": user_info.get("email", ""),
        "avatar_url": user_info.get("picture", ""),
    }


@router.post("/logout")
async def logout(request: Request):
    """Invalidate the current session."""
    body = await request.json()
    token = body.get("token")
    if token:
        AtlassianAuthService.invalidate_session(token)
    return {"message": "Successfully logged out"}
