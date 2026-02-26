export interface TicketEntry {
  id: string;
  ticket_key: string;
  stage: string;
  flow: string;
  result: string;
  failing_cmd: string;
  comment: string;
  label_action: 'replace' | 'add';
}

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownConfig {
  stages: DropdownOption[];
  flows: DropdownOption[];
  results: DropdownOption[];
}

export interface LabelCheckResult {
  ticket_key: string;
  existing_results_labels: string[];
  has_conflict: boolean;
}

export interface TicketUpdateResult {
  ticket_key: string;
  success: boolean;
  label_applied: string | null;
  comment_added: boolean;
  error: string | null;
}

export interface BulkUpdateResponse {
  results: TicketUpdateResult[];
  total: number;
  successful: number;
  failed: number;
}

export interface UserInfo {
  account_id: string;
  display_name: string;
  email: string;
  avatar_url: string;
}
