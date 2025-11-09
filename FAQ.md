# Frequently Asked Questions

## Current Implementation

### Q1: How does this system run in an existing application?

**A: It currently doesn't integrate directly with your application.**

**What PixelDust v0.1.0 Does:**
- Creates isolated containers for each framework version
- Installs ONLY the framework (e.g., `ui5-webcomponents@1.24.0`)
- Tests the framework components in isolation
- Compares behavior across versions

**What Happens in Practice:**

```bash
# Container 1: Framework v1.24.0
npm install ui5-webcomponents@1.24.0
npx http-server  # Serves basic HTML with components

# Container 2: Framework v2.0.0
npm install ui5-webcomponents@2.0.0
npx http-server  # Serves basic HTML with components

# System compares the two
```

**Your application code is NOT tested.**

**Workaround Today:**
1. Run PixelDust to identify framework breaking changes
2. Review AI-generated migration recommendations
3. Manually apply fixes to YOUR application
4. Run YOUR test suite

**Coming Soon (Phase 1 - see ENHANCEMENT_PLAN.md):**
- Mount your application code into containers
- Build your app with each framework version
- Test your actual application, not just the framework

```typescript
// Planned enhancement:
Cmd: [
  'sh', '-c', `
    cd /app                                    # Your application
    npm install ui5-webcomponents@${version}   # Upgrade framework
    npm run build                              # Build YOUR app
    npm start                                  # Run YOUR app
  `
]
```

---

### Q2: How does this system upgrade library in the application being tested?

**A: It doesn't upgrade libraries in your application.**

**Current Behavior:**
- Each container has a FRESH install of just the framework
- No package.json modification
- No dependency resolution
- No peer dependency handling

**What You Get:**
- Comparison report showing what changed between versions
- AI-generated recommendations for migration
- Code snippets showing proposed fixes

**What You Must Do Manually:**
```bash
# In YOUR application:
1. Update package.json
   "ui5-webcomponents": "2.0.0"

2. Update peer dependencies if needed

3. Run npm install

4. Fix any build/runtime errors

5. Fix broken tests

6. Deploy
```

**Coming Soon (Phase 2 - see ENHANCEMENT_PLAN.md):**

New **DependencyUpgradeAgent** will:
```typescript
// Automatically:
1. Read your package.json
2. Upgrade target framework version
3. Resolve peer dependencies
4. Detect conflicts
5. Update package.json
6. Run npm install
7. Report any issues

// Example:
await dependencyAgent.upgrade({
  framework: 'ui5-webcomponents',
  from: '1.24.0',
  to: '2.0.0',
  updatePeers: true
});

// Result:
{
  upgraded: 'ui5-webcomponents',
  from: '1.24.0',
  to: '2.0.0',
  peerDepsUpdated: {
    '@ui5/webcomponents-base': '2.0.0',
    '@ui5/webcomponents-theming': '2.0.0'
  },
  conflicts: [],
  breakingChanges: [...]
}
```

---

### Q3: Does this system have agents that fix broken unit tests?

**A: No, not yet. This is the #1 planned enhancement.**

**Current Agents:**
- ✅ **TestGenerationAgent** - Creates NEW Playwright tests (for framework comparison)
- ✅ **AnalysisAgent** - Compares UI across versions
- ✅ **RemediationAgent** - Proposes code fixes
- ❌ **TestFixingAgent** - Does NOT exist yet

**Current Workflow for Tests:**
```bash
# After framework upgrade in your app:
1. Your existing tests fail
2. You manually read error messages
3. You manually fix tests
4. You re-run tests
5. Repeat until all pass
```

**Coming Soon (Phase 3 - CRITICAL feature):**

New **TestFixingAgent** will:
```typescript
// 1. Run your existing test suite
const results = await runTests('npm test');

// 2. Identify failures
const failures = results.filter(t => t.status === 'failed');
// Example: 47 failing tests

// 3. For each failure, use AI to generate fix
for (const failure of failures) {
  const fix = await ai.generateTestFix({
    testCode: failure.code,
    error: failure.error,
    frameworkChanges: migrationGuide,
    oldVersion: '1.24.0',
    newVersion: '2.0.0'
  });

  // 4. Apply fix
  await applyFix(fix);
}

// 5. Re-run tests
const verifyResults = await runTests('npm test');
// Result: 47 tests now passing
```

**AI-Powered Test Fixing Example:**

```typescript
// Before (failing test):
test('button renders correctly', () => {
  const button = screen.getByRole('button');
  expect(button).toHaveClass('ui5-button');  // ❌ Class name changed
});

// AI analyzes:
// - Test error: "Expected element to have class 'ui5-button' but found 'ui5-button-root'"
// - Framework migration guide: "Button component CSS classes renamed"
// - Breaking change: ui5-button → ui5-button-root

// AI generates fix:
test('button renders correctly', () => {
  const button = screen.getByRole('button');
  expect(button).toHaveClass('ui5-button-root');  // ✅ Fixed
});

// Apply and verify:
// ✅ Test now passes
```

**More Complex Example:**

```typescript
// Before (failing test):
test('dialog opens on click', async () => {
  const dialog = screen.getByRole('dialog');
  await userEvent.click(screen.getByText('Open'));
  expect(dialog.isOpen()).toBe(true);  // ❌ API changed
});

// AI analyzes:
// - Error: "dialog.isOpen is not a function"
// - Migration guide: "Dialog API changed: isOpen() → open property"
// - Breaking change: Method removed, use property instead

// AI generates fix:
test('dialog opens on click', async () => {
  const dialog = screen.getByRole('dialog');
  await userEvent.click(screen.getByText('Open'));
  expect(dialog.open).toBe(true);  // ✅ Fixed: isOpen() → open
});
```

---

## Summary Table

| Feature | v0.1.0 (Current) | Planned (6-8 weeks) |
|---------|------------------|---------------------|
| Test framework in isolation | ✅ Yes | ✅ Yes |
| Test YOUR application | ❌ No | ✅ Yes (Phase 1) |
| Upgrade dependencies | ❌ No | ✅ Yes (Phase 2) |
| Fix broken tests | ❌ No | ✅ Yes (Phase 3) |
| Generate NEW tests | ✅ Yes | ✅ Yes |
| Visual regression | ✅ Yes | ✅ Yes |
| AI recommendations | ✅ Yes | ✅ Yes |
| Auto-apply fixes | ✅ Partial* | ✅ Full |

*Currently auto-applies fixes to demo code, not your application

---

## What Should I Use PixelDust For Today?

### ✅ Great Use Cases (v0.1.0):

1. **Evaluate Framework Upgrades**
   - "Should I upgrade from UI5 1.x to 2.x?"
   - Get detailed breaking change analysis

2. **Framework Selection**
   - "Should I use version 1.24 or 2.0 for my new project?"
   - See differences side-by-side

3. **Migration Planning**
   - "What will break if I upgrade?"
   - Get AI-generated migration strategy

4. **Visual Regression Testing**
   - "Do components look different in the new version?"
   - Pixel-perfect comparison with diffs

5. **Learning Tool**
   - "How has this framework evolved?"
   - See API changes, visual changes, performance changes

### ❌ Not Ready For (Yet):

1. **Automated Application Migration**
   - Upgrading your production app automatically
   - Need Phase 1-3 enhancements

2. **Test Suite Maintenance**
   - Auto-fixing your tests after upgrade
   - Need TestFixingAgent (Phase 3)

3. **Continuous Integration**
   - Running in CI to block breaking upgrades
   - Need application integration

---

## How to Get Full Application Support

### Option 1: Wait for Official Support (6-8 weeks)
Track progress: [ENHANCEMENT_PLAN.md](./ENHANCEMENT_PLAN.md)

### Option 2: Contribute!
We need help with:
- ApplicationLoaderAgent implementation
- DependencyUpgradeAgent implementation
- TestFixingAgent AI tuning

See [CONTRIBUTING.md](./CONTRIBUTING.md)

### Option 3: Sponsor Priority Development
Contact the team to sponsor specific features

### Option 4: Use Current Version + Manual Steps
1. Use PixelDust for analysis
2. Manually apply to your app
3. Still saves significant time!

---

## Timeline

```
v0.1.0 (Current - Nov 2024)
├─ Framework comparison ✅
├─ Visual regression ✅
├─ AI recommendations ✅
└─ Podman support ✅

v0.2.0 (Planned - Jan 2025)
├─ Application integration
├─ Dependency upgrades
└─ Test fixing

v0.3.0 (Planned - Feb 2025)
├─ Full automation
├─ CI/CD integration
└─ Multi-framework support
```

---

## More Questions?

- 📚 [Documentation](./README.md)
- 🏗️ [Enhancement Plan](./ENHANCEMENT_PLAN.md)
- 🔧 [Application Integration](./APPLICATION_INTEGRATION.md)
- 🐛 [Issues](https://github.com/pixeldust/pixeldust/issues)
- 💬 [Discussions](https://github.com/pixeldust/pixeldust/discussions)
