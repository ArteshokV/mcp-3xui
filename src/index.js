#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { PanelClient, PanelError } from "./client.js";
import { buildTools } from "./tools.js";

const baseUrl = process.env.XUI_BASE_URL;
const token = process.env.XUI_API_TOKEN;

if (!baseUrl || !token) {
  console.error(
    "mcp-3xui: XUI_BASE_URL and XUI_API_TOKEN must both be set.\n" +
      "  XUI_BASE_URL   panel root URL, e.g. https://panel.example.com:2053\n" +
      "  XUI_API_TOKEN  panel -> Settings -> Security -> API Token (shown once at creation)"
  );
  process.exit(1);
}

const panel = new PanelClient({ baseUrl, token });
const tools = buildTools(panel);
const byName = new Map(tools.map((t) => [t.name, t]));

const server = new Server({ name: "mcp-3xui", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = byName.get(req.params.name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  try {
    return await tool.run(req.params.arguments || {});
  } catch (e) {
    const detail = e instanceof PanelError && e.body ? `\n${JSON.stringify(e.body).slice(0, 2000)}` : "";
    return { isError: true, content: [{ type: "text", text: `${e.message}${detail}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`mcp-3xui ready - ${tools.length} tools against ${baseUrl}`);
