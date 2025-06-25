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

const GetFieldsSchema = z.object({
  project: z.string().describe('Project key'),
  issueType: z.string().optional().describe('Issue type name')
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
        try {
          const params = LinkIssuesSchema.parse(args);
          logger.debug('Linking issues', params);
          
          // First, try to link with the provided link type
          let result = await client.linkIssues(
            params.inwardIssue,
            params.outwardIssue,
            params.linkType
          );

          // If it fails due to link type not found, try to get available types and match
          if (!result.success && result.error?.includes('typ odkazu')) {
            logger.info('Link type not found, fetching available types');
            
            const linkTypesResult = await client.getLinkTypes();
            if (linkTypesResult.success && linkTypesResult.data) {
              logger.debug('Available link types', { 
                count: linkTypesResult.data.length,
                types: linkTypesResult.data.map((lt: any) => ({ 
                  name: lt.name, 
                  inward: lt.inward, 
                  outward: lt.outward 
                }))
              });
              
              // Try to find matching link type (case-insensitive)
              const requestedType = params.linkType.toLowerCase();
              const matchingType = linkTypesResult.data.find((lt: any) => {
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
                const availableTypes = linkTypesResult.data
                  .map((lt: any) => `"${lt.name}" (${lt.inward}/${lt.outward})`)
                  .join(', ');
                  
                return {
                  content: [{
                    type: 'text',
                    text: `❌ Link type "${params.linkType}" not found.\nAvailable types: ${availableTypes}`
                  }]
                };
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
          
          const linkTypes = result.data;
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
    }
  };
}