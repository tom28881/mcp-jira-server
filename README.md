# MCP Jira Server

A comprehensive Model Context Protocol (MCP) server for Jira integration with Claude Code. This server provides complete Jira functionality including issue management, sprint operations, comments, attachments, and batch processing.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

⚠️ **Security Note**: Never commit your API tokens! All credentials should be in `.env` files or environment variables.

## 🚀 Features

### 📋 Issue Management (12 tools)
- **create-issue** - Create issues with full field support including custom fields and dates
- **update-issue** - Update existing issues with smart field handling
- **get-issue** - Retrieve detailed issue information
- **search-issues** - Advanced search using JQL or simplified filters with date support
- **transition-issue** - Move issues through workflow states
- **link-issues** - Create relationships between issues (with smart type matching)
- **get-link-types** - List available issue link types
- **get-fields** - Show available fields for project/issue type
- **diagnose-fields** - Troubleshoot field configuration and find custom field IDs
- **create-epic-with-subtasks** - Create epic with multiple subtasks in one operation
- **create-task-for-epic** - Create task linked to epic (optimized for localized Jira)

### 💬 Comments & History (3 tools)
- **get-comments** - Read issue comments with author and timestamp information
- **get-history** - View detailed change history with field modifications
- **add-comment** - Add comments with Atlassian Document Format support
- **batch-comment** - Add same comment to multiple issues simultaneously

### 📎 Attachments (2 tools)
- **get-attachments** - List attachments with metadata (size, type, upload date)
- **upload-attachment** - Upload files using base64 encoding

### 🏃 Sprint & Agile Management (4 tools)
- **get-boards** - List available Jira boards for agile projects
- **get-sprints** - View sprints for a board with status indicators
- **move-issue-to-sprint** - Move issues between sprints and backlog
- **create-sprint** - Create new sprints with optional start/end dates

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

### Setting Dates and Time Estimates

```
Create task "Database backup" with dueDate "next week" and originalEstimate "4h"
```

```
Update PROJ-123 with startDate "tomorrow" and dueDate "+14d"
```

```
Create issue "Quarterly review" with dueDate "31.3.2025" and originalEstimate "2 days"
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

### Date-based Searching

```
Search issues due before "next week" in project PROJ
```

```
Find issues created after "2024-12-01" and updated after "yesterday"
```

```
Search for overdue issues: dueBefore "today" and status != "Done"
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

The server can work with any Jira configuration:

#### Option 1: Auto-Detection (Recommended)
Leave custom field IDs unset in `.env` and the server will automatically detect them based on field names.

#### Option 2: Manual Configuration
If auto-detection doesn't work, configure custom field IDs in your `.env`:

```env
JIRA_FIELD_STORY_POINTS=customfield_10001
JIRA_FIELD_ACCEPTANCE_CRITERIA=customfield_10002
JIRA_FIELD_EPIC_LINK=customfield_10003
```

#### Finding Field IDs
Use the `diagnose-fields` tool to find the correct field IDs for your Jira instance:
```
diagnose-fields project:"PROJ" issueType:"Story"
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
- Issue type names can be in any language (e.g., "Task", "Úkol", "Aufgabe")
- Priority names support localization (e.g., "High", "Vysoká", "Hoch")
- Special support for Czech Jira configurations
- Works with any Jira language setting

### 📅 Date and Time Management
- Flexible date input formats:
  - ISO: "2024-12-31"
  - European: "31.12.2024" or "31/12/2024"
  - Relative: "today", "tomorrow", "next week", "+7d", "+2w", "+1m"
  - Czech: "dnes", "zítra", "příští týden"
- Time tracking support:
  - Estimates: "2h", "1d 4h", "3 days", "2 hodiny"
  - Automatic format conversion
- Date-based searching and filtering

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

### Working with Different Jira Configurations

This MCP server is designed to work with **any Jira instance** regardless of:
- Language settings (English, Czech, German, etc.)
- Custom field configurations
- Project-specific settings

**Best Practices:**
1. Use `get-fields` to see available issue types in your language
2. Use `diagnose-fields` to find custom field IDs
3. Create issues using the exact issue type names from your Jira

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