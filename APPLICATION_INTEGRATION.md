# Application Integration Guide

## ✅ FULLY IMPLEMENTED (v0.2.0)

**Great news!** Full application integration is now available in PixelDust v0.2.0.

## What You Get Now

✅ **Application Code Integration** - Test your actual application, not just framework in isolation
✅ **Automatic Dependency Upgrades** - Updates package.json and resolves peer dependencies
✅ **AI-Powered Test Fixing** - Automatically fixes broken tests after upgrades
✅ **Full Migration Workflow** - End-to-end automated migration

## Quick Start

### 1. Add Application Config

Update your `.pixeldustrc.json`:

```json
{
  "framework": {
    "name": "ui5-webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "testCommand": "npm test",
    "port": 8080
  },
  "upgrade": {
    "updatePeerDependencies": true,
    "fixTests": true
  }
}
```

### 2. Run PixelDust

```bash
pixeldust test --config .pixeldustrc.json
```

### 3. System Will Automatically:

1. ✅ Load your application into containers
2. ✅ Build with version 1.24.0 (baseline)
3. ✅ Build with version 2.0.0 (target)
4. ✅ Run tests on both versions
5. ✅ Analyze differences
6. ✅ Update package.json to 2.0.0
7. ✅ Fix broken tests with AI
8. ✅ Propose code remediations
9. ✅ Wait for your approval
10. ✅ Apply all fixes
11. ✅ Verify everything works

## How It Works

### ApplicationLoaderAgent
- Mounts your application code into containers
- Validates package.json and dependencies
- Builds your app with each framework version
- Starts your application for testing

### DependencyUpgradeAgent
- Reads your package.json
- Upgrades framework to target version
- Resolves peer dependencies automatically
- Handles version conflicts
- Runs `npm install` with validation

### TestFixingAgent
- Runs your existing test suite
- Parses test failures (Jest/Vitest)
- Uses AI to analyze failures
- Generates targeted fixes
- Applies fixes and re-runs tests
- Iterates until tests pass

## Configuration Reference

### Application Config

```typescript
{
  application: {
    path: string;              // Path to your application
    buildCommand: string;      // e.g., "npm run build"
    startCommand: string;      // e.g., "npm start"
    testCommand?: string;      // e.g., "npm test" (optional)
    port: number;              // Application port
    testPaths?: string[];      // Test file patterns
    sourcePaths?: string[];    // Source file patterns
  }
}
```

### Upgrade Config

```typescript
{
  upgrade: {
    updatePeerDependencies: boolean;    // Auto-update peer deps
    resolveConflicts?: 'auto' | 'manual';
    fixTests: boolean;                  // Enable AI test fixing
    testTimeout?: number;               // Test timeout in ms
    incremental?: boolean;              // Upgrade one major version at a time
    createBranches?: boolean;           // Create git branches
  }
}
```

## Example: Complete Application Migration

```bash
# 1. Create config
cat > .pixeldustrc.json <<EOF
{
  "framework": {
    "name": "ui5-webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-ui5-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "testCommand": "npm test",
    "port": 8080
  },
  "upgrade": {
    "updatePeerDependencies": true,
    "fixTests": true,
    "createBranches": true
  },
  "containers": {
    "runtime": "docker",
    "baseImage": "node:18-alpine",
    "resources": { "memory": "4g", "cpu": 4 }
  },
  "ai": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929"
  }
}
EOF

# 2. Run migration
export ANTHROPIC_API_KEY="your-key"
pixeldust test

# 3. Review results
# System will pause for approval at AWAITING_APPROVAL state

# 4. Approve fixes
pixeldust approve <session-id> <remediation-id>

# 5. Done! Your app is migrated.
```

## What Gets Modified

### Your package.json
```json
{
  "dependencies": {
    "ui5-webcomponents": "2.0.0",  // ← Upgraded
    "@ui5/webcomponents-base": "2.0.0",  // ← Peer dep updated
    "@ui5/webcomponents-theming": "2.0.0"  // ← Peer dep updated
  }
}
```

### Your Test Files
```typescript
// Before (failing):
expect(button).toHaveClass('ui5-button');

// After (fixed by AI):
expect(button).toHaveClass('ui5-button-root');
```

### Your Application Code
- Proposed fixes for breaking changes
- API migration code
- Import path updates

## Real-World Example Output

```
[ApplicationLoader] Loading application from ./my-ui5-app
[ApplicationLoader] Validating package.json ✓
[ApplicationLoader] Creating workspace for version 1.24.0
[ApplicationLoader] Creating workspace for version 2.0.0
[ApplicationLoader] Building containers...
[ApplicationLoader] ✓ Container 1: my-app@1.24.0 on http://localhost:8080
[ApplicationLoader] ✓ Container 2: my-app@2.0.0 on http://localhost:8081

[Analysis] Found 15 visual differences
[Analysis] Found 8 DOM structure changes

[DependencyUpgrade] Upgrading ui5-webcomponents: 1.24.0 → 2.0.0
[DependencyUpgrade] Resolving peer dependencies...
[DependencyUpgrade] Updating package.json ✓
[DependencyUpgrade] Running npm install... ✓

[TestFixing] Running test suite: npm test
[TestFixing] ✗ 47 tests failed
[TestFixing] Analyzing failures with AI...
[TestFixing] Generated 47 fixes (avg confidence: 0.89)
[TestFixing] Applying fixes...
[TestFixing] Re-running tests...
[TestFixing] ✓ 47 tests now passing!

[Remediation] Proposing code fixes...
[Orchestrator] Awaiting approval...
```

## Troubleshooting

### Build Failures

If your app fails to build in containers:

```json
{
  "application": {
    "buildCommand": "npm ci && npm run build",  // Force clean install
    "port": 8080
  },
  "containers": {
    "resources": {
      "memory": "8g",  // Increase memory
      "cpu": 4
    }
  }
}
```

### Test Timeout

If tests take too long:

```json
{
  "upgrade": {
    "testTimeout": 600000  // 10 minutes
  }
}
```

### Low Confidence Fixes

Test fixing skips fixes with confidence < 0.5. To see all attempted fixes:

```bash
pixeldust report <session-id> --format json
```

## See Also

- [examples/application-full.config.json](./examples/application-full.config.json) - Complete example
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [FAQ.md](./FAQ.md) - Common questions

## Support

Having issues with application integration?

1. Check [FAQ.md](./FAQ.md)
2. Review example config: `examples/application-full.config.json`
3. Open an issue: https://github.com/pixeldust/pixeldust/issues

---

**Application integration is now production-ready!** 🎉
