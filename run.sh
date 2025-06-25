#!/bin/bash

# MCP Jira Server Runner Script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if node_modules exists
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo "📦 Installing dependencies..."
    cd "$SCRIPT_DIR" && npm install
fi

# Check if dist exists
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo "🔨 Building project..."
    cd "$SCRIPT_DIR" && npm run build
fi

# Run the server
cd "$SCRIPT_DIR" && node dist/index.js