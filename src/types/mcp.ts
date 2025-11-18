export interface McpClientOptions {
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface McpToolCallRequest {
  name: string;
  arguments?: Record<string, any>;
  timeoutMs?: number;
}

export interface McpToolArtifact {
  type: 'text' | 'json' | 'image' | 'binary';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

export interface McpToolResponse {
  data?: any;
  output?: any;
  result?: any;
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  artifacts?: McpToolArtifact[];
  error?: { message: string };
}

export interface McpClient {
  callTool(request: McpToolCallRequest): Promise<McpToolResponse>;
  close(): Promise<void>;
}

export type McpClientConstructor = new (options: McpClientOptions) => McpClient;
