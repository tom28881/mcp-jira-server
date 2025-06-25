type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private context: string;
  private enabled: boolean;

  constructor(context: string) {
    this.context = context;
    this.enabled = process.env.DEBUG === '*' || (process.env.DEBUG?.includes('jira-mcp') ?? false);
  }

  private log(level: LogLevel, message: string, data?: any) {
    if (!this.enabled && level !== 'error') return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;
    
    console.error(`${prefix} ${message}`);
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, errorData?: any) {
    const data = errorData instanceof Error ? {
      errorMessage: errorData.message,
      stack: errorData.stack,
      name: errorData.name
    } : errorData;
    
    this.log('error', message, data);
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}