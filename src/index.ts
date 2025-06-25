#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './utils/config.js';
import { JiraClient } from './utils/jira-client.js';
import { createIssueTools } from './tools/issue-tools.js';
import { createJiraPrompts } from './prompts/jira-prompts.js';
import { createJiraResources } from './resources/jira-resources.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Main');

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
    logger.info('Starting MCP Jira Server...');
    const config = loadConfig();
    logger.info('Configuration loaded');
    
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

    // Test connection
    logger.info('Testing Jira connection...');
    const connectionOk = await client.testConnection();
    if (!connectionOk) {
      logger.error('Failed to connect to Jira. Please check your credentials.');
      console.error('\n⚠️  Failed to connect to Jira!');
      console.error('Please check:');
      console.error('1. JIRA_HOST is correct (e.g., https://company.atlassian.net)');
      console.error('2. JIRA_EMAIL matches your Atlassian account');
      console.error('3. JIRA_API_TOKEN is valid (create at https://id.atlassian.com/manage-profile/security/api-tokens)');
      console.error('\nRun DEBUG=* to see detailed error messages\n');
      process.exit(1);
    }
    logger.info('Jira connection successful');

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
      
      try {
        const result = await tool.handler(args);
        // Ensure result has proper structure
        if (!result || !result.content) {
          return {
            content: [{
              type: 'text',
              text: `❌ Tool ${name} returned invalid response`
            }]
          };
        }
        return result;
      } catch (error) {
        console.error(`Error in tool ${name}:`, error);
        return {
          content: [{
            type: 'text',
            text: `❌ Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          }]
        };
      }
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
    
    logger.info('Server started successfully');
    console.error('🎉 Jira MCP server started successfully');
    console.error(`Connected to: ${config.jiraHost}`);
    console.error(`Tools: ${Object.keys(tools).length}, Prompts: ${Object.keys(prompts).length}, Resources: ${Object.keys(resources).length}`);

  } catch (error) {
    logger.error('Failed to start server', error);
    console.error('Failed to start server:', error);
    
    if (error instanceof Error && error.message.includes('Missing required environment')) {
      console.error('\nPlease set up your environment variables or create a .env file');
      console.error('See .env.example for required variables');
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error', error);
  console.error('Unhandled error:', error);
  process.exit(1);
});