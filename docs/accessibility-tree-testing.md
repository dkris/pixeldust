# Accessibility Tree-Based Testing

## Overview

PixelDust now includes comprehensive accessibility tree-based testing to provide semantic understanding of UI elements and validate WCAG 2.2 compliance. This feature enhances the testing framework with structured accessibility data that is optimized for LLM analysis.

## Benefits

✅ **LLM-Optimized Data**: Structured accessibility trees provide clear semantic information without requiring vision models
✅ **Semantic Understanding**: Better comprehension of UI components through their accessibility roles and properties
✅ **Native Accessibility Validation**: Built-in WCAG 2.2 compliance checking using axe-core
✅ **Reduced Ambiguity**: Element identification based on semantic selectors (roles, labels) rather than CSS selectors
✅ **Smaller Payloads**: Accessibility trees are more compact than screenshots while providing rich semantic data

## Architecture

### 1. Accessibility Snapshot Collection

**File**: `src/services/accessibility/snapshot-collector.ts`

The `AccessibilitySnapshotCollector` service captures the accessibility tree from web pages using:
- **Playwright's Accessibility API**: Extracts the native accessibility tree
- **axe-core Integration**: Runs WCAG 2.2 Level AA compliance checks
- **Tree Comparison**: Identifies differences between accessibility trees across versions

#### Key Methods:

```typescript
// Capture accessibility tree with WCAG validation
const tree = await accessibilityCollector.capture(page, 'AA');

// Get simplified tree for LLM consumption
const simplified = accessibilityCollector.getSimplifiedTree(tree);

// Compare two trees
const diff = accessibilityCollector.compareNodes(baseNode, targetNode);
```

### 2. Data Types

**File**: `src/types/index.ts`

#### AccessibilityNode
Represents a single node in the accessibility tree:
```typescript
interface AccessibilityNode {
  role: string;              // ARIA role (button, link, heading, etc.)
  name?: string;             // Accessible name
  description?: string;      // Accessible description
  value?: string;            // Current value (for inputs, sliders)
  children: AccessibilityNode[];
  properties?: Record<string, any>;
  states?: {
    checked?: boolean | 'mixed';
    disabled?: boolean;
    expanded?: boolean;
    selected?: boolean;
    // ... other ARIA states
  };
}
```

#### AccessibilityTree
Complete accessibility snapshot:
```typescript
interface AccessibilityTree {
  root: AccessibilityNode;
  violations?: AccessibilityViolation[];
  wcagLevel?: 'A' | 'AA' | 'AAA';
  capturedAt: Date;
}
```

#### AccessibilityViolation
WCAG compliance violations from axe-core:
```typescript
interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  wcagTags: string[];
}
```

### 3. Execution Agent Integration

**File**: `src/agents/execution-agent.ts`

The ExecutionAgent now automatically captures accessibility snapshots alongside screenshots and DOM snapshots:

```typescript
// Automatic collection during test execution
const accessibilitySnapshot = await this.collectAccessibilitySnapshot(page);

// Stored in TestResult
return {
  // ... other fields
  accessibilitySnapshot,
  domSnapshot,
  screenshots,
  metrics,
};
```

### 4. Analysis Agent Enhancement

**File**: `src/agents/analysis-agent.ts`

The AnalysisAgent compares accessibility trees across versions and detects:

#### Tree Structure Changes
- **Added Elements**: New accessible elements in the tree
- **Removed Elements**: Elements that no longer appear
- **Modified Elements**: Changes to roles, names, or states

#### ARIA Changes
- Role modifications (e.g., `button` → `link`)
- Name/label changes
- State changes (checked, expanded, disabled, etc.)
- Property modifications

#### WCAG Violations
- **New Violations**: Accessibility issues introduced
- **Fixed Violations**: Previously failing checks now passing
- **Existing Violations**: Ongoing accessibility issues

#### Severity Mapping
```typescript
Role changes → CRITICAL      // Affects screen reader interpretation
Name changes → HIGH          // Affects element identification
State changes → MEDIUM       // May affect user interaction
Other changes → LOW          // Minor semantic changes
```

### 5. Test Generation Enhancement

**File**: `src/agents/test-generation-agent.ts`

The TestGenerationAgent now includes accessibility-focused guidance in prompts:

#### Semantic Selectors
Tests are generated using semantic locators:
```javascript
// Recommended approach
page.getByRole('button', { name: 'Submit' })
page.getByLabel('Email Address')
page.getByText('Welcome')

// Instead of CSS selectors
page.locator('#submit-btn')
```

#### Accessibility Test Categories
Generated tests include:
- ARIA role and property validation
- Keyboard navigation testing
- Focus management verification
- State change validation
- Accessible name/description checks

### 6. Report Generator Enhancement

**File**: `src/core/report-generator.ts`

Reports now include comprehensive accessibility sections:

#### Accessibility Summary
- Total accessibility changes
- New WCAG violations
- Accessibility improvements
- Breaking accessibility changes

#### WCAG 2.2 Compliance Section
- Compliance level (A, AA, AAA)
- Violation details with:
  - Impact level (critical, serious, moderate, minor)
  - Help text and documentation links
  - WCAG success criteria tags
  - Affected elements

#### Grouped Accessibility Differences
Differences are organized by:
- Visual changes
- Accessibility changes (with detailed breakdowns)
- Structural changes
- Performance changes

## Usage Examples

### Example 1: Button Role Change Detection

**Base Version:**
```html
<button>Submit</button>
```

**Target Version:**
```html
<div role="button" tabindex="0">Submit</div>
```

**Detected Difference:**
```
[CRITICAL] Accessibility role changed at root[0][1]: button → generic
Impact: Screen readers will interpret this differently
```

### Example 2: Missing Accessible Name

**Base Version:**
```html
<button aria-label="Submit form">→</button>
```

**Target Version:**
```html
<button>→</button>
```

**Detected Difference:**
```
[HIGH] Accessibility name changed at root[0][1]: "Submit form" → undefined
Impact: Button purpose unclear to screen reader users
New Violation: [SERIOUS] Buttons must have discernible text
WCAG: wcag2a, wcag412
```

### Example 3: Improved Keyboard Navigation

**Base Version:**
```html
<div onclick="...">Click me</div>
```

**Target Version:**
```html
<button>Click me</button>
```

**Detected Difference:**
```
[INFO] 1 accessibility violation(s) fixed
Category: BUG_FIX
Fixed: Clickable elements must be keyboard accessible
```

## Configuration

### WCAG Compliance Level

Set the desired WCAG level in the snapshot collector:

```typescript
// Default: Level AA
const tree = await accessibilityCollector.capture(page, 'AA');

// Options: 'A', 'AA', 'AAA'
const strictTree = await accessibilityCollector.capture(page, 'AAA');
```

### Analysis Thresholds

Configure accessibility change sensitivity in your config:

```javascript
{
  analysis: {
    visualThreshold: 0.1,
    // Future: accessibility-specific thresholds
  }
}
```

## Best Practices

### 1. Use Semantic Selectors
Always prefer semantic locators over CSS selectors:

```javascript
// ✅ Good
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email').fill('user@example.com');

// ❌ Avoid
await page.locator('#submit-btn').click();
await page.locator('input[name="email"]').fill('user@example.com');
```

### 2. Test Keyboard Navigation
Include keyboard interaction tests:

```javascript
// Tab navigation
await page.keyboard.press('Tab');
await expect(page.getByRole('button', { name: 'Submit' })).toBeFocused();

// Enter/Space activation
await page.keyboard.press('Enter');
```

### 3. Validate ARIA States
Test state changes:

```javascript
// Check initial state
await expect(page.getByRole('button', { name: 'Menu' }))
  .toHaveAttribute('aria-expanded', 'false');

// Interact
await page.getByRole('button', { name: 'Menu' }).click();

// Verify state change
await expect(page.getByRole('button', { name: 'Menu' }))
  .toHaveAttribute('aria-expanded', 'true');
```

### 4. Review Accessibility Reports
Regularly check the Accessibility Summary section in reports to:
- Monitor WCAG compliance trends
- Identify breaking accessibility changes
- Track accessibility improvements

## Integration with Existing Features

### Workflow Discovery
Accessibility trees are automatically captured during workflow discovery, providing semantic context for component usage.

### Test Caching
Accessibility-focused tests are cached alongside other test categories, improving regeneration performance.

### Memory System
The agent memory system stores accessibility-related patterns and regressions for improved test generation over time.

## Technical Details

### Accessibility Tree Structure

The accessibility tree is a hierarchical representation of the page's semantic structure:

```
root (WebArea) "Page Title"
  ├─ banner (banner)
  │   └─ heading (heading) "Welcome" [level=1]
  ├─ navigation (navigation) "Main Navigation"
  │   ├─ link "Home"
  │   ├─ link "About"
  │   └─ link "Contact"
  └─ main (main)
      ├─ heading (heading) "Content" [level=2]
      ├─ button "Submit" (disabled)
      └─ textbox "Email" [required]
```

### axe-core Integration

axe-core is loaded from CDN and runs against specified WCAG levels:

```typescript
// Configure and run axe
const results = await page.evaluate(async (level) => {
  return await window.axe.run({
    runOnly: {
      type: 'tag',
      values: [`wcag2${level.toLowerCase()}`, `wcag2${level.toLowerCase()}a`]
    }
  });
}, 'AA');
```

### Comparison Algorithm

The tree comparison uses a recursive algorithm to:
1. Match nodes by position and role
2. Compare properties (role, name, states)
3. Recursively compare children
4. Track additions, removals, and modifications

## Future Enhancements

- [ ] Accessibility score trending over time
- [ ] Integration with browser accessibility tools
- [ ] Automated remediation suggestions for violations
- [ ] Custom accessibility rules and policies
- [ ] Screen reader simulation testing
- [ ] Color contrast validation
- [ ] Reading order verification

## References

- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [axe-core Documentation](https://github.com/dequelabs/axe-core)
- [Playwright Accessibility API](https://playwright.dev/docs/api/class-accessibility)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
