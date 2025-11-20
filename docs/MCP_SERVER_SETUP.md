# MCP Server Setup Guide

## Overview

PixelDust supports two types of MCP (Model Context Protocol) servers for workflow discovery:

1. **Official Playwright MCP** (`playwright-mcp`) - Microsoft's official Playwright MCP server
2. **Custom MCP Server** (`custom`) - Your own custom MCP implementation

The official Playwright MCP server is the **recommended option** as it:
- ✅ Provides standardized, well-maintained browser automation
- ✅ Gets automatic updates with new Playwright features
- ✅ Has better error handling and resilience
- ✅ Reduces maintenance burden
- ✅ Benefits from community support and documentation

## Using the Official Playwright MCP Server

### 1. Installation

The official Playwright MCP server can be run without installation using `npx`:

```bash
npx @playwright/mcp@latest
```

Or install it globally:

```bash
npm install -g @playwright/mcp
```

### 2. Starting the MCP Server

The Playwright MCP server needs to run as a separate process. Start it with:

```bash
npx @playwright/mcp@latest
```

By default, it starts an MCP server that listens for connections. You can configure it with various options:

```bash
# Run with specific browser
npx @playwright/mcp@latest --browser chromium

# Run in headless mode
npx @playwright/mcp@latest --headless

# Run with custom viewport
npx @playwright/mcp@latest --viewport-width 1920 --viewport-height 1080
```

For full options, run:
```bash
npx @playwright/mcp@latest --help
```

### 3. Configuring PixelDust

#### Option 1: Configuration File

Add the MCP configuration to your `.pixeldustrc.json`:

```json
{
  "workflowDiscovery": {
    "driver": "mcp",
    "maxDepth": 3,
    "maxPages": 50,
    "mcp": {
      "endpoint": "http://localhost:3000",
      "serverType": "playwright-mcp",
      "timeoutMs": 30000
    }
  }
}
```

#### Option 2: CLI Options

Use command-line options to configure the MCP server:

```bash
# Run workflow discovery with official MCP server
pixeldust discover-workflows \
  --url http://localhost:8080 \
  --driver mcp \
  --mcp-endpoint http://localhost:3000 \
  --mcp-server-type playwright-mcp

# Run full test suite with MCP server
pixeldust test \
  --workflow-driver mcp \
  --workflow-mcp-endpoint http://localhost:3000 \
  --workflow-mcp-server-type playwright-mcp
```

#### Option 3: Environment Variables

Set environment variables for MCP configuration:

```bash
export PIXELDUST_MCP_ENDPOINT=http://localhost:3000
export PIXELDUST_MCP_TIMEOUT=30000

pixeldust discover-workflows --url http://localhost:8080 --driver mcp
```

### 4. MCP Server Authentication (Optional)

If your MCP server requires authentication:

#### Bearer Token Authentication

```json
{
  "workflowDiscovery": {
    "mcp": {
      "endpoint": "http://localhost:3000",
      "serverType": "playwright-mcp",
      "credentials": {
        "token": "your-bearer-token"
      }
    }
  }
}
```

Or via CLI:
```bash
pixeldust discover-workflows \
  --driver mcp \
  --mcp-endpoint http://localhost:3000 \
  --mcp-token your-bearer-token
```

#### Basic Authentication

```json
{
  "workflowDiscovery": {
    "mcp": {
      "endpoint": "http://localhost:3000",
      "serverType": "playwright-mcp",
      "credentials": {
        "username": "admin",
        "password": "secret"
      }
    }
  }
}
```

Or via CLI:
```bash
pixeldust discover-workflows \
  --driver mcp \
  --mcp-endpoint http://localhost:3000 \
  --mcp-username admin \
  --mcp-password secret
```

## Using a Custom MCP Server

If you have your own MCP server implementation:

### 1. Configure Server Type

```json
{
  "workflowDiscovery": {
    "driver": "mcp",
    "mcp": {
      "endpoint": "http://localhost:3000",
      "serverType": "custom",
      "tools": {
        "start": "session.start",
        "goto": "page.goto",
        "snapshot": "page.snapshot",
        "metadata": "page.metadata",
        "components": "page.components",
        "interactive": "page.interactiveElements",
        "links": "page.links",
        "screenshot": "page.screenshot",
        "console": "page.consoleLogs",
        "close": "page.close"
      }
    }
  }
}
```

### 2. Custom Tool Mappings

You can override individual tool names:

```json
{
  "workflowDiscovery": {
    "mcp": {
      "serverType": "custom",
      "tools": {
        "goto": "custom_navigate",
        "snapshot": "custom_get_dom"
      }
    }
  }
}
```

## Tool Mappings

### Official Playwright MCP Server

The official server uses these tool names:

| PixelDust Operation | Playwright MCP Tool |
|---------------------|---------------------|
| Start session       | `browser_navigate`  |
| Navigate to URL     | `browser_navigate`  |
| Get DOM snapshot    | `browser_snapshot`  |
| Get page metadata   | `browser_snapshot`  |
| Find components     | `browser_snapshot`  |
| Find interactive    | `browser_snapshot`  |
| Extract links       | `browser_snapshot`  |
| Take screenshot     | `browser_screenshot`|
| Get console logs    | `browser_console_logs`|
| Close browser       | `browser_close`     |

### Default Custom Server

The default custom server expects these tool names:

| PixelDust Operation | Custom MCP Tool |
|---------------------|-----------------|
| Start session       | `session.start` |
| Navigate to URL     | `page.goto`     |
| Get DOM snapshot    | `page.snapshot` |
| Get page metadata   | `page.metadata` |
| Find components     | `page.components`|
| Find interactive    | `page.interactiveElements`|
| Extract links       | `page.links`    |
| Take screenshot     | `page.screenshot`|
| Get console logs    | `page.consoleLogs`|
| Close browser       | `page.close`    |

## Migration from Custom to Official Server

If you're currently using a custom MCP server and want to migrate to the official Playwright MCP server:

1. **Start the official server**:
   ```bash
   npx @playwright/mcp@latest
   ```

2. **Update your configuration** to use `playwright-mcp`:
   ```json
   {
     "workflowDiscovery": {
       "mcp": {
         "serverType": "playwright-mcp"
       }
     }
   }
   ```

3. **Remove custom tool mappings** (they're no longer needed)

4. **Test workflow discovery**:
   ```bash
   pixeldust discover-workflows --url http://localhost:8080
   ```

## Troubleshooting

### Connection Issues

If PixelDust can't connect to the MCP server:

1. Verify the server is running:
   ```bash
   curl http://localhost:3000
   ```

2. Check the endpoint URL in your configuration

3. Verify network access (firewalls, proxies)

### Tool Not Found Errors

If you see "tool not found" errors:

1. Verify the `serverType` is set correctly (`playwright-mcp` or `custom`)

2. For custom servers, check your tool name mappings

3. Review the server logs for available tools

### Timeout Issues

If operations timeout:

1. Increase the timeout:
   ```json
   {
     "workflowDiscovery": {
       "mcp": {
         "timeoutMs": 60000
       }
     }
   }
   ```

2. Check server performance and network latency

## Advanced Configuration

### Running MCP Server in Docker

```dockerfile
FROM node:18-alpine

RUN npm install -g @playwright/mcp
RUN npx playwright install --with-deps chromium

EXPOSE 3000
CMD ["npx", "@playwright/mcp@latest"]
```

Build and run:
```bash
docker build -t playwright-mcp .
docker run -p 3000:3000 playwright-mcp
```

### Using with Different MCP Clients

The PixelDust MCP integration uses the `@modelcontextprotocol/sdk` package internally. This is compatible with any MCP server implementation.

## Resources

- [Official Playwright MCP Repository](https://github.com/microsoft/playwright-mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Playwright Documentation](https://playwright.dev)

## Support

For issues with:
- **PixelDust MCP integration**: Open an issue in the PixelDust repository
- **Official Playwright MCP server**: Open an issue in the [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) repository
- **Custom MCP servers**: Contact your MCP server provider
