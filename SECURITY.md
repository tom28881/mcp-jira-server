# Security Guidelines

## API Token Security

**NEVER commit your Jira API tokens or credentials to version control!**

- Always use environment variables or `.env` files (which are gitignored)
- Never hardcode credentials in source code
- Rotate API tokens regularly
- Use minimal permissions required for the integration

## Creating Jira API Token

1. Log in to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Name it appropriately (e.g., "MCP Server - Development")
4. Store it securely - you won't be able to see it again

## Best Practices

1. **Use `.env` file for local development**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. **Environment Variables for Production**
   ```bash
   export JIRA_HOST="https://your-company.atlassian.net"
   export JIRA_EMAIL="your-email@company.com"
   export JIRA_API_TOKEN="your-secure-token"
   ```

3. **Minimal Permissions**
   - Only grant the Jira permissions your integration needs
   - Use project-specific permissions where possible

4. **Token Rotation**
   - Rotate API tokens every 90 days
   - Immediately revoke compromised tokens

## Reporting Security Issues

If you discover a security vulnerability, please report it to the repository maintainers via private message. Do not create public issues for security vulnerabilities.