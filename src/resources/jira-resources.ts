import { JiraClient } from '../utils/jira-client.js';
import { Config } from '../utils/config.js';

interface ResourceDefinition {
  description: string;
  handler: (params: Record<string, any>) => Promise<any>;
}

export function createJiraResources(client: JiraClient, _config: Config): Record<string, ResourceDefinition> {
  return {
    'jira://projects': {
      description: 'List all accessible Jira projects',
      handler: async () => {
        const result = await client.getProjects();
        
        if (!result.success || !result.data) {
          return {
            contents: [{
              uri: 'jira://projects',
              mimeType: 'text/plain',
              text: `Failed to fetch projects: ${result.error}`
            }]
          };
        }

        const projects = result.data.map((p: any) => ({
          key: p.key,
          name: p.name,
          type: p.projectTypeKey,
          lead: p.lead?.displayName
        }));

        return {
          contents: [{
            uri: 'jira://projects',
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2)
          }]
        };
      }
    },

    'jira://project/{projectKey}': {
      description: 'Get details of a specific project',
      handler: async ({ projectKey }: { projectKey?: string }) => {
        const result = await client.getProjects();
        
        if (!result.success || !result.data) {
          return {
            contents: [{
              uri: `jira://project/${projectKey}`,
              mimeType: 'text/plain',
              text: `Failed to fetch project: ${result.error}`
            }]
          };
        }

        const project = result.data.find((p: any) => p.key === projectKey);
        
        if (!project) {
          return {
            contents: [{
              uri: `jira://project/${projectKey}`,
              mimeType: 'text/plain',
              text: `Project ${projectKey} not found`
            }]
          };
        }

        return {
          contents: [{
            uri: `jira://project/${projectKey}`,
            mimeType: 'application/json',
            text: JSON.stringify(project, null, 2)
          }]
        };
      }
    },

    'jira://issue/{issueKey}': {
      description: 'Get details of a specific issue',
      handler: async ({ issueKey }: { issueKey?: string }) => {
        const result = await client.getIssue(issueKey as string);
        
        if (!result.success || !result.data) {
          return {
            contents: [{
              uri: `jira://issue/${issueKey}`,
              mimeType: 'text/plain',
              text: `Failed to fetch issue: ${result.error}`
            }]
          };
        }

        return {
          contents: [{
            uri: `jira://issue/${issueKey}`,
            mimeType: 'application/json',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }
    },

    'jira://myself': {
      description: 'Get current user information',
      handler: async () => {
        const result = await client.getCurrentUser();
        
        if (!result.success || !result.data) {
          return {
            contents: [{
              uri: 'jira://myself',
              mimeType: 'text/plain',
              text: `Failed to fetch user info: ${result.error}`
            }]
          };
        }

        return {
          contents: [{
            uri: 'jira://myself',
            mimeType: 'application/json',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }
    },

    'jira://search': {
      description: 'Search issues with JQL',
      handler: async ({ jql = 'ORDER BY created DESC' }) => {
        const result = await client.searchIssues(jql as string, 50);
        
        if (!result.success || !result.data) {
          return {
            contents: [{
              uri: 'jira://search',
              mimeType: 'text/plain',
              text: `Failed to search issues: ${result.error}`
            }]
          };
        }

        return {
          contents: [{
            uri: 'jira://search',
            mimeType: 'application/json',
            text: JSON.stringify(result.data, null, 2)
          }]
        };
      }
    }
  };
}