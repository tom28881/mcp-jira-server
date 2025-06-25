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
  issueType: z.string().describe('Type of issue (e.g., "Bug", "Task", "Story", "Epic", "Subtask", "Úkol", "Dílčí úkol")'),
  assignee: z.string().optional().describe('Email or account ID of assignee'),
  priority: z.string().optional().describe('Priority (e.g., "Highest", "High", "Medium", "Low", "Lowest", or localized names)'),
  labels: z.array(z.string()).optional().describe('Labels to add to the issue'),
  components: z.array(z.string()).optional().describe('Component names'),
  storyPoints: z.number().optional().describe('Story points estimation'),
  acceptanceCriteria: z.string().optional().describe('Acceptance criteria for stories'),
  epicLink: z.string().optional().describe('Epic issue key to link to (for Story/Task)'),
  parent: z.string().optional().describe('Parent issue key (required for Subtask)'),
  createTestTicket: z.boolean().optional().describe('Auto-create linked test ticket for stories')
});

const UpdateIssueSchema = z.object({
  issueKey: z.string().describe('Issue key (e.g., "PROJ-123")'),
  summary: z.string().optional(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.string().optional().describe('Priority name (can be localized)'),
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

const GetFieldsSchema = z.object({
  project: z.string().describe('Project key'),
  issueType: z.string().optional().describe('Issue type name')
});

const DiagnoseFieldsSchema = z.object({
  project: z.string().describe('Project key'),
  issueType: z.string().describe('Issue type name')
});

const CreateTaskForEpicSchema = z.object({
  project: z.string().describe('Project key'),
  epicKey: z.string().describe('Epic issue key to link to'),
  summary: z.string().describe('Task summary'),
  description: z.string().optional().describe('Task description'),
  issueType: z.string().optional().default('Úkol').describe('Issue type (defaults to "Úkol" for Czech Jira)')
});

const CreateEpicWithSubtasksSchema = z.object({
  project: z.string().describe('Project key'),
  epicSummary: z.string().describe('Epic summary'),
  epicDescription: z.string().optional().describe('Epic description'),
  subtasks: z.array(z.object({
    summary: z.string().describe('Subtask summary'),
    description: z.string().optional().describe('Subtask description'),
    assignee: z.string().optional().describe('Assignee email or account ID')
  })).describe('Array of subtasks to create')
});

interface ToolDefinition {
  description: string;
  inputSchema: any;
  handler: (args: unknown) => Promise<any>;
}

// Common issue type mappings for different languages
const issueTypeMap: Record<string, string[]> = {
  'Epic': ['Epic', 'Epik', 'Epika'],
  'Story': ['Story', 'User Story', 'Příběh', 'Uživatelský příběh'],
  'Task': ['Task', 'Úkol'],
  'Bug': ['Bug', 'Chyba', 'Defekt'],
  'Subtask': ['Subtask', 'Sub-task', 'Dílčí úkol', 'Podúkol']
};

// Helper to detect issue type from localized name
function normalizeIssueType(localizedType: string): string {
  const normalized = localizedType.toLowerCase();
  for (const [standard, variants] of Object.entries(issueTypeMap)) {
    if (variants.some(v => v.toLowerCase() === normalized)) {
      return standard;
    }
  }
  return localizedType; // Return as-is if no mapping found
}

export function createIssueTools(client: JiraClient, config: Config): Record<string, ToolDefinition> {
  // For now, use configured fields - auto-detection can be added in future version
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
          // Some issue types (like Epic) might not support labels
          payload.fields.labels = params.labels;
          logger.debug('Adding labels to issue', { labels: params.labels });
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
          logger.debug('Adding epic link', { 
            epicLink: params.epicLink, 
            fieldId: customFields.epicLink 
          });
        } else if (params.epicLink && !customFields.epicLink) {
          logger.warn('Epic link requested but no epic link field configured', {
            epicLink: params.epicLink
          });
        }
        
        // Handle parent field for subtasks
        if (params.parent) {
          payload.fields.parent = { key: params.parent };
          logger.debug('Adding parent field for subtask', { parent: params.parent });
        }

        // Log full payload for debugging
        logger.debug('Create issue payload', { 
          payload,
          hasLabels: !!params.labels,
          hasAcceptanceCriteria: !!params.acceptanceCriteria,
          customFields: Object.keys(payload.fields).filter(k => k.startsWith('customfield_'))
        });
        
        const result = await client.createIssue(payload);

        if (!result.success || !result.data) {
          logger.error('Failed to create issue', { 
            error: result.error,
            payload: payload,
            epicLinkField: customFields.epicLink,
            hasEpicLink: !!params.epicLink
          });
          
          // Check if it's an epic link field issue
          if (params.epicLink && result.error?.includes('customfield_')) {
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to create issue: ${result.error}\n\n💡 This might be due to incorrect Epic Link field ID.\nRun diagnose-fields to find the correct field ID for your Jira instance.`
              }]
            };
          }
          
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

        if ((params.createTestTicket ?? config.autoCreateTestTickets) && normalizeIssueType(params.issueType) === 'Story') {
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
        try {
          const params = LinkIssuesSchema.parse(args);
          logger.debug('Linking issues', params);
          
          // First, try to link with the provided link type
          let result = await client.linkIssues(
            params.inwardIssue,
            params.outwardIssue,
            params.linkType
          );

          // Check if this is an Epic-Story link attempt
          if (!result.success && (
            params.linkType.toLowerCase().includes('epic') || 
            result.error?.includes('systémového propojení') ||
            result.error?.includes('system link type')
          )) {
            logger.info('Epic-Story link detected, providing guidance');
            return {
              content: [{
                type: 'text',
                text: `❌ Epic-Story relationships cannot be created using link-issues.\n\nTo link a Story to an Epic:\n1. Update the story with epicLink field\n2. Or create the story with epicLink parameter\n\nExample: update-issue PROJ-123 with epicLink: "PROJ-100"`
              }]
            };
          }
          
          // If it fails due to link type not found, try to get available types and match
          if (!result.success && (result.error?.includes('typ odkazu') || result.error?.includes('link type'))) {
            logger.info('Link type not found, fetching available types');
            
            const linkTypesResult = await client.getLinkTypes();
            if (linkTypesResult.success && linkTypesResult.data) {
              // Check if linkTypesResult.data is an array or has issueLinkTypes property
              const linkTypes = Array.isArray(linkTypesResult.data) 
                ? linkTypesResult.data 
                : (linkTypesResult.data as any).issueLinkTypes || [];
              
              if (Array.isArray(linkTypes) && linkTypes.length > 0) {
                logger.debug('Available link types', { 
                  count: linkTypes.length,
                  types: linkTypes.map((lt: any) => ({ 
                    name: lt.name, 
                    inward: lt.inward, 
                    outward: lt.outward 
                  }))
                });
                
                // Try to find matching link type (case-insensitive)
                const requestedType = params.linkType.toLowerCase();
                const matchingType = linkTypes.find((lt: any) => {
                  return lt.name?.toLowerCase() === requestedType ||
                         lt.inward?.toLowerCase() === requestedType ||
                         lt.outward?.toLowerCase() === requestedType;
                });
                
                if (matchingType) {
                  logger.info('Found matching link type', { 
                    requested: params.linkType, 
                    matched: matchingType.name 
                  });
                  
                  // Retry with the correct name
                  result = await client.linkIssues(
                    params.inwardIssue,
                    params.outwardIssue,
                    matchingType.name
                  );
                } else {
                  // Provide helpful error with available types
                  const availableTypes = linkTypes
                    .map((lt: any) => `"${lt.name}" (${lt.inward}/${lt.outward})`)
                    .join(', ');
                    
                  return {
                    content: [{
                      type: 'text',
                      text: `❌ Link type "${params.linkType}" not found.\nAvailable types: ${availableTypes}`
                    }]
                  };
                }
              } else {
                logger.warn('No link types found or invalid response structure', linkTypesResult.data);
              }
            }
          }

          if (!result.success) {
            logger.error('Failed to link issues', { error: result.error });
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to link issues: ${result.error}`
              }]
            };
          }

          logger.info('Issues linked successfully', { 
            inward: params.inwardIssue, 
            outward: params.outwardIssue, 
            linkType: params.linkType 
          });
          
          return {
            content: [{
              type: 'text',
              text: `✅ Linked ${params.inwardIssue} to ${params.outwardIssue} with "${params.linkType}"`
            }]
          };
        } catch (error) {
          logger.error('Error in link-issues handler', error);
          
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

    'get-link-types': {
      description: 'Get available issue link types',
      inputSchema: zodToJsonSchema(z.object({})) as any,
      handler: async () => {
        try {
          logger.info('Getting issue link types');
          const result = await client.getLinkTypes();
          
          if (!result.success || !result.data) {
            logger.error('Failed to get link types', { error: result.error });
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to get link types: ${result.error || 'Unknown error'}`
              }]
            };
          }
          
          // Handle different response structures from Jira API
          const linkTypes = Array.isArray(result.data) 
            ? result.data 
            : ((result.data as any).issueLinkTypes || []);
          logger.debug('Retrieved link types', { count: linkTypes.length });
          
          // Format the response
          const formatted = linkTypes.map((lt: any) => {
            return `• **${lt.name}**\n  - Inward: "${lt.inward}" (e.g., ${lt.inward} ${lt.name})\n  - Outward: "${lt.outward}" (e.g., ${lt.outward} ${lt.name})`;
          }).join('\n\n');
          
          return {
            content: [{
              type: 'text',
              text: `🔗 Available Link Types:\n\n${formatted}`
            }]
          };
        } catch (error) {
          logger.error('Error in get-link-types handler', error);
          return {
            content: [{
              type: 'text',
              text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
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
    },

    'create-epic-with-subtasks': {
      description: 'Create an epic with subtasks in one operation',
      inputSchema: zodToJsonSchema(CreateEpicWithSubtasksSchema) as any,
      handler: async (args: unknown) => {
        try {
          const params = CreateEpicWithSubtasksSchema.parse(args);
          logger.info('Creating epic with subtasks', { 
            project: params.project, 
            subtaskCount: params.subtasks.length 
          });
          
          // Step 1: Create the epic
          const epicPayload: any = {
            fields: {
              project: { key: params.project },
              issuetype: { name: 'Epic' }, // Will be handled by Jira API
              summary: params.epicSummary
            }
          };
          
          if (params.epicDescription) {
            epicPayload.fields.description = textToADF(params.epicDescription);
          }
          
          logger.debug('Creating epic', epicPayload);
          const epicResult = await client.createIssue(epicPayload);
          
          if (!epicResult.success || !epicResult.data?.key) {
            logger.error('Failed to create epic', { error: epicResult.error });
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to create epic: ${epicResult.error || 'Unknown error'}`
              }]
            };
          }
          
          const epicKey = epicResult.data.key;
          logger.info('Epic created successfully', { epicKey });
          
          let response = `✅ Created epic ${epicKey}: ${params.epicSummary}\n`;
          response += `🔗 ${JiraFormatter.formatIssueLink(epicKey, config.jiraHost)}\n\n`;
          
          // Step 2: Create subtasks
          const subtaskResults: string[] = [];
          const failedSubtasks: string[] = [];
          
          for (const subtask of params.subtasks) {
            try {
              const subtaskPayload: any = {
                fields: {
                  project: { key: params.project },
                  issuetype: { name: 'Dílčí úkol' }, // Czech name for Subtask
                  summary: subtask.summary,
                  parent: { key: epicKey }  // Link subtask to epic as parent
                }
              };
              
              if (subtask.description) {
                subtaskPayload.fields.description = textToADF(subtask.description);
              }
              
              if (subtask.assignee) {
                subtaskPayload.fields.assignee = { accountId: subtask.assignee };
              }
              
              logger.debug('Creating subtask', subtaskPayload);
              const subtaskResult = await client.createIssue(subtaskPayload);
              
              if (subtaskResult.success && subtaskResult.data?.key) {
                const subtaskKey = subtaskResult.data.key;
                logger.info('Subtask created', { subtaskKey, epicKey });
                subtaskResults.push(`✅ ${subtaskKey}: ${subtask.summary}`);
              } else {
                logger.error('Failed to create subtask', { 
                  summary: subtask.summary, 
                  error: subtaskResult.error 
                });
                failedSubtasks.push(`❌ "${subtask.summary}": ${subtaskResult.error || 'Unknown error'}`);
              }
            } catch (error) {
              logger.error('Error creating subtask', { summary: subtask.summary, error });
              failedSubtasks.push(`❌ "${subtask.summary}": ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
          
          // Step 3: Create tasks if subtasks failed (fallback)
          const createdTasks: string[] = [];
          if (failedSubtasks.length > 0) {
            logger.info('Some subtasks failed, creating tasks as fallback');
            response += `⚠️ Some subtasks failed (Jira might not support subtasks under epics). Creating tasks instead:\n\n`;
            
            for (const subtask of params.subtasks) {
              try {
                const storyPayload: any = {
                  fields: {
                    project: { key: params.project },
                    issuetype: { name: 'Úkol' }, // Use Task for Czech Jira
                    summary: subtask.summary
                  }
                };
                
                if (subtask.description) {
                  storyPayload.fields.description = textToADF(subtask.description);
                }
                
                if (subtask.assignee) {
                  storyPayload.fields.assignee = { accountId: subtask.assignee };
                }
                
                // Link story to epic using epic link field
                if (customFields.epicLink) {
                  storyPayload.fields[customFields.epicLink] = epicKey;
                }
                
                const storyResult = await client.createIssue(storyPayload);
                
                if (storyResult.success && storyResult.data?.key) {
                  const taskKey = storyResult.data.key;
                  logger.info('Task created and linked to epic', { taskKey, epicKey });
                  createdTasks.push(`✅ ${taskKey}: ${subtask.summary} (linked to epic)`);
                }
              } catch (error) {
                logger.error('Error creating task', { summary: subtask.summary, error });
              }
            }
          }
          
          // Format response
          if (subtaskResults.length > 0) {
            response += `Subtasks created:\n${subtaskResults.join('\n')}\n`;
          }
          
          if (createdTasks.length > 0) {
            response += `\nTasks created:\n${createdTasks.join('\n')}\n`;
          }
          
          if (failedSubtasks.length > 0 && createdTasks.length === 0) {
            response += `\nFailed:\n${failedSubtasks.join('\n')}\n`;
            response += `\n💡 Tip: Jira might not support subtasks under epics. Try creating tasks instead and link them using the epicLink field.`;
          }
          
          return {
            content: [{
              type: 'text',
              text: response
            }]
          };
        } catch (error) {
          logger.error('Error in create-epic-with-subtasks handler', error);
          
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

    'get-fields': {
      description: 'Get available fields for a project and issue type',
      inputSchema: zodToJsonSchema(GetFieldsSchema) as any,
      handler: async (args: unknown) => {
        try {
          const params = GetFieldsSchema.parse(args);
          logger.info('Getting available fields', params);
          
          const result = await client.getCreateMeta(params.project);
          
          if (!result.success || !result.data) {
            logger.error('Failed to get create metadata', { error: result.error });
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to get fields: ${result.error || 'Unknown error'}`
              }]
            };
          }
          
          const project = result.data.projects?.[0];
          if (!project) {
            return {
              content: [{
                type: 'text',
                text: `❌ Project ${params.project} not found`
              }]
            };
          }
          
          let issueType;
          if (params.issueType) {
            issueType = project.issuetypes?.find((it: any) => 
              it.name.toLowerCase() === params.issueType?.toLowerCase()
            );
            if (!issueType) {
              const available = project.issuetypes?.map((it: any) => it.name).join(', ') || 'None';
              return {
                content: [{
                  type: 'text',
                  text: `❌ Issue type "${params.issueType}" not found.\nAvailable types: ${available}`
                }]
              };
            }
          } else {
            // List all issue types
            const types = project.issuetypes?.map((it: any) => {
              const fieldCount = Object.keys(it.fields || {}).length;
              return `• **${it.name}** (${fieldCount} fields)`;
            }).join('\n');
            
            return {
              content: [{
                type: 'text',
                text: `📄 Issue types for ${params.project}:\n\n${types}\n\nUse get-fields with issueType parameter to see fields for a specific type.`
              }]
            };
          }
          
          // Format fields for the issue type
          const fields = issueType.fields || {};
          const requiredFields: string[] = [];
          const optionalFields: string[] = [];
          const customFields: string[] = [];
          
          Object.entries(fields).forEach(([key, field]: [string, any]) => {
            const fieldInfo = `**${field.name}** (${key})`;
            
            if (field.required) {
              requiredFields.push(fieldInfo);
            } else if (key.startsWith('customfield_')) {
              customFields.push(fieldInfo);
            } else {
              optionalFields.push(fieldInfo);
            }
          });
          
          let formatted = `📄 Fields for ${params.project} - ${issueType.name}:\n\n`;
          
          if (requiredFields.length > 0) {
            formatted += `**Required Fields:**\n${requiredFields.map(f => `• ${f}`).join('\n')}\n\n`;
          }
          
          if (optionalFields.length > 0) {
            formatted += `**Optional Fields:**\n${optionalFields.map(f => `• ${f}`).join('\n')}\n\n`;
          }
          
          if (customFields.length > 0) {
            formatted += `**Custom Fields:**\n${customFields.map(f => `• ${f}`).join('\n')}`;
          }
          
          return {
            content: [{
              type: 'text',
              text: formatted
            }]
          };
        } catch (error) {
          logger.error('Error in get-fields handler', error);
          return {
            content: [{
              type: 'text',
              text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    },

    'diagnose-fields': {
      description: 'Diagnose field issues and find correct custom field IDs',
      inputSchema: zodToJsonSchema(DiagnoseFieldsSchema) as any,
      handler: async (args: unknown) => {
        try {
          const params = DiagnoseFieldsSchema.parse(args);
          logger.info('Diagnosing fields', params);
          
          const result = await client.getCreateMeta(params.project);
          
          if (!result.success || !result.data) {
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to get field metadata: ${result.error || 'Unknown error'}`
              }]
            };
          }
          
          const project = result.data.projects?.[0];
          if (!project) {
            return {
              content: [{
                type: 'text',
                text: `❌ Project ${params.project} not found`
              }]
            };
          }
          
          const issueType = project.issuetypes?.find((it: any) => 
            it.name.toLowerCase() === params.issueType.toLowerCase()
          );
          
          if (!issueType) {
            return {
              content: [{
                type: 'text',
                text: `❌ Issue type "${params.issueType}" not found`
              }]
            };
          }
          
          const fields = issueType.fields || {};
          let epicLinkField: any = null;
          let parentField: any = null;
          let storyPointsField: any = null;
          let acceptanceCriteriaField: any = null;
          const customFields: any[] = [];
          
          Object.entries(fields).forEach(([key, field]: [string, any]) => {
            if (key.startsWith('customfield_')) {
              customFields.push({
                id: key,
                name: field.name,
                required: field.required,
                schema: field.schema
              });
              
              // Try to identify Epic Link field
              const fieldName = field.name?.toLowerCase() || '';
              if (fieldName.includes('epic link') || 
                  fieldName.includes('epic name') ||
                  fieldName.includes('parent epic') ||
                  fieldName.includes('parent')) {
                epicLinkField = { id: key, name: field.name };
              }
              
              // Try to identify Story Points field
              if (fieldName.includes('story point')) {
                storyPointsField = { id: key, name: field.name };
              }
              
              // Try to identify Acceptance Criteria field
              if (fieldName.includes('acceptance criteria')) {
                acceptanceCriteriaField = { id: key, name: field.name };
              }
            } else if (key === 'parent') {
              parentField = { id: key, name: field.name };
            }
          });
          
          let response = `🔍 Field Diagnosis for ${params.project} - ${params.issueType}:\n\n`;
          
          response += `**Standard Fields:**\n`;
          if (parentField) {
            response += `✅ Parent field found: "${parentField.name}" (${parentField.id})\n`;
          } else {
            response += `❌ Parent field not found\n`;
          }
          
          response += `\n**Custom Fields Found:**\n`;
          if (epicLinkField) {
            response += `✅ Epic Link field: "${epicLinkField.name}" (${epicLinkField.id})\n`;
            response += `   Current config: ${config.fieldEpicLink || 'not set'}\n`;
            if (epicLinkField.id !== config.fieldEpicLink) {
              response += `   ⚠️  Update .env: JIRA_FIELD_EPIC_LINK=${epicLinkField.id}\n`;
            }
          } else {
            response += `❌ Epic Link field not found\n`;
          }
          
          if (storyPointsField) {
            response += `✅ Story Points field: "${storyPointsField.name}" (${storyPointsField.id})\n`;
          }
          
          if (acceptanceCriteriaField) {
            response += `✅ Acceptance Criteria field: "${acceptanceCriteriaField.name}" (${acceptanceCriteriaField.id})\n`;
          }
          
          response += `\n**All Custom Fields (${customFields.length}):**\n`;
          customFields.forEach((field: any) => {
            response += `• ${field.name} (${field.id})${field.required ? ' [REQUIRED]' : ''}\n`;
          });
          
          response += `\n**Recommendations:**\n`;
          if (epicLinkField && epicLinkField.id !== config.fieldEpicLink) {
            response += `1. Update your .env file with: JIRA_FIELD_EPIC_LINK=${epicLinkField.id}\n`;
          }
          if (!epicLinkField && params.issueType.toLowerCase() !== 'epic') {
            response += `1. Epic Link field not found. Stories might not be linkable to epics.\n`;
            response += `   Check the custom fields list above for the correct field.\n`;
          }
          response += `2. Restart the MCP server after updating .env\n`;
          
          return {
            content: [{
              type: 'text',
              text: response
            }]
          };
        } catch (error) {
          logger.error('Error in diagnose-fields handler', error);
          return {
            content: [{
              type: 'text',
              text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }]
          };
        }
      }
    },

    'create-task-for-epic': {
      description: 'Create a task linked to an epic (optimized for Czech Jira)',
      inputSchema: zodToJsonSchema(CreateTaskForEpicSchema) as any,
      handler: async (args: unknown) => {
        try {
          const params = CreateTaskForEpicSchema.parse(args);
          logger.info('Creating task for epic', { 
            project: params.project, 
            epicKey: params.epicKey,
            issueType: params.issueType
          });
          
          const payload: any = {
            fields: {
              project: { key: params.project },
              issuetype: { name: params.issueType || 'Úkol' },
              summary: params.summary
            }
          };
          
          if (params.description) {
            payload.fields.description = textToADF(params.description);
          }
          
          // Try to add epic link if configured
          if (customFields.epicLink) {
            payload.fields[customFields.epicLink] = params.epicKey;
            logger.debug('Adding epic link', { 
              epicKey: params.epicKey, 
              fieldId: customFields.epicLink 
            });
          } else {
            logger.warn('No epic link field configured, task will be created without epic link');
          }
          
          logger.debug('Create task payload', { payload });
          
          const result = await client.createIssue(payload);
          
          if (!result.success || !result.data?.key) {
            logger.error('Failed to create task', { 
              error: result.error,
              payload: payload 
            });
            
            // If it failed with epic link, try without it
            if (customFields.epicLink && result.error?.includes('customfield')) {
              logger.info('Retrying without epic link');
              delete payload.fields[customFields.epicLink];
              
              const retryResult = await client.createIssue(payload);
              if (retryResult.success && retryResult.data?.key) {
                const taskKey = retryResult.data.key;
                return {
                  content: [{
                    type: 'text',
                    text: `✅ Created task ${taskKey}: ${params.summary}\n⚠️  Could not link to epic (field configuration issue)\n🔗 ${JiraFormatter.formatIssueLink(taskKey, config.jiraHost)}`
                  }]
                };
              }
            }
            
            return {
              content: [{
                type: 'text',
                text: `❌ Failed to create task: ${result.error || 'Unknown error'}\n\n💡 Run diagnose-fields to check your epic link field configuration.`
              }]
            };
          }
          
          const taskKey = result.data.key;
          logger.info('Task created successfully', { taskKey, epicKey: params.epicKey });
          
          return {
            content: [{
              type: 'text',
              text: `✅ Created task ${taskKey}: ${params.summary}\n🔗 Linked to epic: ${params.epicKey}\n🔗 ${JiraFormatter.formatIssueLink(taskKey, config.jiraHost)}`
            }]
          };
        } catch (error) {
          logger.error('Error in create-task-for-epic handler', error);
          
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
    }
  };
}