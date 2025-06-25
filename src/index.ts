#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './utils/config.js';
import { JiraClient } from './utils/jira-client.js';
import { createIssueTools } from './tools/issue-tools.js';
import { createJiraPrompts } from './prompts/jira-prompts.js';
import { createJiraResources } from './resources/jira-resources.js';

// Request schemas
const ToolsListRequestSchema = z.object({
  method: z.literal('tools/list')
});

const ToolsCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.unknown().optional()
  })
});

const PromptsListRequestSchema = z.object({
  method: z.literal('prompts/list')
});

const PromptsGetRequestSchema = z.object({
  method: z.literal('prompts/get'),
  params: z.object({
    name: z.string(),
    arguments: z.unknown().optional()
  })
});

const ResourcesListRequestSchema = z.object({
  method: z.literal('resources/list')
});

const ResourcesReadRequestSchema = z.object({
  method: z.literal('resources/read'),
  params: z.object({
    uri: z.string()
  })
});

async function main() {
  try {
    const config = loadConfig();
    
    const server = new Server(
      {
        name: 'mcp-jira-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          resources: { subscribe: false },
          tools: {},
          prompts: {}
        }
      }
    );

    const client = new JiraClient(config.jiraHost, config.jiraEmail, config.jiraApiToken);

    // Get all handlers
    const tools = createIssueTools(client, config);
    const prompts = createJiraPrompts();
    const resources = createJiraResources(client, config);

    // Register tool handlers
    server.setRequestHandler(ToolsListRequestSchema, async () => {
      return {
        tools: Object.entries(tools).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    server.setRequestHandler(ToolsCallRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = tools[name];
      
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      
      return await tool.handler(args);
    });

    // Register prompt handlers
    server.setRequestHandler(PromptsListRequestSchema, async () => {
      return {
        prompts: Object.entries(prompts).map(([name, prompt]) => ({
          name,
          description: prompt.description,
          inputSchema: prompt.inputSchema
        }))
      };
    });

    server.setRequestHandler(PromptsGetRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const prompt = prompts[name];
      
      if (!prompt) {
        throw new Error(`Unknown prompt: ${name}`);
      }
      
      return await prompt.handler(args);
    });

    // Register resource handlers
    server.setRequestHandler(ResourcesListRequestSchema, async () => {
      return {
        resources: Object.entries(resources).map(([uri, resource]) => ({
          uri,
          name: uri.replace('jira://', ''),
          description: resource.description,
          mimeType: 'application/json'
        }))
      };
    });

    server.setRequestHandler(ResourcesReadRequestSchema, async (request) => {
      const { uri } = request.params;
      
      // Handle parameterized URIs
      for (const [pattern, handler] of Object.entries(resources)) {
        const regex = pattern.replace(/\{(\w+)\}/g, '([^/]+)');
        const match = uri.match(new RegExp(`^${regex}$`));
        
        if (match) {
          const params: Record<string, string> = {};
          const paramNames = pattern.match(/\{(\w+)\}/g)?.map(p => p.slice(1, -1)) || [];
          paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
          });
          
          return handler.handler(params);
        }
      }
      
      // Direct match
      if (resources[uri]) {
        return resources[uri].handler({});
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Jira MCP server started successfully');

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});