import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const StandupReportSchema = z.object({
  assignee: z.string().describe('Email or account ID of the team member'),
  days: z.number().optional().default(1).describe('Number of days to look back')
});

const SprintPlanningSchema = z.object({
  project: z.string().describe('Project key'),
  sprint: z.string().optional().describe('Sprint name or ID')
});

const BugTriageSchema = z.object({
  project: z.string().describe('Project key'),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional()
});

interface PromptDefinition {
  description: string;
  inputSchema: any;
  handler: (args: unknown) => Promise<any>;
}

export function createJiraPrompts(): Record<string, PromptDefinition> {
  return {
    'standup-report': {
      description: 'Generate a standup report for a team member',
      inputSchema: zodToJsonSchema(StandupReportSchema) as any,
      handler: async (args: unknown) => {
        const params = StandupReportSchema.parse(args);
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - params.days);
        const dateStr = yesterday.toISOString().split('T')[0];

        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a standup report for ${params.assignee} based on their Jira activity. 
                     Use the search-issues tool to find:
                     1. Issues assigned to them that were updated since ${dateStr}
                     2. Issues they created recently
                     3. Issues they transitioned
                     
                     Format the report with:
                     - Yesterday: What was completed
                     - Today: What's in progress
                     - Blockers: Any blocked issues`
            }
          }]
        };
      }
    },

    'sprint-planning': {
      description: 'Help with sprint planning activities',
      inputSchema: zodToJsonSchema(SprintPlanningSchema) as any,
      handler: async (args: unknown) => {
        const params = SprintPlanningSchema.parse(args);
        
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Help with sprint planning for project ${params.project}. 
                     1. Search for unassigned stories in the backlog
                     2. Find stories without story points
                     3. Identify stories missing acceptance criteria
                     4. List high-priority items ready for sprint
                     
                     Provide recommendations for:
                     - Which stories are ready to pull into sprint
                     - Which need more refinement
                     - Capacity planning based on story points`
            }
          }]
        };
      }
    },

    'bug-triage': {
      description: 'Help triage and prioritize bugs',
      inputSchema: zodToJsonSchema(BugTriageSchema) as any,
      handler: async (args: unknown) => {
        const params = BugTriageSchema.parse(args);
        
        const priorityFilter = params.priority ? ` AND priority = "${params.priority}"` : '';
        
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Perform bug triage for project ${params.project}:
                     1. Search for open bugs using: project = "${params.project}" AND issuetype = "Bug" AND status != "Done"${priorityFilter}
                     2. Group bugs by:
                        - Severity/Priority
                        - Component
                        - Age (how long they've been open)
                        - Assignment status
                     
                     Provide recommendations for:
                     - Which bugs need immediate attention
                     - Which can be deferred
                     - Which might be duplicates
                     - Assignment suggestions based on components`
            }
          }]
        };
      }
    },

    'release-notes': {
      description: 'Generate release notes from completed issues',
      inputSchema: zodToJsonSchema(z.object({
        project: z.string().describe('Project key'),
        version: z.string().describe('Release version'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD)')
      })) as any,
      handler: async (args: unknown) => {
        const { project, version, startDate } = z.object({
          project: z.string(),
          version: z.string(),
          startDate: z.string().optional()
        }).parse(args);
        
        const dateFilter = startDate ? ` AND resolved >= "${startDate}"` : '';
        
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Generate release notes for ${project} version ${version}:
                     1. Search for completed issues: project = "${project}" AND fixVersion = "${version}" AND status = "Done"${dateFilter}
                     2. Categorize by:
                        - New Features (Story type)
                        - Bug Fixes (Bug type)
                        - Improvements (Task type)
                        - Breaking Changes (check labels)
                     
                     Format as markdown with:
                     - Version header
                     - Release date
                     - Summary of changes
                     - Detailed list by category
                     - Known issues (if any)
                     - Upgrade notes (if applicable)`
            }
          }]
        };
      }
    },

    'epic-status': {
      description: 'Get status report for an epic',
      inputSchema: zodToJsonSchema(z.object({
        epicKey: z.string().describe('Epic issue key')
      })) as any,
      handler: async (args: unknown) => {
        const { epicKey } = z.object({ epicKey: z.string() }).parse(args);
        
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a comprehensive status report for epic ${epicKey}:
                     1. Get the epic details
                     2. Search for all issues in the epic
                     3. Calculate:
                        - Total vs completed story points
                        - Number of issues by status
                        - Completion percentage
                        - Blocked items
                     
                     Provide:
                     - Executive summary
                     - Progress metrics
                     - Risk assessment
                     - Timeline projection
                     - Recommendations`
            }
          }]
        };
      }
    }
  };
}