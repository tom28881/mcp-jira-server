# Quick Start Guide for Claude Code

## 1. Install and Build

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-jira-server.git
cd mcp-jira-server

# Install dependencies
npm install

# Build the project
npm run build
```

## 2. Configure

```bash
# Run the setup script
./setup.sh

# Or manually create .env file
cp .env.example .env
# Edit .env with your Jira credentials
```

## 3. Run with Claude Code

### Quick Test
```bash
# From the mcp-jira-server directory
claude --mcp "node dist/index.js"
```

### Permanent Setup

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": [
    {
      "name": "jira",
      "command": "node",
      "args": ["/absolute/path/to/mcp-jira-server/dist/index.js"]
    }
  ]
}
```

Then run:
```bash
claude --mcp jira
```

## 4. Example Commands

Once connected, try these commands in Claude Code:

### Creating Issues
```
Create a bug in project PROJ with high priority about login failure
```

### Searching Issues
```
Find all open bugs assigned to me
```

### Updating Issues
```
Update PROJ-123 to add 5 story points
```

### Using Prompts
```
Generate a standup report for my email
```

## 5. Troubleshooting

### Check Server Status
```bash
# Test if the server starts correctly
node test-server.js
```

### View Logs
```bash
# Run with debug output
DEBUG=* claude --mcp "node dist/index.js"
```

### Common Issues

1. **Authentication Failed**
   - Verify your API token at https://id.atlassian.com/manage-profile/security/api-tokens
   - Ensure email matches your Atlassian account

2. **Project Not Found**
   - Check project key is correct (case-sensitive)
   - Verify you have access to the project

3. **MCP Connection Failed**
   - Ensure the server path is absolute in settings.json
   - Check that dist/index.js exists after building