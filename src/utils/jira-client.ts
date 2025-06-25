import fetch from 'node-fetch';
import type { 
  JiraIssue, 
  JiraSearchResult, 
  JiraApiResponse,
  CreateIssuePayload,
  UpdateIssuePayload,
  JiraTransition
} from '../types/jira.js';

export class JiraClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(host: string, email: string, apiToken: string) {
    this.baseUrl = `${host}/rest/api/3`;
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`
    };
  }

  private async request<T>(
    method: string, 
    endpoint: string, 
    body?: any
  ): Promise<JiraApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const options: any = {
        method,
        headers: this.headers
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const data = await response.json() as any;

      if (!response.ok) {
        const errorMessages = data.errorMessages?.join(', ') || 
                            data.errors ? Object.entries(data.errors).map(([k, v]) => `${k}: ${v}`).join(', ') :
                            'Unknown error';
        return { success: false, error: errorMessages };
      }

      return { success: true, data: data as T };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async createIssue(payload: CreateIssuePayload): Promise<JiraApiResponse<JiraIssue>> {
    return this.request<JiraIssue>('POST', '/issue', payload);
  }

  async updateIssue(issueKey: string, payload: UpdateIssuePayload): Promise<JiraApiResponse<void>> {
    return this.request<void>('PUT', `/issue/${issueKey}`, payload);
  }

  async getIssue(issueKey: string, expand?: string[]): Promise<JiraApiResponse<JiraIssue>> {
    let endpoint = `/issue/${issueKey}`;
    if (expand && expand.length > 0) {
      endpoint += `?expand=${expand.join(',')}`;
    }
    return this.request<JiraIssue>('GET', endpoint);
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraApiResponse<JiraSearchResult>> {
    const params = new URLSearchParams({
      jql,
      maxResults: maxResults.toString()
    });
    return this.request<JiraSearchResult>('GET', `/search?${params}`);
  }

  async linkIssues(inwardIssue: string, outwardIssue: string, linkType: string): Promise<JiraApiResponse<void>> {
    const payload = {
      type: { name: linkType },
      inwardIssue: { key: inwardIssue },
      outwardIssue: { key: outwardIssue }
    };
    return this.request<void>('POST', '/issueLink', payload);
  }

  async getTransitions(issueKey: string): Promise<JiraApiResponse<{ transitions: JiraTransition[] }>> {
    return this.request<{ transitions: JiraTransition[] }>('GET', `/issue/${issueKey}/transitions`);
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<JiraApiResponse<void>> {
    const payload = {
      transition: { id: transitionId }
    };
    return this.request<void>('POST', `/issue/${issueKey}/transitions`, payload);
  }

  async addComment(issueKey: string, comment: string): Promise<JiraApiResponse<any>> {
    const payload = {
      body: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: comment
          }]
        }]
      }
    };
    return this.request<any>('POST', `/issue/${issueKey}/comment`, payload);
  }

  async addAttachment(issueKey: string, fileName: string, fileContent: Buffer): Promise<JiraApiResponse<any>> {
    const formData = new FormData();
    formData.append('file', new Blob([fileContent]), fileName);

    const headers = { ...this.headers };
    delete headers['Content-Type'];

    try {
      const response = await fetch(`${this.baseUrl}/issue/${issueKey}/attachments`, {
        method: 'POST',
        headers: {
          ...headers,
          'X-Atlassian-Token': 'no-check'
        },
        body: formData as any
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return { success: false, error: data.message || 'Failed to upload attachment' };
      }

      return { success: true, data };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async getProjects(): Promise<JiraApiResponse<any[]>> {
    return this.request<any[]>('GET', '/project');
  }

  async getIssueTypes(projectKey: string): Promise<JiraApiResponse<any[]>> {
    return this.request<any[]>('GET', `/project/${projectKey}/statuses`);
  }

  async getCurrentUser(): Promise<JiraApiResponse<any>> {
    return this.request<any>('GET', '/myself');
  }
}