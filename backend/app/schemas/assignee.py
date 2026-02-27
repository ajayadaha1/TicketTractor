from pydantic import BaseModel
from typing import Optional


class AssigneeUserOut(BaseModel):
    id: int
    display_name: str
    username: str
    email: str
    is_active: bool


class AssigneeUserCreate(BaseModel):
    display_name: str
    username: str
    email: str


class AssigneeTicketItem(BaseModel):
    ticket_key: str
    assignee_username: str
    account_id: Optional[str] = None
    comment: Optional[str] = ""


class JiraSearchUserResult(BaseModel):
    account_id: str
    display_name: str
    email_address: str = ""
    avatar_url: str = ""


class BulkAssigneeUpdateRequest(BaseModel):
    tickets: list[AssigneeTicketItem]


class AssigneeUpdateResult(BaseModel):
    ticket_key: str
    success: bool
    assignee_set: Optional[str] = None
    comment_added: bool = False
    error: Optional[str] = None


class BulkAssigneeUpdateResponse(BaseModel):
    results: list[AssigneeUpdateResult]
    total: int
    successful: int
    failed: int


class CurrentAssigneeLookupRequest(BaseModel):
    ticket_keys: list[str]


class CurrentAssigneeItem(BaseModel):
    ticket_key: str
    display_name: str
    account_id: str
    error: Optional[str] = None


class CurrentAssigneeLookupResponse(BaseModel):
    results: list[CurrentAssigneeItem]
