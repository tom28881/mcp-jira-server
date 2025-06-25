import { JiraClient } from './jira-client.js';
import { createLogger } from './logger.js';

const logger = createLogger('FieldDetector');

export interface DetectedFields {
  storyPoints?: string;
  epicLink?: string;
  acceptanceCriteria?: string;
  team?: string;
  startDate?: string;
  dueDate?: string;
  originalEstimate?: string;
  remainingEstimate?: string;
  [key: string]: string | undefined;
}

export interface ProjectFieldMap {
  [projectKey: string]: DetectedFields;
}

export class FieldDetector {
  private fieldCache: ProjectFieldMap = {};
  
  constructor(private client: JiraClient) {}

  /**
   * Detect custom fields for a project by analyzing field names
   */
  async detectFields(projectKey: string, issueType?: string): Promise<DetectedFields> {
    const cacheKey = `${projectKey}-${issueType || 'all'}`;
    
    // Return cached result if available
    if (this.fieldCache[cacheKey]) {
      logger.debug('Returning cached fields', { projectKey, issueType });
      return this.fieldCache[cacheKey];
    }

    try {
      logger.info('Detecting fields', { projectKey, issueType });
      
      const result = await this.client.getCreateMeta(projectKey);
      if (!result.success || !result.data) {
        logger.error('Failed to get field metadata', { error: result.error });
        return {};
      }

      const project = result.data.projects?.[0];
      if (!project) {
        logger.warn('Project not found', { projectKey });
        return {};
      }

      const detectedFields: DetectedFields = {};
      const fieldPatterns = {
        storyPoints: [
          /story\s*points?/i,
          /story\s*point/i,
          /estimation/i,
          /bodové\s*ohodnocení/i,
          /body/i
        ],
        epicLink: [
          /epic\s*link/i,
          /parent\s*epic/i,
          /epic\s*name/i,
          /epic/i
        ],
        acceptanceCriteria: [
          /acceptance\s*criteria/i,
          /akceptační\s*kritéria/i,
          /definition\s*of\s*done/i
        ],
        team: [
          /team/i,
          /tým/i
        ],
        startDate: [
          /start\s*date/i,
          /datum\s*zahájení/i,
          /začátek/i
        ],
        dueDate: [
          /due\s*date/i,
          /datum\s*dokončení/i,
          /termín/i,
          /deadline/i
        ],
        originalEstimate: [
          /original\s*estimate/i,
          /původní\s*odhad/i,
          /initial\s*estimate/i
        ],
        remainingEstimate: [
          /remaining\s*estimate/i,
          /zbývající\s*odhad/i,
          /time\s*remaining/i
        ]
      };

      // Analyze all issue types or specific one
      const issueTypes = issueType 
        ? project.issuetypes?.filter((it: any) => it.name.toLowerCase() === issueType.toLowerCase())
        : project.issuetypes;

      if (!issueTypes || issueTypes.length === 0) {
        logger.warn('No issue types found', { projectKey, issueType });
        return {};
      }

      // Collect fields from all relevant issue types
      const allFields = new Map<string, any>();
      
      for (const it of issueTypes) {
        if (it.fields) {
          Object.entries(it.fields).forEach(([key, field]: [string, any]) => {
            if (!allFields.has(key)) {
              allFields.set(key, field);
            }
          });
        }
      }

      // Match fields against patterns
      allFields.forEach((field, key) => {
        const fieldName = field.name?.toLowerCase() || '';
        
        for (const [fieldType, patterns] of Object.entries(fieldPatterns)) {
          if (patterns.some(pattern => pattern.test(fieldName))) {
            detectedFields[fieldType] = key;
            logger.info('Detected field', { 
              type: fieldType, 
              fieldId: key, 
              fieldName: field.name 
            });
            break; // Only match first pattern
          }
        }
      });

      // Cache the result
      this.fieldCache[cacheKey] = detectedFields;
      
      logger.info('Field detection complete', { 
        projectKey, 
        detectedCount: Object.keys(detectedFields).length 
      });
      
      return detectedFields;
    } catch (error) {
      logger.error('Error detecting fields', error);
      return {};
    }
  }

  /**
   * Clear the field cache for a project
   */
  clearCache(projectKey?: string) {
    if (projectKey) {
      Object.keys(this.fieldCache)
        .filter(key => key.startsWith(projectKey))
        .forEach(key => delete this.fieldCache[key]);
    } else {
      this.fieldCache = {};
    }
  }

  /**
   * Get detected fields from cache
   */
  getCachedFields(projectKey: string, issueType?: string): DetectedFields | undefined {
    const cacheKey = `${projectKey}-${issueType || 'all'}`;
    return this.fieldCache[cacheKey];
  }
}