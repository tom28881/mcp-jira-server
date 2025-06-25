import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { JiraClient } from '../utils/jira-client.js';
import { JiraFormatter } from '../utils/formatter.js';
import { Config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { textToADF } from '../utils/adf-converter.js';

const logger = createLogger('IssueTools');

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
        try {
          const params = CreateIssueSchema.parse(args);
          logger.debug('Creating issue with params', params);
          
          const projectKey = params.project || config.defaultProject;
          if (!projectKey) {
            logger.warn('No project key provided');
            return {
              content: [{
                type: 'text',
                text: '❌ Project key is required. Please specify a project or set JIRA_DEFAULT_PROJECT'
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
          payload.fields.description = textToADF(params.description);
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
          // Some Jira instances expect ADF for acceptance criteria
          try {
            payload.fields[customFields.acceptanceCriteria] = textToADF(params.acceptanceCriteria);
          } catch {
            // Fall back to plain text if ADF fails
            payload.fields[customFields.acceptanceCriteria] = params.acceptanceCriteria;
          }
        }

        if (params.epicLink && customFields.epicLink) {
          payload.fields[customFields.epicLink] = params.epicLink;
        }

        logger.debug('Sending create issue request', { projectKey });
        const result = await client.createIssue(payload);

        if (!result.success || !result.data) {
          logger.error('Failed to create issue', { error: result.error });
          return {
            content: [{
              type: 'text',
              text: `❌ Failed to create issue: ${result.error || 'Unknown error'}`
            }]
          };
        }

        // Validate response structure
        if (!result.data.key) {
          logger.error('Invalid Jira response - missing key', result.data);
          return {
            content: [{
              type: 'text',
              text: `❌ Invalid response from Jira - missing issue key`
            }]
          };
        }

        const issueKey = result.data.key;
        const summary = result.data.fields?.summary || params.summary;
        
        logger.info('Issue created successfully', { issueKey, summary });
        
        let response = `✅ Created issue ${issueKey}: ${summary}\n`;
        response += `🔗 ${JiraFormatter.formatIssueLink(issueKey, config.jiraHost)}`;

        if ((params.createTestTicket ?? config.autoCreateTestTickets) && params.issueType === 'Story') {
          try {
            logger.info('Creating test ticket for story', { storyKey: issueKey });
            
            const testPayload: any = {
              fields: {
                project: { key: projectKey },
                issuetype: { name: 'Test' },
                summary: `Test: ${params.summary}`,
                description: textToADF(`Test ticket for ${issueKey}\n\nThis test ticket was automatically created for story ${issueKey}.`)
              }
            };

            const testResult = await client.createIssue(testPayload);
            
            if (testResult.success && testResult.data?.key) {
              const testKey = testResult.data.key;
              logger.info('Test ticket created', { testKey, storyKey: issueKey });
              response += `\n✅ Created test ticket ${testKey}`;
              
              // Try to link the tickets
              try {
                const linkResult = await client.linkIssues(
                  issueKey,
                  testKey,
                  'Test Case Linking'
                );
                
                if (linkResult.success) {
                  logger.info('Test ticket linked to story', { testKey, storyKey: issueKey });
                  response += '\n🔗 Linked test ticket to story';
                } else {
                  logger.warn('Failed to link test ticket', { error: linkResult.error });
                  response += `\n⚠️  Test ticket created but linking failed: ${linkResult.error}`;
                }
              } catch (linkError) {
                logger.error('Error linking test ticket', linkError);
                response += '\n⚠️  Test ticket created but linking failed';
              }
            } else {
              logger.warn('Failed to create test ticket', { error: testResult.error });
              response += `\n⚠️  Failed to create test ticket: ${testResult.error}`;
            }
          } catch (testError) {
            logger.error('Error in test ticket creation', testError);
            response += '\n⚠️  Failed to create test ticket';
          }
        }

        return {
          content: [{
            type: 'text',
            text: response
          }]
        };
        } catch (error) {
          logger.error('Error in create-issue handler', error);
          
          if (error instanceof z.ZodError) {
            const issues = error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`).join('\n');
            return {
              content: [{
                type: 'text',
                text: `❌ Invalid parameters:\n${issues}`
              }]
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
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
          payload.fields.description = textToADF(params.description);
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
          // Some Jira instances expect ADF for acceptance criteria
          try {
            payload.fields[customFields.acceptanceCriteria] = textToADF(params.acceptanceCriteria);
          } catch {
            // Fall back to plain text if ADF fails
            payload.fields[customFields.acceptanceCriteria] = params.acceptanceCriteria;
          }
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
        try {
          const params = TransitionIssueSchema.parse(args);
          logger.debug('Transitioning issue', params);
          
          // First, get available transitions
          logger.info('Getting transitions for issue', { issueKey: params.issueKey });
          const transitionsResult = await client.getTransitions(params.issueKey);
          
          if (!transitionsResult.success || !transitionsResult.data) {
            logger.error('Failed to get transitions', { error: transitionsResult.error });
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to get transitions: ${transitionsResult.error}`
              }]
            };
          }

          // Check if we have transitions array
          if (!transitionsResult.data.transitions || !Array.isArray(transitionsResult.data.transitions)) {
            logger.error('Invalid transitions response', transitionsResult.data);
            return {
              content: [{
                type: 'text',
                text: `❌ Invalid transitions response from Jira`
              }]
            };
          }

          const transitions = transitionsResult.data.transitions;
          logger.debug('Available transitions', { 
            count: transitions.length,
            transitions: transitions.map(t => ({ id: t.id, name: t.name }))
          });

          // Find matching transition (case-insensitive)
          const transition = transitions.find(
            t => t.name.toLowerCase() === params.transitionName.toLowerCase()
          );

          if (!transition) {
            const available = transitions.map(t => t.name).join(', ');
            logger.warn('Transition not found', { 
              requested: params.transitionName, 
              available: transitions.map(t => t.name) 
            });
            return {
              content: [{
                type: 'text',
                text: `❌ Transition "${params.transitionName}" not found.\nAvailable transitions: ${available || 'None'}`
              }]
            };
          }

          // Perform the transition
          logger.info('Performing transition', { 
            issueKey: params.issueKey, 
            transitionId: transition.id, 
            transitionName: transition.name 
          });
          
          const result = await client.transitionIssue(params.issueKey, transition.id);

          if (!result.success) {
            logger.error('Failed to transition issue', { error: result.error });
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to transition issue: ${result.error}`
              }]
            };
          }

          logger.info('Issue transitioned successfully', { 
            issueKey: params.issueKey, 
            newStatus: transition.name 
          });
          
          return {
            content: [{
              type: 'text',
              text: `✅ Transitioned ${params.issueKey} to "${transition.name}"`
            }]
          };
        } catch (error) {
          logger.error('Error in transition-issue handler', error);
          
          if (error instanceof z.ZodError) {
            return {
              content: [{
                type: 'text',
                text: `❌ Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`
              }]
            };
          }
          
          return {
            content: [{
              type: 'text',
              text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
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