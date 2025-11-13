# PixelDust Quick Start Guide

Get started with PixelDust in 5 minutes!

## Prerequisites

- Node.js 18 or higher
- Docker or Podman installed
- Anthropic API key (get one at https://console.anthropic.com/)

## Installation

```bash
npm install -g @pixeldust/ui-version-tester
```

## Step 1: Initialize Your Project

Create a new directory for your test project:

```bash
mkdir my-ui-version-test
cd my-ui-version-test
```

Initialize PixelDust configuration:

```bash
pixeldust init
```

This creates `.pixeldustrc.json`.

## Step 2: Configure Your Test

Edit `.pixeldustrc.json`:

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "containers": {
    "runtime": "docker",
    "baseImage": "node:18-alpine",
    "resources": {
      "memory": "2g",
      "cpu": 2
    }
  },
  "testing": {
    "browsers": ["chromium"],
    "viewport": { "width": 1920, "height": 1080 },
    "timeout": 30000,
    "retries": 2
  },
  "analysis": {
    "visualThreshold": 0.1
  },
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929"
  },
  "storage": {
    "type": "local",
    "path": "./data"
  },
  "reporting": {
    "format": ["markdown", "html"],
    "outputPath": "./reports"
  }
}
```

## Step 3: Set Your API Key

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Or add it to `.env`:

```bash
echo "ANTHROPIC_API_KEY=your-api-key-here" > .env
```

## Step 4: Run Your First Test

```bash
pixeldust test
```

This will:
1. ✅ Validate your configuration
2. 🐳 Spin up Docker containers for each version
3. 🤖 Generate AI-powered tests
4. ▶️  Execute tests across all versions
5. 🔍 Analyze differences
6. 💡 Propose remediations

## Step 5: Review Results

The system will pause at the approval stage and show you:

```
Session ID: abc123-def456-ghi789

Remediation Proposals:

ID: rem-001
Title: Update button API usage
Description: Button component API changed in v2.0...

Use 'pixeldust approve abc123-def456-ghi789 rem-001' to continue.
```

## Step 6: Approve and Implement

Review the proposed changes and approve:

```bash
pixeldust approve abc123-def456-ghi789 rem-001
```

The system will:
1. Create a Git branch
2. Apply code changes
3. Commit changes
4. Re-run tests
5. Verify fixes

## Step 7: Generate Report

```bash
pixeldust report abc123-def456-ghi789 --format html
```

Open the generated HTML report to see:
- Visual diffs with highlighted changes
- DOM comparison results
- Performance metrics
- Applied remediations
- Test results

## Common Commands

```bash
# List all sessions
pixeldust list

# Resume a previous session
pixeldust resume <session-id>

# View help
pixeldust --help

# Run with specific versions
pixeldust test --versions 1.0.0,2.0.0,3.0.0

# Use custom config file
pixeldust test --config path/to/config.json
```

## Example Workflow

Here's a complete example testing UI5 components:

```bash
# 1. Initialize
pixeldust init

# 2. Edit config to test specific components
cat > .pixeldustrc.json << 'EOF'
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "components": {
    "include": ["ui5-button", "ui5-input", "ui5-card"]
  },
  "containers": {
    "runtime": "docker",
    "baseImage": "node:18-alpine",
    "resources": { "memory": "2g", "cpu": 2 }
  },
  "testing": {
    "browsers": ["chromium"],
    "viewport": { "width": 1920, "height": 1080 },
    "timeout": 30000,
    "retries": 2
  },
  "analysis": {
    "visualThreshold": 0.1
  },
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929"
  },
  "storage": {
    "type": "local",
    "path": "./data"
  },
  "reporting": {
    "format": ["markdown", "html"],
    "outputPath": "./reports"
  }
}
EOF

# 3. Set API key
export ANTHROPIC_API_KEY="sk-ant-..."

# 4. Run test
pixeldust test

# 5. Wait for approval prompt, then approve
pixeldust approve <session-id> <remediation-id>

# 6. Generate final report
pixeldust report <session-id> --format html

# 7. Open report in browser
open reports/report-<session-id>.html
```

## Troubleshooting

### Docker/Podman Issues

If containers fail to start:

```bash
# Check Docker is running
docker ps

# Check available resources
docker system df

# Clean up old containers
docker system prune
```

### API Key Issues

If you see authentication errors:

```bash
# Verify API key is set
echo $ANTHROPIC_API_KEY

# Test API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

### Out of Memory

If tests fail with OOM errors, increase container memory:

```json
{
  "containers": {
    "resources": {
      "memory": "4g",
      "cpu": 4
    }
  }
}
```

## Next Steps

- Read the [full documentation](./README.md)
- Explore [example configurations](./examples/)
- Check out the [architecture guide](./ARCHITECTURE.md)
- Join our community (Discord link coming soon)

## Getting Help

- 📚 [Documentation](./README.md)
- 🐛 [Report Issues](https://github.com/pixeldust/pixeldust/issues)
- 💬 [Discussions](https://github.com/pixeldust/pixeldust/discussions)

Happy testing! 🚀
