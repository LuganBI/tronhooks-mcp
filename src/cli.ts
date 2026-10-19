#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './index.js';
const apiKey = process.env.TRONHOOKS_API_KEY;
const server = createServer(apiKey ? { apiKey } : {});
await server.connect(new StdioServerTransport());
