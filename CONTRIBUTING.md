# Contributing to MCP Jira Server

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch (`git checkout -b feature/amazing-feature`)
4. Make your changes
5. Run tests and ensure everything passes
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to your branch (`git push origin feature/amazing-feature`)
8. Open a Merge Request

## Development Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Add types for all function parameters and returns
- Use meaningful variable and function names
- Keep functions small and focused

## Adding New Features

### Adding a New Tool

1. Create a new function in `src/tools/issue-tools.ts`
2. Add Zod schema for input validation
3. Implement the handler function
4. Add to the exported tools object

Example:
```typescript
const MyNewToolSchema = z.object({
  param1: z.string(),
  param2: z.number().optional()
});

'my-new-tool': {
  description: 'Description of what this tool does',
  inputSchema: zodToJsonSchema(MyNewToolSchema) as any,
  handler: async (args: unknown) => {
    const params = MyNewToolSchema.parse(args);
    // Implementation
  }
}
```

### Adding a New Prompt

1. Add to `src/prompts/jira-prompts.ts`
2. Create input schema
3. Return appropriate prompt messages

### Adding a New Resource

1. Add to `src/resources/jira-resources.ts`
2. Implement the handler function
3. Return data in appropriate format

## Testing

Currently manual testing is used. To test your changes:

1. Build the project: `npm run build`
2. Run the test script: `node test-server.js`
3. Test with Claude Code: `claude --mcp "node dist/index.js"`

## Documentation

- Update README.md if adding new features
- Add JSDoc comments to new functions
- Include examples in documentation

## Commit Messages

Use clear, descriptive commit messages:
- `feat: Add support for bulk issue updates`
- `fix: Handle empty search results correctly`
- `docs: Update installation instructions`
- `refactor: Simplify error handling in JiraClient`

## Questions?

Feel free to open an issue for any questions or discussions!