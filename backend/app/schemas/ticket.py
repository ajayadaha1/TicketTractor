from pydantic import BaseModel
from typing import Optional


class TicketUpdate(BaseModel):
    ticket_key: str
    stage: str
    flow: str
    result: str
    failing_cmd: Optional[str] = ""
    comment: Optional[str] = ""
    label_action: str = "replace"  # "replace" | "add"


class BulkUpdateRequest(BaseModel):
    tickets: list[TicketUpdate]


class TicketLabelCheckRequest(BaseModel):
    ticket_keys: list[str]


class LabelCheckResult(BaseModel):
    ticket_key: str
    existing_results_labels: list[str]
    has_conflict: bool


class BulkLabelCheckResponse(BaseModel):
    results: list[LabelCheckResult]


class TicketUpdateResult(BaseModel):
    ticket_key: str
    success: bool
    label_applied: Optional[str] = None
    comment_added: bool = False
    error: Optional[str] = None


class BulkUpdateResponse(BaseModel):
    results: list[TicketUpdateResult]
    total: int
    successful: int
    failed: int


class DropdownOption(BaseModel):
    value: str
    label: str


class DropdownConfig(BaseModel):
    stages: list[DropdownOption]
    flows: list[DropdownOption]
    results: list[DropdownOption]
