# Application Integration Guide

## Current Limitation

⚠️ **Important:** The current PixelDust implementation tests **framework versions in isolation**, not integrated into your actual application. It creates standalone containers with only the framework installed.

## What You Get Now

✅ Framework component comparison across versions
✅ UI5 web components visual regression testing
✅ Breaking change detection in framework APIs
✅ AI-powered migration suggestions

## What's Missing for Full Application Testing

❌ Testing your actual application code
❌ Upgrading dependencies in your existing app
❌ Running your existing unit/integration tests
❌ Fixing broken tests after upgrade

## Roadmap: Application Integration

We're working on these enhancements:

### Phase 1: Application Code Integration
Mount your application into containers and test with different framework versions.

### Phase 2: Dependency Upgrade Agent
Automatically upgrade framework versions in your package.json and handle peer dependencies.

### Phase 3: Test Fixing Agent
Analyze and fix broken unit tests after framework upgrades.

### Phase 4: Full Migration Workflow
End-to-end migration from old version to new with automated fixes.

## Workarounds for Now

### Option 1: Manual Integration
1. Use PixelDust to identify breaking changes between versions
2. Review the AI-generated remediation proposals
3. Manually apply fixes to your application
4. Run your own tests

### Option 2: Custom Container Setup
Modify the EnvironmentAgent to mount your application:

```typescript
// Create custom container with your app
HostConfig: {
  Binds: [
    '/path/to/your/app:/app'  // Mount your application
  ]
},
Cmd: [
  'sh', '-c',
  `cd /app && npm install ${framework}@${version} && npm run build && npm start`
]
```

## Request Full Application Support

If you need full application integration now, please:
1. Star this issue: [#TODO]
2. Describe your use case in discussions
3. Consider contributing!

---

See [ROADMAP.md](./ROADMAP.md) for planned features.
