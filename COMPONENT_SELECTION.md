# Component Selection Guide

PixelDust provides flexible ways to control which components are tested. This is especially important for application testing, where you only want to test the components your application actually uses.

## Table of Contents
- [Overview](#overview)
- [Automatic Detection (Recommended)](#automatic-detection-recommended)
- [Manual Specification](#manual-specification)
- [Exclusions](#exclusions)
- [Framework-Only Testing](#framework-only-testing)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

---

## Overview

PixelDust uses a **priority-based approach** to determine which components to test:

1. **Priority 1:** Explicitly included components (via `components.include`)
2. **Priority 2:** Auto-detected components from application code (when `application.path` is set)
3. **Priority 3:** Default component list (framework-only mode)

---

## Automatic Detection (Recommended)

When testing a real application, PixelDust automatically scans your code to find which components you're using.

### How It Works

PixelDust searches for components in:
- **HTML files:** `<ui5-button>`, `<ui5-table>`
- **JavaScript/TypeScript:** `import "@ui5/webcomponents/dist/Button.js"`
- **JSX/TSX files:** `<ui5-input>`, `<ui5-label>`
- **Vue/Svelte:** Component tags in templates

### Configuration

Simply provide your application path:

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 8080
  }
}
```

**No need to specify `components.include`!** PixelDust will automatically detect them.

### What Gets Scanned

- ✅ All source files (`.html`, `.js`, `.ts`, `.jsx`, `.tsx`, `.vue`, `.svelte`)
- ✅ Recursively through directories
- ❌ Skips: `node_modules`, `dist`, `build`, `.git`, `coverage`, `public`

### Example Output

```
[TestGenerationAgent] info: Auto-detecting components from application code
[TestGenerationAgent] info: Detected 6 unique components in application
[TestGenerationAgent] info: Testing 6 components: ui5-button, ui5-input, ui5-label, ui5-table, ui5-table-column, ui5-title
```

---

## Manual Specification

For precise control, explicitly list the components to test:

### Include Specific Components

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "components": {
    "include": [
      "ui5-button",
      "ui5-input",
      "ui5-table"
    ]
  }
}
```

**This overrides automatic detection.** Only the specified components will be tested.

### Use Case: Testing Subset

When you only care about specific components during development:

```json
{
  "components": {
    "include": ["ui5-button"]  // Only test buttons during this run
  }
}
```

---

## Exclusions

Exclude specific components from testing (works with both auto-detection and manual):

```json
{
  "components": {
    "exclude": [
      "ui5-badge",
      "ui5-icon"
    ]
  }
}
```

### Example: Auto-detect but skip some

```json
{
  "application": {
    "path": "./my-app"
  },
  "components": {
    "exclude": [
      "ui5-icon",
      "ui5-avatar"
    ]
  }
}
```

This will:
1. Auto-detect all components in your app
2. Remove `ui5-icon` and `ui5-avatar` from the list
3. Test the remaining components

---

## Framework-Only Testing

When testing the framework without an application, PixelDust uses a default list:

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  }
  // No application or components specified
}
```

**Default components tested:**
- ui5-button
- ui5-input
- ui5-card
- ui5-table
- ui5-list
- ui5-dialog
- ui5-select
- ui5-checkbox

---

## Examples

### Example 1: Full Application Test (Automatic)

**Scenario:** Test your entire application, let PixelDust find components.

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-ui5-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 8080
  }
}
```

**Result:**
```
✓ Auto-detected: ui5-button, ui5-input, ui5-table, ui5-label, ui5-title
✓ Generated tests for 5 components
```

---

### Example 2: Test Only Critical Components

**Scenario:** You only want to test buttons and tables.

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-ui5-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 8080
  },
  "components": {
    "include": ["ui5-button", "ui5-table"]
  }
}
```

**Result:**
```
✓ Using explicitly included components
✓ Testing 2 components: ui5-button, ui5-table
```

---

### Example 3: Auto-detect with Exclusions

**Scenario:** Test all components except icons and badges.

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "application": {
    "path": "./my-ui5-app",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 8080
  },
  "components": {
    "exclude": ["ui5-icon", "ui5-badge", "ui5-avatar"]
  }
}
```

**Result:**
```
✓ Auto-detected: ui5-button, ui5-input, ui5-table, ui5-icon, ui5-label
✓ Excluding: ui5-icon
✓ Testing 4 components: ui5-button, ui5-input, ui5-table, ui5-label
```

---

### Example 4: Framework Evaluation (No Application)

**Scenario:** Compare UI5 versions without a specific application.

```json
{
  "framework": {
    "name": "@ui5/webcomponents",
    "versions": ["1.24.0", "2.0.0"]
  },
  "components": {
    "include": [
      "ui5-button",
      "ui5-input",
      "ui5-card",
      "ui5-table"
    ]
  }
}
```

**Result:**
```
✓ Using explicitly included components
✓ Testing 4 components in isolation
```

---

## Troubleshooting

### No Components Detected

**Problem:** PixelDust reports "No components detected in application"

**Solutions:**

1. **Check application path:**
   ```json
   {
     "application": {
       "path": "./my-app"  // ← Is this correct?
     }
   }
   ```

2. **Verify file structure:**
   ```bash
   ls -la ./my-app/src/  # Should show your source files
   ```

3. **Check component syntax:**

   Make sure components are written as:
   ```html
   <!-- ✓ Correct -->
   <ui5-button>Click</ui5-button>

   <!-- ✗ Won't detect -->
   <Button>Click</Button>
   ```

4. **Manually specify components:**
   ```json
   {
     "components": {
       "include": ["ui5-button", "ui5-input"]
     }
   }
   ```

---

### Testing Wrong Components

**Problem:** PixelDust is testing components you don't use.

**Solution:** Use `exclude`:
```json
{
  "components": {
    "exclude": ["ui5-unwanted-component"]
  }
}
```

---

### Want to See Detection Results

**Enable verbose logging:**
```bash
export LOG_LEVEL=debug
pixeldust test
```

You'll see detailed output:
```
[TestGenerationAgent] debug: Scanning file: ./src/index.html
[TestGenerationAgent] debug: Found component: ui5-button
[TestGenerationAgent] debug: Found component: ui5-table
[TestGenerationAgent] info: Detected 2 unique components in application
```

---

## Supported Frameworks

The component detection works with multiple frameworks:

| Framework | Prefix | Example |
|-----------|--------|---------|
| UI5 Web Components | `ui5-` | `ui5-button` |
| Fluent UI | `fluent-` | `fluent-button` |
| Shoelace | `sl-` | `sl-button` |
| Material Web | `md-` | `md-button` |

---

## Best Practices

1. **Use automatic detection for application testing** - Keeps component list in sync with your code
2. **Use manual `include` for focused testing** - During development when you only care about specific components
3. **Use `exclude` sparingly** - Better to fix/test all components than skip them
4. **Verify detection** - Check logs to ensure all components are found
5. **Keep source organized** - Component detection works best with clean source structure

---

## Summary

| Scenario | Configuration | What Gets Tested |
|----------|---------------|------------------|
| **Application (Auto)** | `application.path` set | Components found in your code |
| **Application (Manual)** | `components.include` set | Only specified components |
| **Application (Exclude)** | `components.exclude` set | Auto-detected minus excluded |
| **Framework Only** | No application/components | Default component list |

---

## Next Steps

- See [APPLICATION_INTEGRATION.md](./APPLICATION_INTEGRATION.md) for full application testing guide
- See [QUICKSTART.md](./QUICKSTART.md) for getting started
- See [FAQ.md](./FAQ.md) for common questions
