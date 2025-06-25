# MCP Jira Server

A Model Context Protocol (MCP) server that enables Claude Code to interact with Jira for project management, issue tracking, and agile workflows.

⚠️ **Security Note**: Never commit your API tokens! See [SECURITY.md](SECURITY.md) for best practices.

## Features

### Tools
- **create-issue** - Create new Jira issues with full field support
- **update-issue** - Update existing issues
- **get-issue** - Retrieve detailed issue information
- **search-issues** - Search using JQL or simplified filters
- **transition-issue** - Move issues through workflow states
- **link-issues** - Create relationships between issues
- **add-comment** - Add comments to issues

### Resources
- `jira://projects` - List all accessible projects
- `jira://project/{key}` - Get specific project details
- `jira://issue/{key}` - Get specific issue details
- `jira://myself` - Current user information
- `jira://search?jql={query}` - Search results

### Prompts
- **standup-report** - Generate daily standup reports
- **sprint-planning** - Assist with sprint planning activities
- **bug-triage** - Help prioritize and triage bugs
- **release-notes** - Generate release notes from completed issues
- **epic-status** - Comprehensive epic progress reports

## Installation

1. Clone the repository:
```bash
git clone https://github.com/tom28881/JIRA_MCP.git
cd JIRA_MCP
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Create a `.env` file from the example:
```bash
cp .env.example .env
```

5. Configure your Jira credentials in `.env`:
```env
JIRA_HOST=https://your-company.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-api-token
JIRA_DEFAULT_PROJECT=PROJ
```

### Getting a Jira API Token

1. Log in to [Atlassian account settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a name (e.g., "MCP Server")
4. Copy the token and add it to your `.env` file

## Claude Code Configuration

To use this MCP server with Claude Code, you need to configure it in your MCP settings.

### Option 1: Using Environment Variables

Set up the server with environment variables:

```bash
# Export environment variables
export JIRA_HOST="https://your-company.atlassian.net"
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-api-token"
export JIRA_DEFAULT_PROJECT="PROJ"

# Run Claude Code with the MCP server
claude --mcp "node /absolute/path/to/mcp-jira-server/dist/index.js"
```

### Option 2: Using .env File

Create a `.env` file in the server directory and run:

```bash
cd /path/to/mcp-jira-server
claude --mcp "node dist/index.js"
```

### Option 3: Add to Claude Code Settings

Add the server to your Claude Code settings file (`~/.claude/settings.json`):

```json
{
  "mcpServers": [
    {
      "name": "jira",
      "command": "node",
      "args": ["/absolute/path/to/mcp-jira-server/dist/index.js"],
      "env": {
        "JIRA_HOST": "https://your-company.atlassian.net",
        "JIRA_EMAIL": "your-email@company.com",
        "JIRA_API_TOKEN": "your-api-token",
        "JIRA_DEFAULT_PROJECT": "PROJ"
      }
    }
  ]
}
```

## Usage Examples

### Creating Issues

```
Create a new bug in project PROJ with high priority about login issues
```

```
Create a story "Implement user authentication" with 5 story points and assign it to john@example.com
```

### Searching Issues

```
Find all open bugs assigned to me
```

```
Search for issues in project PROJ with label "urgent" that are not done
```

### Managing Issues

```
Update PROJ-123 to add story points 8
```

```
Transition PROJ-456 to "In Progress"
```

```
Link PROJ-123 to PROJ-456 as "blocks"
```

### Using Prompts

```
Generate a standup report for john@example.com
```

```
Help me plan the sprint for project PROJ
```

```
Create release notes for version 2.0 in project PROJ
```

## Advanced Configuration

### Custom Fields

Configure custom field IDs in your `.env`:

```env
JIRA_FIELD_STORY_POINTS=customfield_10001
JIRA_FIELD_ACCEPTANCE_CRITERIA=customfield_10002
JIRA_FIELD_EPIC_LINK=customfield_10003
```

### Auto-create Test Tickets

Enable automatic test ticket creation for stories:

```env
AUTO_CREATE_TEST_TICKETS=true
```

## Development

### Running in Development Mode

```bash
npm run dev
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify your API token is correct
   - Ensure your email matches your Atlassian account
   - Check that your Jira instance URL includes `https://`

2. **Project Not Found**
   - Verify you have access to the project
   - Check the project key is correct (case-sensitive)

3. **Custom Fields Not Working**
   - Use Jira's REST API browser to find correct field IDs
   - Custom field IDs typically start with `customfield_`

### Debug Mode

Set the `DEBUG` environment variable for verbose logging:

```bash
DEBUG=* node dist/index.js
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.