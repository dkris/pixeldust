declare module '@modelcontextprotocol/sdk' {
  import type { McpClientOptions, McpToolCallRequest, McpToolResponse } from './mcp';

  export class McpClient {
    constructor(options: McpClientOptions);
    callTool(request: McpToolCallRequest): Promise<McpToolResponse>;
    close(): Promise<void>;
  }
}
