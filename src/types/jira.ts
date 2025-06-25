export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
  transitions?: JiraTransition[];
}

export interface JiraIssueFields {
  summary: string;
  description?: string;
  issuetype: JiraIssueType;
  project: JiraProject;
  assignee?: JiraUser;
  reporter?: JiraUser;
  priority?: JiraPriority;
  status: JiraStatus;
  created: string;
  updated: string;
  labels?: string[];
  components?: JiraComponent[];
  fixVersions?: JiraVersion[];
  [customField: string]: any;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  iconUrl?: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
}

export interface JiraUser {
  accountId: string;
  emailAddress?: string;
  displayName: string;
  active: boolean;
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
  };
}

export interface JiraComponent {
  id: string;
  name: string;
  description?: string;
}

export interface JiraVersion {
  id: string;
  name: string;
  released: boolean;
  releaseDate?: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

export interface JiraApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateIssuePayload {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description?: string;
    assignee?: { accountId: string };
    priority?: { name: string };
    labels?: string[];
    components?: { name: string }[];
    [customField: string]: any;
  };
}

export interface UpdateIssuePayload {
  fields?: Partial<CreateIssuePayload['fields']>;
  update?: {
    [field: string]: any[];
  };
}