import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  jiraHost: z.string().url().refine(url => url.includes('atlassian.net'), {
    message: 'JIRA_HOST must be a valid Atlassian URL'
  }),
  jiraEmail: z.string().email(),
  jiraApiToken: z.string().min(1),
  defaultProject: z.string().optional(),
  fieldStoryPoints: z.string().optional().default('customfield_10001'),
  fieldAcceptanceCriteria: z.string().optional().default('customfield_10002'),
  fieldEpicLink: z.string().optional().default('customfield_10003'),
  autoCreateTestTickets: z.boolean().optional().default(false),
  defaultAssignee: z.string().optional()
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const rawConfig = {
    jiraHost: process.env.JIRA_HOST,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraApiToken: process.env.JIRA_API_TOKEN,
    defaultProject: process.env.JIRA_DEFAULT_PROJECT,
    fieldStoryPoints: process.env.JIRA_FIELD_STORY_POINTS,
    fieldAcceptanceCriteria: process.env.JIRA_FIELD_ACCEPTANCE_CRITERIA,
    fieldEpicLink: process.env.JIRA_FIELD_EPIC_LINK,
    autoCreateTestTickets: process.env.AUTO_CREATE_TEST_TICKETS === 'true',
    defaultAssignee: process.env.DEFAULT_ASSIGNEE
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => e.path.join('.'));
      
      if (missingFields.length > 0) {
        throw new Error(
          `Missing required environment variables: ${missingFields.join(', ')}\n` +
          'Please check your .env file or environment configuration.'
        );
      }
      
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
    throw error;
  }
}

export function getCustomFieldMapping(config: Config): Record<string, string> {
  return {
    storyPoints: config.fieldStoryPoints,
    acceptanceCriteria: config.fieldAcceptanceCriteria,
    epicLink: config.fieldEpicLink
  };
}