import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JiraClient } from '../utils/jira-client.js';
import { JiraFormatter } from '../utils/formatter.js';
import { Config } from '../utils/config.js';

const CreateIssueSchema = z.object({
  project: z.string().describe('Jira project key (e.g., "PROJ")'),
  summary: z.string().describe('Issue summary/title'),
  description: z.string().optional().describe('Issue description in markdown or plain text'),
  issueType: z.enum(['Bug', 'Task', 'Story', 'Epic', 'Subtask']).describe('Type of issue'),
  assignee: z.string().optional().describe('Email or account ID of assignee'),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional(),
  labels: z.array(z.string()).optional().describe('Labels to add to the issue'),
  components: z.array(z.string()).optional().describe('Component names'),
  storyPoints: z.number().optional().describe('Story points estimation'),
  acceptanceCriteria: z.string().optional().describe('Acceptance criteria for stories'),
  epicLink: z.string().optional().describe('Epic issue key to link to'),
  createTestTicket: z.boolean().optional().describe('Auto-create linked test ticket for stories')
});

const UpdateIssueSchema = z.object({
  issueKey: z.string().describe('Issue key (e.g., "PROJ-123")'),
  summary: z.string().optional(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional(),
  labels: z.array(z.string()).optional(),
  storyPoints: z.number().optional(),
  acceptanceCriteria: z.string().optional()
});

const SearchIssuesSchema = z.object({
  jql: z.string().optional().describe('JQL query (if not provided, will build from other params)'),
  project: z.string().optional().describe('Project key to search in'),
  issueType: z.string().optional().describe('Filter by issue type'),
  assignee: z.string().optional().describe('Filter by assignee (email or "currentUser")'),
  status: z.string().optional().describe('Filter by status'),
  labels: z.array(z.string()).optional().describe('Filter by labels'),
  maxResults: z.number().optional().default(20).describe('Maximum results to return')
});

const TransitionIssueSchema = z.object({
  issueKey: z.string().describe('Issue key (e.g., "PROJ-123")'),
  transitionName: z.string().describe('Name of transition (e.g., "In Progress", "Done")')
});

const LinkIssuesSchema = z.object({
  inwardIssue: z.string().describe('Issue key that will be linked from'),
  outwardIssue: z.string().describe('Issue key that will be linked to'),
  linkType: z.string().optional().default('Relates to').describe('Type of link')
});

const AddCommentSchema = z.object({
  issueKey: z.string().describe('Issue key (e.g., "PROJ-123")'),
  comment: z.string().describe('Comment text to add')
});

interface ToolDefinition {
  description: string;
  inputSchema: any;
  handler: (args: unknown) => Promise<any>;
}

export function createIssueTools(client: JiraClient, config: Config): Record<string, ToolDefinition> {
  const customFields = {
    storyPoints: config.fieldStoryPoints,
    acceptanceCriteria: config.fieldAcceptanceCriteria,
    epicLink: config.fieldEpicLink
  };

  return {
    'create-issue': {
      description: 'Create a new Jira issue',
      inputSchema: zodToJsonSchema(CreateIssueSchema) as any,
      handler: async (args: unknown) => {
        const params = CreateIssueSchema.parse(args);
        
        const projectKey = params.project || config.defaultProject;
        if (!projectKey) {
          return {
            content: [{
              type: 'text',
              text: '❌ Project key is required'
            }]
          };
        }

        const payload: any = {
          fields: {
            project: { key: projectKey },
            issuetype: { name: params.issueType },
            summary: params.summary
          }
        };

        if (params.description) {
          // Convert plain text/markdown to Atlassian Document Format
          payload.fields.description = {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: params.description
              }]
            }]
          };
        }

        if (params.assignee) {
          payload.fields.assignee = { accountId: params.assignee };
        }

        if (params.priority) {
          payload.fields.priority = { name: params.priority };
        }

        if (params.labels) {
          payload.fields.labels = params.labels;
        }

        if (params.components) {
          payload.fields.components = params.components.map(name => ({ name }));
        }

        if (params.storyPoints && customFields.storyPoints) {
          payload.fields[customFields.storyPoints] = params.storyPoints;
        }

        if (params.acceptanceCriteria && customFields.acceptanceCriteria) {
          payload.fields[customFields.acceptanceCriteria] = params.acceptanceCriteria;
        }

        if (params.epicLink && customFields.epicLink) {
          payload.fields[customFields.epicLink] = params.epicLink;
        }

        const result = await client.createIssue(payload);

        if (!result.success || !result.data) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to create issue: ${result.error}`
            }]
          };
        }

        let response = `✅ Created issue ${result.data.key}: ${result.data.fields.summary}\n`;
        response += `🔗 ${JiraFormatter.formatIssueLink(result.data.key, config.jiraHost)}`;

        if ((params.createTestTicket ?? config.autoCreateTestTickets) && params.issueType === 'Story') {
          const testPayload = {
            fields: {
              project: { key: projectKey },
              issuetype: { name: 'Test' },
              summary: `Test: ${params.summary}`,
              description: `Test ticket for ${result.data.key}`
            }
          };

          const testResult = await client.createIssue(testPayload);
          
          if (testResult.success && testResult.data) {
            response += `\n✅ Created test ticket ${testResult.data.key}`;
            
            const linkResult = await client.linkIssues(
              result.data.key,
              testResult.data.key,
              'Test Case Linking'
            );
            
            if (linkResult.success) {
              response += '\n🔗 Linked test ticket to story';
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: response
          }]
        };
      }
    },

    'update-issue': {
      description: 'Update an existing Jira issue',
      inputSchema: zodToJsonSchema(UpdateIssueSchema) as any,
      handler: async (args: unknown) => {
        const params = UpdateIssueSchema.parse(args);
        
        const payload: any = { fields: {} };

        if (params.summary) {
          payload.fields.summary = params.summary;
        }

        if (params.description) {
          // Convert plain text/markdown to Atlassian Document Format
          payload.fields.description = {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: params.description
              }]
            }]
          };
        }

        if (params.assignee) {
          payload.fields.assignee = { accountId: params.assignee };
        }

        if (params.priority) {
          payload.fields.priority = { name: params.priority };
        }

        if (params.labels) {
          payload.fields.labels = params.labels;
        }

        if (params.storyPoints && customFields.storyPoints) {
          payload.fields[customFields.storyPoints] = params.storyPoints;
        }

        if (params.acceptanceCriteria && customFields.acceptanceCriteria) {
          payload.fields[customFields.acceptanceCriteria] = params.acceptanceCriteria;
        }

        const result = await client.updateIssue(params.issueKey, payload);

        if (!result.success) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to update issue: ${result.error}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Updated issue ${params.issueKey}\n🔗 ${JiraFormatter.formatIssueLink(params.issueKey, config.jiraHost)}`
          }]
        };
      }
    },

    'get-issue': {
      description: 'Get details of a specific Jira issue',
      inputSchema: zodToJsonSchema(z.object({
        issueKey: z.string().describe('Issue key (e.g., "PROJ-123")')
      })) as any,
      handler: async (args: unknown) => {
        const { issueKey } = z.object({ issueKey: z.string() }).parse(args);
        
        const result = await client.getIssue(issueKey, ['transitions']);

        if (!result.success || !result.data) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to get issue: ${result.error}`
            }]
          };
        }

        const formatted = JiraFormatter.formatIssue(result.data);
        const link = JiraFormatter.formatIssueLink(issueKey, config.jiraHost);

        return {
          content: [{
            type: 'text',
            text: `${formatted}\n\n🔗 ${link}`
          }]
        };
      }
    },

    'search-issues': {
      description: 'Search for Jira issues using JQL or filters',
      inputSchema: zodToJsonSchema(SearchIssuesSchema) as any,
      handler: async (args: unknown) => {
        const params = SearchIssuesSchema.parse(args);
        
        let jql = params.jql || '';
        
        if (!jql) {
          const conditions: string[] = [];
          
          if (params.project) {
            conditions.push(`project = "${params.project}"`);
          }
          
          if (params.issueType) {
            conditions.push(`issuetype = "${params.issueType}"`);
          }
          
          if (params.assignee) {
            const assigneeValue = params.assignee === 'currentUser' ? 'currentUser()' : `"${params.assignee}"`;
            conditions.push(`assignee = ${assigneeValue}`);
          }
          
          if (params.status) {
            conditions.push(`status = "${params.status}"`);
          }
          
          if (params.labels && params.labels.length > 0) {
            conditions.push(`labels in (${params.labels.map(l => `"${l}"`).join(', ')})`);
          }
          
          jql = conditions.join(' AND ') || 'ORDER BY created DESC';
        }

        const result = await client.searchIssues(jql, params.maxResults);

        if (!result.success || !result.data) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to search issues: ${result.error}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: JiraFormatter.formatSearchResults(result.data)
          }]
        };
      }
    },

    'transition-issue': {
      description: 'Transition a Jira issue to a different status',
      inputSchema: zodToJsonSchema(TransitionIssueSchema) as any,
      handler: async (args: unknown) => {
        const params = TransitionIssueSchema.parse(args);
        
        const transitionsResult = await client.getTransitions(params.issueKey);
        
        if (!transitionsResult.success || !transitionsResult.data) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to get transitions: ${transitionsResult.error}`
            }]
          };
        }

        const transition = transitionsResult.data.transitions.find(
          t => t.name.toLowerCase() === params.transitionName.toLowerCase()
        );

        if (!transition) {
          const available = transitionsResult.data.transitions.map(t => t.name).join(', ');
          return {
            content: [{
              type: 'text',
              text: `❌ Transition "${params.transitionName}" not found. Available: ${available}`
            }]
          };
        }

        const result = await client.transitionIssue(params.issueKey, transition.id);

        if (!result.success) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to transition issue: ${result.error}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Transitioned ${params.issueKey} to "${params.transitionName}"`
          }]
        };
      }
    },

    'link-issues': {
      description: 'Link two Jira issues together',
      inputSchema: zodToJsonSchema(LinkIssuesSchema) as any,
      handler: async (args: unknown) => {
        const params = LinkIssuesSchema.parse(args);
        
        const result = await client.linkIssues(
          params.inwardIssue,
          params.outwardIssue,
          params.linkType
        );

        if (!result.success) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to link issues: ${result.error}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Linked ${params.inwardIssue} to ${params.outwardIssue} with "${params.linkType}"`
          }]
        };
      }
    },

    'add-comment': {
      description: 'Add a comment to a Jira issue',
      inputSchema: zodToJsonSchema(AddCommentSchema) as any,
      handler: async (args: unknown) => {
        const params = AddCommentSchema.parse(args);
        
        const result = await client.addComment(params.issueKey, params.comment);

        if (!result.success) {
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to add comment: ${result.error}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `✅ Added comment to ${params.issueKey}`
          }]
        };
      }
    }
  };
}