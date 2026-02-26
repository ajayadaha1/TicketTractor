import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from jose import jwt

from ..config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

SESSION_FILE = Path("/app/data/sessions.json")


class AtlassianAuthService:
    """Handles Atlassian Cloud OAuth 2.0 (3LO) authentication flow."""

    # In-memory token store: session_id -> { access_token, refresh_token, cloud_id, expires_at, user_info }
    _token_store: dict = {}
    _loaded: bool = False

    @classmethod
    def _load_sessions(cls):
        """Load sessions from disk on first access."""
        if cls._loaded:
            return
        cls._loaded = True
        if SESSION_FILE.exists():
            try:
                data = json.loads(SESSION_FILE.read_text())
                cls._token_store.update(data)
                logger.info(f"Loaded {len(data)} sessions from disk")
            except Exception as e:
                logger.warning(f"Could not load sessions from disk: {e}")

    @classmethod
    def _save_sessions(cls):
        """Persist sessions to disk after cleaning up stale entries."""
        cls._cleanup_sessions()
        try:
            SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
            SESSION_FILE.write_text(json.dumps(cls._token_store))
        except Exception as e:
            logger.warning(f"Could not save sessions to disk: {e}")

    @classmethod
    def _cleanup_sessions(cls):
        """Remove sessions older than JWT lifetime (no valid JWT can reference them)."""
        max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        now = time.time()
        stale = [
            sid for sid, s in cls._token_store.items()
            if now - s.get("created_at", 0) > max_age
        ]
        for sid in stale:
            cls._token_store.pop(sid, None)
        if stale:
            logger.info(f"Cleaned up {len(stale)} expired sessions")

    @staticmethod
    def build_authorize_url() -> str:
        """Build the Atlassian OAuth 2.0 authorize URL."""
        state = secrets.token_urlsafe(32)
        callback_url = f"{settings.BACKEND_URL}/api/auth/callback"
        scopes = settings.ATLASSIAN_SCOPES.replace(" ", "%20")
        url = (
            f"{settings.ATLASSIAN_AUTH_URL}"
            f"?audience=api.atlassian.com"
            f"&client_id={settings.ATLASSIAN_CLIENT_ID}"
            f"&scope={scopes}"
            f"&redirect_uri={callback_url}"
            f"&state={state}"
            f"&response_type=code"
        )
        return url

    @staticmethod
    async def exchange_code_for_tokens(code: str) -> dict:
        """Exchange authorization code for access and refresh tokens."""
        callback_url = f"{settings.BACKEND_URL}/api/auth/callback"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings.ATLASSIAN_TOKEN_URL,
                json={
                    "grant_type": "authorization_code",
                    "client_id": settings.ATLASSIAN_CLIENT_ID,
                    "client_secret": settings.ATLASSIAN_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": callback_url,
                },
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def refresh_access_token(refresh_token: str) -> dict:
        """Refresh an expired access token using the refresh token."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings.ATLASSIAN_TOKEN_URL,
                json={
                    "grant_type": "refresh_token",
                    "client_id": settings.ATLASSIAN_CLIENT_ID,
                    "client_secret": settings.ATLASSIAN_CLIENT_SECRET,
                    "refresh_token": refresh_token,
                },
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_accessible_resources(access_token: str) -> list:
        """Get list of accessible Atlassian Cloud sites for this token."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.atlassian.com/oauth/token/accessible-resources",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_cloud_id(access_token: str) -> str | None:
        """Extract the cloud ID for the amd.atlassian.net site."""
        resources = await AtlassianAuthService.get_accessible_resources(access_token)
        for resource in resources:
            url = resource.get("url", "")
            if "amd.atlassian.net" in url:
                return resource["id"]
        # If exact match not found, return first resource if available
        if resources:
            return resources[0]["id"]
        return None

    @staticmethod
    async def get_user_info(access_token: str, cloud_id: str) -> dict:
        """Get current user information from Jira Cloud API."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/myself",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()
            # Normalize to a consistent format
            return {
                "account_id": data.get("accountId", ""),
                "name": data.get("displayName", ""),
                "email": data.get("emailAddress", ""),
                "picture": data.get("avatarUrls", {}).get("48x48", ""),
            }

    @classmethod
    def create_session(
        cls, access_token: str, refresh_token: str, expires_in: int,
        cloud_id: str, user_info: dict
    ) -> str:
        """Create a session and return a JWT session token."""
        cls._load_sessions()
        session_id = secrets.token_urlsafe(32)
        expires_at = time.time() + expires_in

        cls._token_store[session_id] = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "cloud_id": cloud_id,
            "expires_at": expires_at,
            "created_at": time.time(),
            "user_info": user_info,
        }

        cls._save_sessions()

        # Create a JWT that encodes the session_id
        jwt_payload = {
            "sub": session_id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        }
        token = jwt.encode(jwt_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return token

    @classmethod
    async def get_session(cls, jwt_token: str) -> dict | None:
        """Look up a session by JWT token. Auto-refreshes if access token expired."""
        cls._load_sessions()
        try:
            payload = jwt.decode(jwt_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            session_id = payload.get("sub")
            if not session_id or session_id not in cls._token_store:
                return None

            session = cls._token_store[session_id]

            # Auto-refresh if access token is expired (with 60s margin)
            if time.time() > session["expires_at"] - 60:
                if session.get("refresh_token"):
                    try:
                        tokens = await cls.refresh_access_token(session["refresh_token"])
                        session["access_token"] = tokens["access_token"]
                        if "refresh_token" in tokens:
                            session["refresh_token"] = tokens["refresh_token"]
                        session["expires_at"] = time.time() + tokens.get("expires_in", 3600)
                        cls._save_sessions()
                    except Exception:
                        # Refresh failed, session is invalid
                        cls._token_store.pop(session_id, None)
                        cls._save_sessions()
                        return None

            return session
        except Exception:
            return None

    @classmethod
    def invalidate_session(cls, jwt_token: str) -> bool:
        """Invalidate a session by removing it from the store."""
        cls._load_sessions()
        try:
            payload = jwt.decode(jwt_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            session_id = payload.get("sub")
            if session_id:
                cls._token_store.pop(session_id, None)
                cls._save_sessions()
                return True
        except Exception:
            pass
        return False
