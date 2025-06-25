import fetch from 'node-fetch';
import { createLogger } from './logger.js';
import { retry } from './retry.js';
import type { 
  JiraIssue, 
  JiraSearchResult, 
  JiraApiResponse,
  CreateIssuePayload,
  UpdateIssuePayload,
  JiraTransition
} from '../types/jira.js';

const logger = createLogger('JiraClient');

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

    logger.info('JiraClient initialized', { host, email: email.replace(/(.{3}).*(@.*)/, '$1***$2') });
  }

  private async request<T>(
    method: string, 
    endpoint: string, 
    body?: any
  ): Promise<JiraApiResponse<T>> {
    // Handle different API bases
    let url: string;
    if (endpoint.startsWith('/rest/agile/')) {
      // Agile API
      url = `${this.baseUrl.replace('/rest/api/3', '')}${endpoint}`;
    } else if (endpoint.startsWith('/')) {
      // Regular API with full path
      url = `${this.baseUrl}${endpoint}`;
    } else {
      // Regular API endpoint
      url = `${this.baseUrl}/${endpoint}`;
    }
    
    logger.debug(`${method} ${endpoint}`, { body, url });

    try {
      const response = await retry(async () => {
        const options: any = {
          method,
          headers: this.headers
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const res = await fetch(url, options);
        
        // Log response details
        logger.debug(`Response ${res.status} ${res.statusText}`, {
          headers: Object.fromEntries(res.headers.entries()),
          url
        });

        // Check if response is successful first
        if (!res.ok) {
          // Try to parse error response
          let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
          let errorDetails: any = null;
          
          try {
            const contentType = res.headers.get('content-type');
            if (contentType?.includes('application/json')) {
              errorDetails = await res.json();
              
              if (errorDetails.errorMessages) {
                errorMessage = errorDetails.errorMessages.join(', ');
              } else if (errorDetails.errors) {
                const errors = Object.entries(errorDetails.errors)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ');
                errorMessage = errors || errorMessage;
              } else if (errorDetails.message) {
                errorMessage = errorDetails.message;
              }
            } else {
              // Try to read text response
              const text = await res.text();
              if (text) {
                errorMessage = `${errorMessage} - ${text.substring(0, 200)}`;
              }
            }
          } catch (parseError) {
            logger.warn('Failed to parse error response', parseError);
          }
          
          const error = new Error(errorMessage);
          (error as any).status = res.status;
          (error as any).details = errorDetails;
          throw error;
        }

        // For successful responses, check if there's content
        const contentType = res.headers.get('content-type');
        const contentLength = res.headers.get('content-length');
        
        // If no content or content-length is 0, return success with no data
        if (!contentType || contentLength === '0' || res.status === 204) {
          logger.debug('Empty response body');
          return { success: true, data: {} as T };
        }

        // Parse JSON response
        if (contentType?.includes('application/json')) {
          try {
            const data = await res.json();
            logger.debug('Response data', { 
              dataKeys: data ? Object.keys(data) : null,
              dataType: typeof data 
            });
            return { success: true, data: data as T };
          } catch (error) {
            logger.error('Failed to parse JSON response', error);
            // For successful response with invalid JSON, return empty object
            return { success: true, data: {} as T };
          }
        } else {
          // Non-JSON response
          const text = await res.text();
          logger.warn('Non-JSON response', { contentType, textLength: text.length });
          return { success: true, data: {} as T };
        }
      }, {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2
      });

      return response;
    } catch (error) {
      logger.error(`Request failed: ${method} ${endpoint}`, error);
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async createIssue(payload: CreateIssuePayload): Promise<JiraApiResponse<JiraIssue>> {
    logger.info('Creating issue', { 
      projectKey: payload.fields.project.key, 
      issueType: payload.fields.issuetype.name,
      hasLabels: !!payload.fields.labels,
      customFieldCount: Object.keys(payload.fields).filter(k => k.startsWith('customfield_')).length
    });
    
    // Log the full payload for debugging (mask sensitive data)
    logger.debug('Create issue payload', {
      ...payload,
      fields: {
        ...payload.fields,
        description: payload.fields.description ? '[CONTENT]' : undefined
      }
    });
    
    const result = await this.request<JiraIssue>('POST', '/issue', payload);
    
    if (result.success) {
      logger.info('Issue created successfully', { key: result.data?.key });
    } else {
      logger.error('Issue creation failed', { 
        error: result.error,
        payload: {
          project: payload.fields.project,
          issuetype: payload.fields.issuetype,
          fieldKeys: Object.keys(payload.fields)
        }
      });
    }
    
    return result;
  }

  async updateIssue(issueKey: string, payload: UpdateIssuePayload): Promise<JiraApiResponse<void>> {
    logger.info('Updating issue', { issueKey, fields: Object.keys(payload.fields || {}) });
    return this.request<void>('PUT', `/issue/${issueKey}`, payload);
  }

  async getIssue(issueKey: string, expand?: string[]): Promise<JiraApiResponse<JiraIssue>> {
    logger.info('Getting issue', { issueKey, expand });
    let endpoint = `/issue/${issueKey}`;
    if (expand && expand.length > 0) {
      endpoint += `?expand=${expand.join(',')}`;
    }
    return this.request<JiraIssue>('GET', endpoint);
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraApiResponse<JiraSearchResult>> {
    logger.info('Searching issues', { jql, maxResults });
    const params = new URLSearchParams({
      jql,
      maxResults: maxResults.toString()
    });
    return this.request<JiraSearchResult>('GET', `/search?${params}`);
  }

  async getLinkTypes(): Promise<JiraApiResponse<any[]>> {
    logger.info('Getting issue link types');
    return this.request<any[]>('GET', '/issueLinkType');
  }

  async linkIssues(inwardIssue: string, outwardIssue: string, linkType: string): Promise<JiraApiResponse<void>> {
    logger.info('Linking issues', { inwardIssue, outwardIssue, linkType });
    const payload = {
      type: { name: linkType },
      inwardIssue: { key: inwardIssue },
      outwardIssue: { key: outwardIssue }
    };
    return this.request<void>('POST', '/issueLink', payload);
  }

  async getTransitions(issueKey: string): Promise<JiraApiResponse<{ transitions: JiraTransition[] }>> {
    logger.info('Getting transitions', { issueKey });
    const result = await this.request<{ transitions: JiraTransition[] }>('GET', `/issue/${issueKey}/transitions`);
    
    if (result.success && result.data?.transitions) {
      logger.debug('Available transitions', { 
        transitions: result.data.transitions.map(t => ({ id: t.id, name: t.name }))
      });
    }
    
    return result;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<JiraApiResponse<void>> {
    logger.info('Transitioning issue', { issueKey, transitionId });
    const payload = {
      transition: { id: transitionId }
    };
    return this.request<void>('POST', `/issue/${issueKey}/transitions`, payload);
  }

  async addComment(issueKey: string, comment: string): Promise<JiraApiResponse<any>> {
    logger.info('Adding comment', { issueKey, commentLength: comment.length });
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

  async getComments(issueKey: string, maxResults: number = 50, orderBy: string = '-created'): Promise<JiraApiResponse<any>> {
    logger.info('Getting comments', { issueKey, maxResults, orderBy });
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      orderBy
    });
    return this.request<any>('GET', `/issue/${issueKey}/comment?${params}`);
  }

  async getHistory(issueKey: string, maxResults: number = 50): Promise<JiraApiResponse<any>> {
    logger.info('Getting issue history', { issueKey, maxResults });
    const params = new URLSearchParams({
      maxResults: maxResults.toString()
    });
    return this.request<any>('GET', `/issue/${issueKey}/changelog?${params}`);
  }

  async addAttachment(issueKey: string, fileName: string, fileContent: Buffer): Promise<JiraApiResponse<any>> {
    logger.info('Adding attachment', { issueKey, fileName, fileSize: fileContent.length });
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
        logger.error('Failed to upload attachment', { status: response.status, data });
        return { success: false, error: data.message || 'Failed to upload attachment' };
      }

      logger.info('Attachment uploaded successfully');
      return { success: true, data };
    } catch (error) {
      logger.error('Attachment upload error', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  async getAttachments(issueKey: string): Promise<JiraApiResponse<any[]>> {
    logger.info('Getting attachments', { issueKey });
    const result = await this.getIssue(issueKey, ['attachment']);
    
    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }
    
    const attachments = result.data.fields?.attachment || [];
    return { success: true, data: attachments };
  }

  async downloadAttachment(attachmentUrl: string): Promise<JiraApiResponse<Buffer>> {
    logger.info('Downloading attachment', { url: attachmentUrl });
    
    try {
      const response = await fetch(attachmentUrl, {
        headers: this.headers
      });

      if (!response.ok) {
        logger.error('Failed to download attachment', { status: response.status });
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      logger.info('Attachment downloaded successfully', { size: buffer.length });
      
      return { success: true, data: buffer };
    } catch (error) {
      logger.error('Attachment download error', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  // Sprint management methods
  async getBoards(): Promise<JiraApiResponse<any>> {
    logger.info('Getting boards');
    return this.request<any>('GET', '/rest/agile/1.0/board');
  }

  async getSprints(boardId: string): Promise<JiraApiResponse<any>> {
    logger.info('Getting sprints', { boardId });
    return this.request<any>('GET', `/rest/agile/1.0/board/${boardId}/sprint`);
  }

  async getSprintDetails(sprintId: string): Promise<JiraApiResponse<any>> {
    logger.info('Getting sprint details', { sprintId });
    return this.request<any>('GET', `/rest/agile/1.0/sprint/${sprintId}`);
  }

  async getSprintIssues(sprintId: string): Promise<JiraApiResponse<any>> {
    logger.info('Getting sprint issues', { sprintId });
    return this.request<any>('GET', `/rest/agile/1.0/sprint/${sprintId}/issue`);
  }

  async moveIssueToSprint(issueKey: string, sprintId: string): Promise<JiraApiResponse<void>> {
    logger.info('Moving issue to sprint', { issueKey, sprintId });
    const payload = {
      issues: [issueKey]
    };
    return this.request<void>('POST', `/rest/agile/1.0/sprint/${sprintId}/issue`, payload);
  }

  async removeIssueFromSprint(issueKey: string): Promise<JiraApiResponse<void>> {
    logger.info('Removing issue from sprint', { issueKey });
    const payload = {
      issues: [issueKey]
    };
    return this.request<void>('POST', '/rest/agile/1.0/backlog/issue', payload);
  }

  async createSprint(boardId: string, name: string, startDate?: string, endDate?: string): Promise<JiraApiResponse<any>> {
    logger.info('Creating sprint', { boardId, name, startDate, endDate });
    const payload: any = {
      name,
      originBoardId: parseInt(boardId)
    };
    
    if (startDate) {
      payload.startDate = startDate;
    }
    
    if (endDate) {
      payload.endDate = endDate;
    }
    
    return this.request<any>('POST', '/rest/agile/1.0/sprint', payload);
  }

  async startSprint(sprintId: string, startDate?: string, endDate?: string): Promise<JiraApiResponse<any>> {
    logger.info('Starting sprint', { sprintId, startDate, endDate });
    const payload: any = {
      state: 'active'
    };
    
    if (startDate) {
      payload.startDate = startDate;
    }
    
    if (endDate) {
      payload.endDate = endDate;
    }
    
    return this.request<any>('POST', `/rest/agile/1.0/sprint/${sprintId}`, payload);
  }

  async completeSprint(sprintId: string): Promise<JiraApiResponse<any>> {
    logger.info('Completing sprint', { sprintId });
    const payload = {
      state: 'closed'
    };
    return this.request<any>('POST', `/rest/agile/1.0/sprint/${sprintId}`, payload);
  }

  async getProjects(): Promise<JiraApiResponse<any[]>> {
    logger.info('Getting projects');
    return this.request<any[]>('GET', '/project');
  }

  async getIssueTypes(projectKey: string): Promise<JiraApiResponse<any[]>> {
    logger.info('Getting issue types', { projectKey });
    return this.request<any[]>('GET', `/project/${projectKey}/statuses`);
  }

  async getCreateMeta(projectKey: string, issueTypeId?: string): Promise<JiraApiResponse<any>> {
    logger.info('Getting create metadata', { projectKey, issueTypeId });
    let endpoint = `/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`;
    if (issueTypeId) {
      endpoint += `&issuetypeIds=${issueTypeId}`;
    }
    return this.request<any>('GET', endpoint);
  }

  async getCurrentUser(): Promise<JiraApiResponse<any>> {
    logger.info('Getting current user');
    return this.request<any>('GET', '/myself');
  }

  async testConnection(): Promise<boolean> {
    logger.info('Testing connection');
    const result = await this.getCurrentUser();
    
    if (result.success) {
      logger.info('Connection test successful', { 
        user: result.data?.displayName,
        accountId: result.data?.accountId 
      });
      return true;
    } else {
      logger.error('Connection test failed', { error: result.error });
      return false;
    }
  }
}