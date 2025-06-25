# MCP Jira Server

A Model Context Protocol (MCP) server that enables Claude Code to interact with Jira for project management, issue tracking, and agile workflows.

⚠️ **Security Note**: Never commit your API tokens! See [SECURITY.md](SECURITY.md) for best practices.

## Features

### Tools
- **create-issue** - Create new Jira issues with full field support (including subtasks with parent field)
- **update-issue** - Update existing issues
- **get-issue** - Retrieve detailed issue information
- **search-issues** - Search using JQL or simplified filters
- **transition-issue** - Move issues through workflow states
- **link-issues** - Create relationships between issues (with smart type matching)
- **add-comment** - Add comments to issues
- **get-link-types** - List available issue link types
- **get-fields** - Show available fields for project/issue type
- **create-epic-with-subtasks** - Create an epic with multiple subtasks in one operation
- **diagnose-fields** - Diagnose field configuration issues and find correct custom field IDs
- **create-task-for-epic** - Create a task linked to an epic (optimized for Czech Jira)

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
# or use the convenient run script:
claude --mcp "./run.sh"
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

### Creating Epics with Subtasks

```
Create an epic "Database Migration" in project PROJ with subtasks "Backup current data" and "Migrate schema"
```

### Creating Subtasks

```
Create a subtask "Review code" for parent issue PROJ-123
```

### Czech Jira Support

```
Create issue type "Úkol" in project PROJ
```

```
Create task for epic PPC-48 with summary "Database backup"
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

**Note**: Epic-Story relationships use the epicLink field, not regular issue links:
```
Update PROJ-456 with epicLink "PROJ-100"  # Links story to epic
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

## Features

### 🌍 Localization Support
- Automatic support for localized Jira instances (Czech, English, etc.)
- Issue type names can be in any language
- Priority names support localization
- Special support for Czech Jira configurations

### 🔄 Automatic Retry
The server automatically retries failed requests with exponential backoff (up to 3 attempts).

### 📦 Robust Error Handling
- Empty response handling for Jira transitions
- Detailed error messages with context
- Graceful degradation for missing features

### 📝 Comprehensive Logging
Enable debug logging to see detailed information:
```bash
DEBUG=* claude --mcp "./run.sh"
# or specific to jira-mcp:
DEBUG=jira-mcp claude --mcp "./run.sh"
```

### 🔒 Connection Testing
The server tests the connection on startup and provides clear error messages if authentication fails.

### 📄 Atlassian Document Format
Automatically converts plain text and markdown to Jira's ADF format for rich text fields.

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
   - Use `diagnose-fields` tool to find the correct field IDs for your project
   - Use `get-fields` tool to see all available fields
   - Custom field IDs typically start with `customfield_`
   - Some fields may not be available for certain issue types (e.g., labels on Epics)
   - Epic Link field ID varies between Jira instances

4. **Link Type Not Found**
   - Use `get-link-types` tool to see available link types
   - Link types are case-sensitive in Jira API
   - The server will try to match case-insensitively
   - Epic-Story relationships use epicLink field, not regular issue links

5. **Epic-Story Linking Issues**
   - Run `diagnose-fields` for project and "Story" issue type
   - Update JIRA_FIELD_EPIC_LINK in .env with the correct field ID
   - Restart the MCP server after updating .env

### Debug Mode

Set the `DEBUG` environment variable for verbose logging:

```bash
DEBUG=* claude --mcp "./run.sh"
# or
DEBUG=jira-mcp claude --mcp "./run.sh"
```

### View Logs

Logs are output to stderr and include:
- Connection status
- API requests and responses
- Error details with context
- Performance metrics

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.