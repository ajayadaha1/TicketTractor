import httpx


class JiraCloudService:
    """Handles Jira Cloud REST API v3 interactions via api.atlassian.com."""

    @staticmethod
    def _base_url(cloud_id: str) -> str:
        return f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3"

    @staticmethod
    def _headers(access_token: str) -> dict:
        return {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @staticmethod
    async def get_issue(cloud_id: str, access_token: str, issue_key: str) -> dict:
        """Get a Jira issue with labels, summary, and status fields."""
        url = f"{JiraCloudService._base_url(cloud_id)}/issue/{issue_key}"
        params = {"fields": "labels,summary,status"}
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=JiraCloudService._headers(access_token),
                params=params,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_issue_labels(cloud_id: str, access_token: str, issue_key: str) -> list[str]:
        """Get all labels for a Jira issue."""
        issue = await JiraCloudService.get_issue(cloud_id, access_token, issue_key)
        return issue.get("fields", {}).get("labels", [])

    @staticmethod
    async def get_results_labels(cloud_id: str, access_token: str, issue_key: str) -> list[str]:
        """Get only labels starting with 'results_' for a Jira issue."""
        labels = await JiraCloudService.get_issue_labels(cloud_id, access_token, issue_key)
        return [label for label in labels if label.startswith("results_")]

    @staticmethod
    async def update_issue_labels(
        cloud_id: str, access_token: str, issue_key: str, labels: list[str]
    ) -> dict:
        """Replace all labels on a Jira issue."""
        url = f"{JiraCloudService._base_url(cloud_id)}/issue/{issue_key}"
        async with httpx.AsyncClient() as client:
            response = await client.put(
                url,
                headers=JiraCloudService._headers(access_token),
                json={"fields": {"labels": labels}},
                timeout=30.0,
            )
            response.raise_for_status()
            # PUT returns 204 No Content on success
            return {"status": "updated"}

    @staticmethod
    async def add_issue_comment(
        cloud_id: str, access_token: str, issue_key: str, comment_body: str
    ) -> dict:
        """Add a comment to a Jira issue using Atlassian Document Format (ADF)."""
        url = f"{JiraCloudService._base_url(cloud_id)}/issue/{issue_key}/comment"
        # Jira Cloud API v3 requires ADF format for comments
        adf_body = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": comment_body,
                            }
                        ],
                    }
                ],
            }
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=JiraCloudService._headers(access_token),
                json=adf_body,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    def build_label(stage: str, flow: str, result: str, failing_cmd: str) -> str:
        """Build the results label string.

        Format: results_<Stage><Flow><Result>
        If failing_cmd is empty, append 'X'.
        Example: results_S1F2R3 or results_S1F2R3X
        """
        label = f"results_{stage}{flow}{result}"
        if not failing_cmd or not failing_cmd.strip():
            label += "X"
        return label
