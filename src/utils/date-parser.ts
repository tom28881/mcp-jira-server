import { createLogger } from './logger.js';

const logger = createLogger('DateParser');

/**
 * Parse various date formats and relative dates to Jira format (YYYY-MM-DD)
 */
export function parseDate(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Relative dates
  if (trimmed === 'today' || trimmed === 'dnes') {
    return formatDate(today);
  }
  
  if (trimmed === 'tomorrow' || trimmed === 'zítra') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  
  if (trimmed === 'yesterday' || trimmed === 'včera') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }
  
  // Next week/month
  if (trimmed === 'next week' || trimmed === 'příští týden') {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDate(nextWeek);
  }
  
  if (trimmed === 'next month' || trimmed === 'příští měsíc') {
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return formatDate(nextMonth);
  }
  
  // Relative days: +7d, +2w, +1m
  const relativeMatch = trimmed.match(/^\+(\d+)([dwmy])$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const targetDate = new Date(today);
    
    switch (unit) {
      case 'd':
        targetDate.setDate(targetDate.getDate() + amount);
        break;
      case 'w':
        targetDate.setDate(targetDate.getDate() + (amount * 7));
        break;
      case 'm':
        targetDate.setMonth(targetDate.getMonth() + amount);
        break;
      case 'y':
        targetDate.setFullYear(targetDate.getFullYear() + amount);
        break;
    }
    
    return formatDate(targetDate);
  }
  
  // ISO format: YYYY-MM-DD
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return input; // Already in correct format
  }
  
  // European format: DD.MM.YYYY or DD/MM/YYYY
  const euroMatch = input.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (euroMatch) {
    const day = euroMatch[1].padStart(2, '0');
    const month = euroMatch[2].padStart(2, '0');
    const year = euroMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // US format: MM/DD/YYYY
  const usMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch && parseInt(usMatch[1], 10) > 12) {
    // If first number > 12, assume DD/MM/YYYY
    const day = usMatch[1].padStart(2, '0');
    const month = usMatch[2].padStart(2, '0');
    const year = usMatch[3];
    return `${year}-${month}-${day}`;
  }
  
  // Try to parse as standard date
  try {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      return formatDate(parsed);
    }
  } catch (error) {
    logger.debug('Failed to parse date', { input, error });
  }
  
  // Return as-is and let Jira handle it
  logger.warn('Could not parse date, returning as-is', { input });
  return input;
}

/**
 * Parse time estimates (e.g., "2h", "1d 4h", "3w")
 */
export function parseTimeEstimate(input: string): string {
  const trimmed = input.trim().toLowerCase();
  
  // Already in Jira format (e.g., "2h", "1d", "3w")
  if (/^\d+[wdhms](\s+\d+[wdhms])*$/.test(trimmed)) {
    return trimmed;
  }
  
  // Convert common formats
  const replacements: Record<string, string> = {
    'hours': 'h',
    'hour': 'h',
    'hodin': 'h',
    'hodina': 'h',
    'hodiny': 'h',
    'days': 'd',
    'day': 'd',
    'den': 'd',
    'dny': 'd',
    'dní': 'd',
    'weeks': 'w',
    'week': 'w',
    'týden': 'w',
    'týdny': 'w',
    'týdnů': 'w',
    'minutes': 'm',
    'minute': 'm',
    'minut': 'm',
    'minuta': 'm',
    'minuty': 'm'
  };
  
  let result = trimmed;
  for (const [long, short] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\b${long}\\b`, 'g'), short);
  }
  
  // Remove extra spaces
  result = result.replace(/\s+/g, ' ').trim();
  
  // Validate format
  if (/^\d+[wdhms](\s+\d+[wdhms])*$/.test(result)) {
    return result;
  }
  
  // Return original if can't parse
  logger.warn('Could not parse time estimate, returning as-is', { input });
  return input;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}