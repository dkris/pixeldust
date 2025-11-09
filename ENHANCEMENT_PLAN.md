# Enhancement Plan: Full Application Upgrade Support

## Current Gaps

The current PixelDust implementation has these limitations:

| Feature | Current Status | Needed For Production |
|---------|---------------|----------------------|
| Test framework in isolation | ✅ Implemented | Framework evaluation |
| Test real application | ❌ Missing | Production upgrades |
| Upgrade dependencies | ❌ Missing | Automated migration |
| Fix broken unit tests | ❌ Missing | Zero-downtime upgrades |
| Handle peer dependencies | ❌ Missing | Complex applications |
| Incremental migration | ❌ Missing | Large codebases |

## Enhancement Roadmap

### Phase 1: Application Code Integration (High Priority)

**Goal:** Test your actual application with different framework versions

**New Agent: Application Loader Agent**

```typescript
export class ApplicationLoaderAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { appPath, version } = context;

    // 1. Clone/copy application to temporary directory
    const workDir = await this.createWorkspace(appPath);

    // 2. Create Dockerfile for application
    const dockerfile = this.generateDockerfile(version, context.config);

    // 3. Build container with application code
    const container = await this.buildAppContainer(workDir, dockerfile);

    // 4. Verify application builds successfully
    await this.verifyBuild(container);

    return this.success({ container, workDir });
  }

  private generateDockerfile(version: string, config: any): string {
    return `
      FROM ${config.containers.baseImage}

      WORKDIR /app

      # Copy application code
      COPY package.json package-lock.json ./
      COPY src ./src
      COPY public ./public

      # Install dependencies with specific framework version
      RUN npm install
      RUN npm install ${config.framework.name}@${version}

      # Build application
      RUN npm run build

      EXPOSE 3000
      CMD ["npm", "start"]
    `;
  }
}
```

**Configuration:**

```json
{
  "application": {
    "path": "./my-app",                    // Path to your app
    "buildCommand": "npm run build",       // How to build
    "startCommand": "npm start",           // How to start
    "testCommand": "npm test",             // How to test
    "port": 3000                           // App port
  },
  "framework": {
    "name": "ui5-webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  }
}
```

### Phase 2: Dependency Upgrade Agent (High Priority)

**Goal:** Automatically upgrade framework version in package.json

**New Agent: Dependency Upgrade Agent**

```typescript
export class DependencyUpgradeAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { appPath, targetVersion, framework } = context;

    // 1. Read current package.json
    const pkg = await this.readPackageJson(appPath);
    const currentVersion = pkg.dependencies[framework];

    // 2. Check for breaking changes
    const breakingChanges = await this.checkBreakingChanges(
      framework,
      currentVersion,
      targetVersion
    );

    // 3. Resolve peer dependencies
    const peerDeps = await this.resolvePeerDependencies(
      framework,
      targetVersion
    );

    // 4. Check for conflicts
    const conflicts = await this.detectConflicts(pkg, peerDeps);

    if (conflicts.length > 0) {
      return this.proposeConflictResolution(conflicts);
    }

    // 5. Update package.json
    pkg.dependencies[framework] = targetVersion;
    for (const [dep, ver] of Object.entries(peerDeps)) {
      pkg.dependencies[dep] = ver;
    }

    await this.writePackageJson(appPath, pkg);

    // 6. Run npm install
    const installResult = await this.runNpmInstall(appPath);

    return this.success({
      upgraded: framework,
      from: currentVersion,
      to: targetVersion,
      peerDepsUpdated: peerDeps,
      breakingChanges
    });
  }

  private async resolvePeerDependencies(
    framework: string,
    version: string
  ): Promise<Record<string, string>> {
    // Use npm view to get peer dependencies
    const { stdout } = await exec(
      `npm view ${framework}@${version} peerDependencies --json`
    );
    return JSON.parse(stdout);
  }
}
```

### Phase 3: Test Fixing Agent (Critical for Automation)

**Goal:** Automatically fix broken unit tests after upgrade

**New Agent: Test Fixing Agent**

```typescript
export class TestFixingAgent extends BaseAgent {
  private ai: Anthropic;

  async execute(context: AgentContext): Promise<AgentResult> {
    const { appPath, testCommand } = context;

    // 1. Run existing tests
    this.logger.info('Running existing test suite...');
    const testResults = await this.runTests(appPath, testCommand);

    if (testResults.allPassed) {
      return this.success({ message: 'All tests pass!' });
    }

    // 2. Analyze failures
    this.logger.info(`Found ${testResults.failures.length} failing tests`);

    const fixes: TestFix[] = [];

    // 3. For each failure, generate fix using AI
    for (const failure of testResults.failures) {
      const fix = await this.generateTestFix(failure, context);
      fixes.push(fix);
    }

    // 4. Apply fixes
    for (const fix of fixes) {
      await this.applyTestFix(fix);
    }

    // 5. Re-run tests to verify
    const verifyResults = await this.runTests(appPath, testCommand);

    return this.success({
      fixedTests: fixes.length,
      stillFailing: verifyResults.failures.length,
      fixes
    });
  }

  private async generateTestFix(
    failure: TestFailure,
    context: AgentContext
  ): Promise<TestFix> {
    // Read the test file
    const testCode = await fs.readFile(failure.filePath, 'utf-8');

    // Get framework migration guide
    const migrationGuide = await this.getMigrationGuide(
      context.framework,
      context.oldVersion,
      context.newVersion
    );

    const prompt = `You are an expert at fixing tests after framework upgrades.

Framework: ${context.framework}
Upgrade: ${context.oldVersion} → ${context.newVersion}

Test file: ${failure.filePath}
Failing test: ${failure.testName}

Test code:
\`\`\`typescript
${testCode}
\`\`\`

Error:
\`\`\`
${failure.error}
${failure.stackTrace}
\`\`\`

Migration guide:
${migrationGuide}

Generate a fix for this test. Return JSON:
{
  "analysis": "Why the test is failing",
  "changes": [
    {
      "type": "import" | "assertion" | "setup" | "API",
      "before": "old code",
      "after": "new code",
      "reason": "why this change is needed"
    }
  ],
  "confidence": 0-1
}`;

    const response = await this.ai.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const fix = this.parseAIResponse(response);

    return {
      filePath: failure.filePath,
      testName: failure.testName,
      ...fix
    };
  }

  private async runTests(
    appPath: string,
    testCommand: string
  ): Promise<TestResults> {
    try {
      const { stdout, stderr } = await exec(testCommand, { cwd: appPath });
      return this.parseTestResults(stdout, stderr);
    } catch (error) {
      // Tests failed, parse the output
      return this.parseTestResults(error.stdout, error.stderr);
    }
  }
}
```

### Phase 4: Enhanced Orchestrator Workflow

**New State Machine:**

```
IDLE
  ↓
LOADING_APPLICATION (copy app code)
  ↓
DEPENDENCY_ANALYSIS (check current versions)
  ↓
ENVIRONMENT_SETUP (create containers with app)
  ↓
BUILD_VERIFICATION (ensure app builds with each version)
  ↓
TEST_EXECUTION (run existing tests + generate new Playwright tests)
  ↓
ANALYSIS (compare UI + test results)
  ↓
DEPENDENCY_UPGRADE (update package.json for target version)
  ↓
TEST_FIXING (fix broken tests)
  ↓
REMEDIATION_PROPOSAL (propose code changes)
  ↓
AWAITING_APPROVAL
  ↓
IMPLEMENTING (apply all fixes)
  ↓
VERIFICATION (re-run all tests)
  ↓
COMPLETE
```

## Configuration Schema Updates

```typescript
interface EnhancedConfig extends Config {
  application: {
    path: string;              // Path to your application
    entryPoint?: string;       // e.g., "src/index.ts"
    buildCommand: string;      // "npm run build"
    startCommand: string;      // "npm start"
    testCommand: string;       // "npm test"
    port: number;              // Application port

    // Files to test
    testPaths?: string[];      // ["src/**/*.test.ts"]

    // Files to analyze for changes
    sourcePaths?: string[];    // ["src/**/*.tsx"]

    // Package.json location
    packageJson?: string;      // Default: "./package.json"
  };

  upgrade: {
    // Dependency handling
    updatePeerDependencies: boolean;
    resolveConflicts: 'auto' | 'manual';

    // Test handling
    fixTests: boolean;
    testTimeout: number;

    // Migration strategy
    incremental: boolean;      // Upgrade one major version at a time
    createBranches: boolean;   // Create git branch per version
  };
}
```

## Implementation Priority

### High Priority (Needed for MVP)
1. ✅ Application Loader Agent - Load real app code
2. ✅ Dependency Upgrade Agent - Modify package.json
3. ✅ Test Fixing Agent - Fix broken tests
4. ✅ Enhanced container setup - Mount application code

### Medium Priority (Nice to have)
5. Peer dependency resolution
6. Incremental migration (major version by version)
7. Git branch management
8. Rollback capabilities

### Low Priority (Future)
9. Code transformation beyond tests
10. Performance optimization suggestions
11. Bundle size analysis
12. Automated documentation updates

## Example: Full Application Upgrade

```bash
# 1. Initialize with application
pixeldust init --app ./my-ui5-app

# 2. Configure
cat > pixeldust.config.json <<EOF
{
  "application": {
    "path": "./my-ui5-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "testCommand": "npm test",
    "port": 8080
  },
  "framework": {
    "name": "ui5-webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "upgrade": {
    "updatePeerDependencies": true,
    "fixTests": true,
    "createBranches": true
  }
}
EOF

# 3. Run upgrade
pixeldust upgrade --from 1.24.0 --to 2.0.0

# System will:
# - Load your application
# - Test with version 1.24.0 (baseline)
# - Test with version 2.0.0 (target)
# - Identify breaking changes
# - Update package.json
# - Fix broken tests
# - Propose code changes
# - Wait for approval
# - Apply all changes
# - Verify everything works
# - Create PR with changes
```

## Timeline Estimate

- **Phase 1** (Application Integration): 1-2 weeks
- **Phase 2** (Dependency Upgrade): 1 week
- **Phase 3** (Test Fixing): 2-3 weeks (AI tuning needed)
- **Phase 4** (Enhanced Orchestrator): 1 week

**Total: ~6-8 weeks for full implementation**

## Alternative: Quick Win Approach

For immediate value, implement a **hybrid workflow**:

1. User runs PixelDust on framework in isolation (current capability)
2. System identifies breaking changes
3. System generates migration guide
4. User manually applies changes to their app
5. User runs their own tests
6. System provides test-fixing assistance via CLI

This gives 80% of the value with 20% of the effort.

---

## Contributing

If you need these features, please:
1. 👍 React to this issue: [#TODO]
2. Share your use case
3. Consider contributing!

Priority will be based on community demand.
