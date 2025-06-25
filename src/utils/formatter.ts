import type { JiraIssue, JiraSearchResult } from '../types/jira.js';

export class JiraFormatter {
  static formatIssue(issue: JiraIssue): string {
    const fields = issue.fields;
    const lines: string[] = [
      `🎫 ${issue.key}: ${fields.summary}`,
      `📊 Status: ${fields.status.name}`,
      `🔧 Type: ${fields.issuetype.name}`,
      `📅 Created: ${new Date(fields.created).toLocaleDateString()}`,
      `📅 Updated: ${new Date(fields.updated).toLocaleDateString()}`
    ];

    if (fields.assignee) {
      lines.push(`👤 Assignee: ${fields.assignee.displayName}`);
    }

    if (fields.reporter) {
      lines.push(`📝 Reporter: ${fields.reporter.displayName}`);
    }

    if (fields.priority) {
      lines.push(`⚡ Priority: ${fields.priority.name}`);
    }

    if (fields.labels && fields.labels.length > 0) {
      lines.push(`🏷️  Labels: ${fields.labels.join(', ')}`);
    }

    if (fields.components && fields.components.length > 0) {
      lines.push(`📦 Components: ${fields.components.map(c => c.name).join(', ')}`);
    }

    if (fields.description) {
      lines.push('');
      lines.push('📄 Description:');
      lines.push(this.formatDescription(fields.description));
    }

    const customFields = this.getCustomFields(fields);
    if (customFields.length > 0) {
      lines.push('');
      lines.push('🔧 Custom Fields:');
      customFields.forEach(field => lines.push(field));
    }

    return lines.join('\n');
  }

  static formatSearchResults(results: JiraSearchResult): string {
    if (results.total === 0) {
      return '🔍 No issues found';
    }

    const lines: string[] = [
      `🔍 Found ${results.total} issue(s) (showing ${results.issues.length})`,
      ''
    ];

    results.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue.key}: ${issue.fields.summary}`);
      lines.push(`   Status: ${issue.fields.status.name} | Type: ${issue.fields.issuetype.name}`);
      if (issue.fields.assignee) {
        lines.push(`   Assignee: ${issue.fields.assignee.displayName}`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }

  static formatIssueLink(issueKey: string, host: string): string {
    return `${host}/browse/${issueKey}`;
  }

  private static formatDescription(description: any): string {
    if (typeof description === 'string') {
      return description;
    }

    if (description && description.content) {
      return this.parseAtlassianDocument(description);
    }

    return 'No description';
  }

  private static parseAtlassianDocument(doc: any): string {
    const lines: string[] = [];

    const parseContent = (content: any[]): string => {
      return content.map(item => {
        switch (item.type) {
          case 'text':
            return item.text;
          case 'hardBreak':
            return '\n';
          case 'mention':
            return `@${item.attrs.text}`;
          case 'emoji':
            return item.attrs.shortName;
          default:
            return '';
        }
      }).join('');
    };

    if (doc.content) {
      doc.content.forEach((block: any) => {
        switch (block.type) {
          case 'paragraph':
            if (block.content) {
              lines.push(parseContent(block.content));
            }
            break;
          case 'heading':
            if (block.content) {
              const level = block.attrs?.level || 1;
              const prefix = '#'.repeat(level) + ' ';
              lines.push(prefix + parseContent(block.content));
            }
            break;
          case 'bulletList':
          case 'orderedList':
            if (block.content) {
              block.content.forEach((item: any, index: number) => {
                const prefix = block.type === 'bulletList' ? '• ' : `${index + 1}. `;
                if (item.content && item.content[0]?.content) {
                  lines.push(prefix + parseContent(item.content[0].content));
                }
              });
            }
            break;
          case 'codeBlock':
            lines.push('```');
            if (block.content) {
              lines.push(parseContent(block.content));
            }
            lines.push('```');
            break;
        }
      });
    }

    return lines.join('\n');
  }

  private static getCustomFields(fields: any): string[] {
    const customFields: string[] = [];

    Object.entries(fields).forEach(([key, value]) => {
      if (key.startsWith('customfield_') && value !== null) {
        const displayValue = this.formatCustomFieldValue(value);
        if (displayValue) {
          customFields.push(`  ${key}: ${displayValue}`);
        }
      }
    });

    return customFields;
  }

  private static formatCustomFieldValue(value: any): string {
    if (typeof value === 'string' || typeof value === 'number') {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map(v => this.formatCustomFieldValue(v)).join(', ');
    }

    if (value && typeof value === 'object') {
      if (value.name) return value.name;
      if (value.value) return value.value;
      if (value.displayName) return value.displayName;
    }

    return '';
  }
}