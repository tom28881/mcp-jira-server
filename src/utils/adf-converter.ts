/**
 * Convert plain text or markdown to Atlassian Document Format (ADF)
 */
export function textToADF(text: string): any {
  if (!text) {
    return null;
  }

  // Split text into paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  const content = paragraphs.map(paragraph => {
    // Check if it's a heading (starts with #)
    const headingMatch = paragraph.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      return {
        type: 'heading',
        attrs: { level },
        content: [{
          type: 'text',
          text: text
        }]
      };
    }

    // Check if it's a bullet list
    const bulletMatch = paragraph.match(/^[\*\-]\s+(.+)$/);
    if (bulletMatch) {
      return {
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: bulletMatch[1]
            }]
          }]
        }]
      };
    }

    // Check for code blocks
    if (paragraph.startsWith('```') && paragraph.endsWith('```')) {
      const code = paragraph.slice(3, -3).trim();
      return {
        type: 'codeBlock',
        content: [{
          type: 'text',
          text: code
        }]
      };
    }

    // Regular paragraph
    const lines = paragraph.split('\n');
    const content: any[] = [];
    
    lines.forEach((line, index) => {
      if (index > 0) {
        content.push({ type: 'hardBreak' });
      }
      
      // Simple bold text support
      const parts = line.split(/\*\*(.+?)\*\*/g);
      parts.forEach((part, i) => {
        if (i % 2 === 0 && part) {
          content.push({
            type: 'text',
            text: part
          });
        } else if (part) {
          content.push({
            type: 'text',
            text: part,
            marks: [{ type: 'strong' }]
          });
        }
      });
    });

    return {
      type: 'paragraph',
      content: content.length > 0 ? content : [{ type: 'text', text: ' ' }]
    };
  }).filter(Boolean);

  return {
    type: 'doc',
    version: 1,
    content: content.length > 0 ? content : [{
      type: 'paragraph',
      content: [{ type: 'text', text: text }]
    }]
  };
}

/**
 * Convert ADF to plain text
 */
export function adfToText(adf: any): string {
  if (!adf || !adf.content) {
    return '';
  }

  return adf.content.map((node: any) => {
    switch (node.type) {
      case 'paragraph':
        return nodeContentToText(node.content);
      case 'heading':
        const level = node.attrs?.level || 1;
        return '#'.repeat(level) + ' ' + nodeContentToText(node.content);
      case 'bulletList':
        return node.content.map((item: any) => 
          '• ' + nodeContentToText(item.content?.[0]?.content || [])
        ).join('\n');
      case 'orderedList':
        return node.content.map((item: any, index: number) => 
          `${index + 1}. ` + nodeContentToText(item.content?.[0]?.content || [])
        ).join('\n');
      case 'codeBlock':
        return '```\n' + nodeContentToText(node.content) + '\n```';
      default:
        return nodeContentToText(node.content);
    }
  }).join('\n\n');
}

function nodeContentToText(content: any[]): string {
  if (!content) return '';
  
  return content.map(node => {
    switch (node.type) {
      case 'text':
        return node.text || '';
      case 'hardBreak':
        return '\n';
      case 'mention':
        return `@${node.attrs?.text || 'user'}`;
      case 'emoji':
        return node.attrs?.shortName || '';
      default:
        return '';
    }
  }).join('');
}