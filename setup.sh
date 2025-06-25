#!/bin/bash

echo "MCP Jira Server Setup"
echo "===================="
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists. Please edit it manually or delete it to run setup again."
    exit 1
fi

# Copy .env.example to .env
cp .env.example .env

echo "📋 Setting up your Jira configuration..."
echo ""

# Read Jira host
read -p "Enter your Jira host (e.g., your-company.atlassian.net): " JIRA_HOST
if [[ ! $JIRA_HOST =~ ^https:// ]]; then
    JIRA_HOST="https://$JIRA_HOST"
fi

# Read email
read -p "Enter your Jira email: " JIRA_EMAIL

# Read API token
echo ""
echo "To create an API token:"
echo "1. Go to https://id.atlassian.com/manage-profile/security/api-tokens"
echo "2. Click 'Create API token'"
echo "3. Give it a name (e.g., 'MCP Server')"
echo "4. Copy the token"
echo ""
read -s -p "Enter your Jira API token: " JIRA_API_TOKEN
echo ""

# Read default project
read -p "Enter your default project key (optional, press Enter to skip): " JIRA_DEFAULT_PROJECT

# Update .env file
sed -i.bak "s|JIRA_HOST=.*|JIRA_HOST=$JIRA_HOST|" .env
sed -i.bak "s|JIRA_EMAIL=.*|JIRA_EMAIL=$JIRA_EMAIL|" .env
sed -i.bak "s|JIRA_API_TOKEN=.*|JIRA_API_TOKEN=$JIRA_API_TOKEN|" .env

if [ ! -z "$JIRA_DEFAULT_PROJECT" ]; then
    sed -i.bak "s|JIRA_DEFAULT_PROJECT=.*|JIRA_DEFAULT_PROJECT=$JIRA_DEFAULT_PROJECT|" .env
fi

# Remove backup file
rm .env.bak

echo ""
echo "✅ Configuration saved to .env file"
echo ""

# Ask if user wants to build the project
read -p "Do you want to build the project now? (y/n): " BUILD_NOW

if [[ $BUILD_NOW =~ ^[Yy]$ ]]; then
    echo "Building project..."
    npm run build
    echo "✅ Build complete"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To use this server with Claude Code:"
echo ""
echo "1. Run directly:"
echo "   cd $(pwd)"
echo "   claude --mcp \"node dist/index.js\""
echo ""
echo "2. Or add to ~/.claude/settings.json:"
echo ""
echo '{'
echo '  "mcpServers": ['
echo '    {'
echo '      "name": "jira",'
echo '      "command": "node",'
echo "      \"args\": [\"$(pwd)/dist/index.js\"]"
echo '    }'
echo '  ]'
echo '}'
echo ""
echo "Then run: claude --mcp jira"