# Troubleshooting Guide

Common issues and solutions when using PixelDust.

## Table of Contents
- [Playwright Browsers Not Installed](#playwright-browsers-not-installed)
- [Configuration File Not Found](#configuration-file-not-found)
- [Container Runtime Issues](#container-runtime-issues)
- [Component Detection Issues](#component-detection-issues)
- [Memory Issues](#memory-issues)

---

## Playwright Browsers Not Installed

### Symptoms
```
browserType.launch: Executable doesn't exist at /path/to/chromium
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║     npx playwright install                                              ║
╚═════════════════════════════════════════════════════════════════════════╝
```

### Cause
Playwright requires browser binaries to be downloaded separately. These are not included in the npm package.

### Solutions

#### Option 1: Install Chromium Only (Recommended)
```bash
cd /path/to/your/pixeldust
npx playwright install chromium
```

**Why Chromium only?**
- Fastest to download (~150MB vs ~450MB for all browsers)
- Sufficient for most testing scenarios
- Can always add more later

#### Option 2: Install All Browsers
```bash
npx playwright install
```

This installs:
- Chromium (~150MB)
- Firefox (~85MB)
- WebKit (~200MB)

#### Option 3: Install with System Dependencies
If you're on Linux and need system libraries:
```bash
npx playwright install chromium --with-deps
```

#### Option 4: Skip Browser Check (Not Recommended)
```bash
pixeldust test --skip-browser-check
```

⚠️ This will skip the check but tests will still fail if browsers aren't installed.

### Automatic Installation

PixelDust attempts to install Chromium automatically during `npm install`. If this fails:

1. **Check npm output** for postinstall errors
2. **Install manually** using the commands above
3. **Check permissions** - you may need sudo on Linux

### Verify Installation

Check if browsers are installed:
```bash
npx playwright install --dry-run
```

Check specific browser:
```bash
npx playwright install chromium --dry-run
```

---

## Configuration File Not Found

### Symptoms
```
Error: No configuration file found. Run "pixeldust init" to create one.
```

### Cause
PixelDust looks for `.pixeldustrc.json` in the current directory using cosmiconfig.

### Solutions

#### Option 1: Run Init Command
```bash
pixeldust init
```

This creates `.pixeldustrc.json` with default settings.

#### Option 2: Create Config Manually
Create `.pixeldustrc.json`:
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
  }
}
```

#### Option 3: Specify Config Path
```bash
pixeldust test --config /path/to/config.json
```

### Supported Config Filenames

Cosmiconfig searches for these (in order):
1. `.pixeldustrc.json`
2. `.pixeldustrc.yaml`
3. `.pixeldustrc.yml`
4. `pixeldust.config.js`
5. `"pixeldust"` key in package.json

---

## Container Runtime Issues

### Docker Not Running

**Symptoms:**
```
Error: connect ECONNREFUSED /var/run/docker.sock
```

**Solution:**
```bash
# Check if Docker is running
docker ps

# Start Docker
# macOS: Open Docker Desktop
# Linux: sudo systemctl start docker
```

### Podman Socket Not Found

**Symptoms:**
```
Error: ENOENT: no such file or directory, open '/run/podman/podman.sock'
```

**Solutions:**

For rootless Podman:
```bash
# Start Podman socket
systemctl --user start podman.socket

# Enable on boot
systemctl --user enable podman.socket

# Verify
podman info
```

For rootful Podman:
```bash
sudo systemctl start podman.socket
sudo systemctl enable podman.socket
```

See [PODMAN.md](./PODMAN.md) for comprehensive Podman setup.

### Permission Denied

**Symptoms:**
```
Error: Got permission denied while trying to connect to the Docker daemon socket
```

**Solutions:**

For Docker:
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker ps
```

For Podman:
```bash
# Use rootless mode (recommended)
podman info --debug

# Or run with sudo (not recommended)
sudo pixeldust test
```

---

## Component Detection Issues

### No Components Detected

**Symptoms:**
```
[TestGenerationAgent] warn: No components detected in application, falling back to default list
```

**Cause:**
Component scanner couldn't find any components in your application code.

**Solutions:**

#### Check Application Path
```json
{
  "application": {
    "path": "./src"  // ← Is this correct?
  }
}
```

Verify:
```bash
ls -la ./src
```

#### Check Component Syntax
Make sure components are written correctly:

✅ **Correct:**
```html
<ui5-button>Click</ui5-button>
<ui5-table></ui5-table>
```

```js
import "@ui5/webcomponents/dist/Button.js";
```

❌ **Won't Detect:**
```html
<Button>Click</Button>  <!-- Generic, not ui5-prefixed -->
```

#### Manually Specify Components
Override auto-detection:
```json
{
  "components": {
    "include": ["ui5-button", "ui5-input", "ui5-table"]
  }
}
```

#### Enable Debug Logging
```bash
export LOG_LEVEL=debug
pixeldust test
```

Check output for:
```
[TestGenerationAgent] debug: Scanning file: ./src/index.html
[TestGenerationAgent] debug: Found component: ui5-button
```

### Wrong Components Detected

**Symptoms:**
Components you don't use are being tested.

**Solutions:**

#### Use Exclusions
```json
{
  "components": {
    "exclude": ["ui5-icon", "ui5-badge"]
  }
}
```

#### Override with Include
```json
{
  "components": {
    "include": ["ui5-button", "ui5-table"]  // Only these
  }
}
```

See [COMPONENT_SELECTION.md](./COMPONENT_SELECTION.md) for details.

---

## Memory Issues

### Container Out of Memory

**Symptoms:**
```
Error: Container killed due to memory limit
```

**Solutions:**

#### Increase Memory Limit
```json
{
  "containers": {
    "resources": {
      "memory": "4g",  // Increase from 2g
      "cpu": 4
    }
  }
}
```

#### Check Docker Memory Allocation
```bash
docker info | grep Memory
```

On macOS/Windows, increase Docker Desktop memory allocation:
- Docker Desktop → Settings → Resources → Memory

#### Reduce Concurrent Tests
Test fewer versions at once:
```json
{
  "framework": {
    "versions": ["1.24.0"]  // Test one at a time
  }
}
```

### Node.js Out of Memory

**Symptoms:**
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Solution:**
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
pixeldust test
```

Or add to package.json:
```json
{
  "scripts": {
    "test": "NODE_OPTIONS='--max-old-space-size=4096' pixeldust test"
  }
}
```

---

## API Key Issues

### Anthropic API Key Not Found

**Symptoms:**
```
Error: ANTHROPIC_API_KEY is required
```

**Solutions:**

#### Set Environment Variable
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
pixeldust test
```

#### Add to Config
```json
{
  "ai": {
    "provider": "anthropic",
    "apiKey": "sk-ant-..."
  }
}
```

⚠️ **Don't commit API keys to version control!**

#### Use .env File
Create `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Load with:
```bash
source .env
pixeldust test
```

---

## Network Issues

### Container Can't Reach Host

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:8080
```

**Cause:**
Container trying to reach application on host machine.

**Solutions:**

#### For Docker on macOS/Windows
Use `host.docker.internal`:
```json
{
  "application": {
    "startCommand": "npm start",
    "port": 8080  // PixelDust handles host.docker.internal
  }
}
```

#### For Docker on Linux
Use `--network host`:
```json
{
  "containers": {
    "network": {
      "mode": "host"
    }
  }
}
```

#### For Podman
Rootless Podman has direct host access.

---

## Build Issues

### TypeScript Compilation Errors

**Symptoms:**
```
error TS2688: Cannot find type definition file for 'node'
```

**Solution:**
```bash
npm install --save-dev @types/node @types/jest
npm run build
```

### Missing Dependencies

**Symptoms:**
```
Error: Cannot find module 'playwright'
```

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## Test Execution Issues

### Tests Timeout

**Symptoms:**
```
Error: Test timeout of 30000ms exceeded
```

**Solutions:**

#### Increase Timeout
```json
{
  "testing": {
    "timeout": 60000  // 60 seconds
  }
}
```

#### Check Application Startup Time
```bash
# Time how long your app takes to start
time npm start
```

Adjust timeout accordingly.

#### Reduce Viewport Size
Smaller viewport = faster rendering:
```json
{
  "testing": {
    "viewport": {
      "width": 1280,
      "height": 720
    }
  }
}
```

### Screenshot Failures

**Symptoms:**
```
Error: expect(locator).toHaveScreenshot() failed
```

**Cause:**
Visual differences detected between versions.

**Solutions:**

#### Adjust Visual Threshold
```json
{
  "analysis": {
    "visualThreshold": 0.2  // Allow 20% difference
  }
}
```

#### Review Screenshots
Check generated screenshots in:
```
./pixeldust-reports/screenshots/
```

#### Update Baseline
If differences are acceptable, update baseline images.

---

## Database Issues

### SQLite Lock Error

**Symptoms:**
```
Error: SQLITE_BUSY: database is locked
```

**Cause:**
Another PixelDust process is running.

**Solutions:**

#### Check for Running Processes
```bash
ps aux | grep pixeldust
```

Kill if needed:
```bash
kill -9 <pid>
```

#### Clean Database
```bash
rm -rf ./data/*.db
pixeldust test
```

---

## Getting More Help

### Enable Debug Logging
```bash
export LOG_LEVEL=debug
pixeldust test
```

### Check Log Files
```bash
cat ./pixeldust.log
```

### Report Issues
If you found a bug:

1. Check existing issues: https://github.com/dkris/pixeldust/issues
2. Create new issue with:
   - Error message
   - Configuration file
   - Steps to reproduce
   - System info (OS, Node version, Docker/Podman version)

### Community Support
- GitHub Discussions: https://github.com/dkris/pixeldust/discussions
- Documentation: [README.md](./README.md)

---

## Quick Reference

| Error | Quick Fix |
|-------|-----------|
| Playwright browsers missing | `npx playwright install chromium` |
| Config not found | `pixeldust init` |
| Docker not running | Start Docker Desktop |
| Permission denied | `sudo usermod -aG docker $USER` |
| Out of memory | Increase `containers.resources.memory` |
| Tests timeout | Increase `testing.timeout` |
| No components detected | Add `components.include` |
| API key missing | `export ANTHROPIC_API_KEY=...` |

---

## Still Stuck?

1. **Read the error message carefully** - It often contains the solution
2. **Check this guide** - Most common issues are covered
3. **Enable debug logging** - See what's happening under the hood
4. **Search issues** - Someone may have had the same problem
5. **Ask for help** - Create an issue or discussion

Remember: Clear error messages and logs help us help you faster!
