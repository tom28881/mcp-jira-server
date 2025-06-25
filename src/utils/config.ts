import { z } from 'zod';
import dotenv from 'dotenv';
import { createLogger } from './logger.js';

const logger = createLogger('Config');

dotenv.config();
logger.debug('Environment variables loaded');

const ConfigSchema = z.object({
  jiraHost: z.string().url().refine(url => url.includes('atlassian.net'), {
    message: 'JIRA_HOST must be a valid Atlassian URL'
  }),
  jiraEmail: z.string().email(),
  jiraApiToken: z.string().min(1),
  defaultProject: z.string().optional(),
  fieldStoryPoints: z.string().optional(), // No default - will be auto-detected
  fieldAcceptanceCriteria: z.string().optional(), // No default - will be auto-detected
  fieldEpicLink: z.string().optional(), // No default - will be auto-detected
  fieldStartDate: z.string().optional(), // No default - will be auto-detected
  autoCreateTestTickets: z.boolean().optional().default(false),
  defaultAssignee: z.string().optional(),
  autoDetectFields: z.boolean().optional().default(true) // Enable auto-detection by default
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  logger.info('Loading configuration...');
  
  const rawConfig = {
    jiraHost: process.env.JIRA_HOST,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraApiToken: process.env.JIRA_API_TOKEN,
    defaultProject: process.env.JIRA_DEFAULT_PROJECT,
    fieldStoryPoints: process.env.JIRA_FIELD_STORY_POINTS,
    fieldAcceptanceCriteria: process.env.JIRA_FIELD_ACCEPTANCE_CRITERIA,
    fieldEpicLink: process.env.JIRA_FIELD_EPIC_LINK,
    fieldStartDate: process.env.JIRA_FIELD_START_DATE,
    autoCreateTestTickets: process.env.AUTO_CREATE_TEST_TICKETS === 'true',
    defaultAssignee: process.env.DEFAULT_ASSIGNEE,
    autoDetectFields: process.env.AUTO_DETECT_FIELDS !== 'false' // Default true unless explicitly disabled
  };

  // Log loaded values (mask sensitive data)
  logger.debug('Raw configuration', {
    jiraHost: rawConfig.jiraHost,
    jiraEmail: rawConfig.jiraEmail,
    jiraApiToken: rawConfig.jiraApiToken ? '***' : undefined,
    defaultProject: rawConfig.defaultProject,
    customFields: {
      storyPoints: rawConfig.fieldStoryPoints,
      acceptanceCriteria: rawConfig.fieldAcceptanceCriteria,
      epicLink: rawConfig.fieldEpicLink
    }
  });

  try {
    const config = ConfigSchema.parse(rawConfig);
    logger.info('Configuration loaded successfully');
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.errors
        .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
        .map(e => {
          const field = e.path.join('.');
          switch (field) {
            case 'jiraHost': return 'JIRA_HOST';
            case 'jiraEmail': return 'JIRA_EMAIL';
            case 'jiraApiToken': return 'JIRA_API_TOKEN';
            default: return field;
          }
        });
      
      const invalidFields = error.errors
        .filter(e => e.code !== 'invalid_type' || e.received !== 'undefined')
        .map(e => `${e.path.join('.')}: ${e.message}`);
      
      if (missingFields.length > 0) {
        logger.error('Missing required environment variables', { missingFields });
        throw new Error(
          `Missing required environment variables: ${missingFields.join(', ')}\n` +
          'Please check your .env file or environment configuration.\n' +
          'See .env.example for required variables.'
        );
      }
      
      if (invalidFields.length > 0) {
        logger.error('Invalid configuration values', { invalidFields });
        throw new Error(`Configuration validation failed:\n${invalidFields.join('\n')}`);
      }
      
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
    throw error;
  }
}

export function getCustomFieldMapping(config: Config): Record<string, string | undefined> {
  return {
    storyPoints: config.fieldStoryPoints,
    acceptanceCriteria: config.fieldAcceptanceCriteria,
    epicLink: config.fieldEpicLink
  };
}