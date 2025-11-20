# Semantic Selector-Based Test Generation

## Overview

PixelDust now generates tests using **semantic selectors** based on accessibility context captured during workflow discovery. This results in more robust, maintainable tests that are less brittle and better aligned with how users interact with your application.

## Benefits

✅ **More Robust Tests**: Semantic selectors are less likely to break when UI implementation changes
✅ **Better Maintainability**: Tests read more like user actions (click "Submit" button vs click "#btn-123")
✅ **Accessibility-First**: Tests validate that your app is accessible by default
✅ **Reduced Token Usage**: Accessibility trees are more compact than screenshots
✅ **Intelligent Selectors**: LLM receives actual semantic context from your application

## How It Works

### 1. Workflow Discovery with Accessibility Context

During workflow discovery, PixelDust now captures:
- **Accessibility Trees**: Semantic structure of each page
- **ARIA Roles and Properties**: Button, link, textbox, etc.
- **Accessible Names**: Labels that identify elements to screen readers
- **Interactive Element Metadata**: Enriched with semantic information

**Example Accessibility Tree:**
```
root (WebArea) "Dashboard"
  ├─ banner (banner)
  │   └─ heading (heading) "Welcome" [level=1]
  ├─ navigation (navigation) "Main Navigation"
  │   ├─ link "Home"
  │   ├─ link "Products"
  │   └─ link "Settings"
  └─ main (main)
      ├─ button "Add Product" (disabled)
      ├─ textbox "Search" [required]
      └─ button "Submit"
```

### 2. Test Generation with Semantic Context

The test generation agent receives:
- Discovered accessibility trees from relevant pages
- Interactive elements with semantic properties (role, accessible name, ARIA attributes)
- Specific selector examples based on actual application structure

**Example Context Provided to LLM:**
```
ACCESSIBILITY CONTEXT:
Discovered elements in application:
  button "Add Product"
  textbox "Search"
  button "Submit"

Interactive elements found:
  - button: role="button" name="Add Product"
    Selector: page.getByRole('button', { name: 'Add Product' })
  - input: role="textbox" name="Search"
    Selector: page.getByRole('textbox', { name: 'Search' })
  - button: role="button" name="Submit"
    Selector: page.getByRole('button', { name: 'Submit' })
```

### 3. Generated Tests Use Semantic Selectors

Tests are generated with a **selector priority hierarchy**:

1. **Role + Name** (Best): `page.getByRole('button', { name: 'Submit' })`
2. **Label**: `page.getByLabel('Email Address')`
3. **Text**: `page.getByText('Welcome')`
4. **Test ID**: `page.getByTestId('submit-btn')`
5. **CSS Selector** (Last Resort): `page.locator('#submit-btn')`

## Selector Strategy

### Priority Hierarchy

The selector strategy follows Playwright best practices and WCAG guidelines:

```typescript
enum SelectorPriority {
  ROLE = 1,        // page.getByRole('button', { name: 'Submit' })
  LABEL = 2,       // page.getByLabel('Email Address')
  PLACEHOLDER = 3, // page.getByPlaceholder('Enter email')
  TEXT = 4,        // page.getByText('Welcome')
  TEST_ID = 5,     // page.getByTestId('submit-btn')
  CSS = 6,         // page.locator('#submit-btn') - last resort
}
```

### Configuration

You can configure the selector strategy in your test generation:

```typescript
import { generateSelector, SelectorStrategyConfig } from './utils/selector-strategy';

const config: SelectorStrategyConfig = {
  preferSemantic: true,    // Prefer semantic selectors over CSS
  useTestId: true,         // Include test ID in fallback chain
  maxPriority: SelectorPriority.CSS,  // Allow all selector types
  strict: false,           // Don't fail if semantic selector unavailable
};

const selector = generateSelector(interactiveElement, config);
```

### Fallback Chain

When a semantic selector isn't available, the system automatically falls back:

```javascript
// Generated test with fallback
const submitButton = await page.getByRole('button', { name: 'Submit' });
// Fallback: page.getByText('Submit') or page.locator('#submit-btn')
```

## Examples

### Before: CSS Selector-Based Test

```javascript
test('user can submit form', async ({ page }) => {
  await page.goto('/dashboard');

  // Brittle CSS selectors
  await page.locator('#email-input').fill('user@example.com');
  await page.locator('button.submit-btn').click();

  // Assertion using ID
  await expect(page.locator('#success-message')).toBeVisible();
});
```

**Problems:**
- Breaks if IDs or classes change
- Doesn't validate accessibility
- Hard to understand what elements do

### After: Semantic Selector-Based Test

```javascript
test('user can submit form', async ({ page }) => {
  await page.goto('/dashboard');

  // Semantic selectors based on accessibility
  await page.getByLabel('Email Address').fill('user@example.com');
  await page.getByRole('button', { name: 'Submit' }).click();

  // Assertion using accessible text
  await expect(page.getByText('Form submitted successfully')).toBeVisible();
});
```

**Benefits:**
- Works even if implementation changes (ID/class changes)
- Validates that form is properly labeled
- Clear and readable - describes user actions
- Tests accessibility by default

### Accessibility Test Example

```javascript
test('ui5-button accessibility validation', async ({ page }) => {
  await page.goto('/');

  // Find button using semantic selector
  const submitButton = await page.getByRole('button', { name: 'Submit Form' });

  // Verify visibility
  await expect(submitButton).toBeVisible();

  // Verify keyboard accessibility
  await submitButton.focus();
  await expect(submitButton).toBeFocused();

  // Verify ARIA attributes
  await expect(submitButton).toHaveAttribute('role', 'button');

  // Test keyboard interaction
  await page.keyboard.press('Enter');

  // Verify state change
  await expect(submitButton).toHaveAttribute('aria-pressed', 'true');
});
```

## Integration with Workflow Discovery

### Local Playwright Driver

When using the local Playwright driver, accessibility trees are automatically captured:

```javascript
{
  "workflowDiscovery": {
    "driver": "local",
    "maxDepth": 3,
    "maxPages": 50
  }
}
```

Captured data includes:
- Full accessibility tree
- WCAG 2.2 violations (via axe-core)
- Semantic information for all interactive elements

### MCP Driver

When using the MCP (Model Context Protocol) driver, accessibility tree capture depends on the MCP server implementation. The official `playwright-mcp` server provides accessibility snapshot support.

## Best Practices

### 1. Use Semantic Selectors First

```javascript
// ✅ Good - semantic selector
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email').fill('user@example.com');

// ❌ Avoid - CSS selector
await page.locator('#submit-btn').click();
await page.locator('input[name="email"]').fill('user@example.com');
```

### 2. Test Keyboard Navigation

```javascript
test('keyboard navigation works', async ({ page }) => {
  await page.goto('/form');

  // Tab through form fields
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeFocused();

  // Submit with Enter
  await page.keyboard.press('Enter');
});
```

### 3. Validate ARIA States

```javascript
test('button states update correctly', async ({ page }) => {
  const toggleButton = await page.getByRole('button', { name: 'Menu' });

  // Check initial state
  await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

  // Click to expand
  await toggleButton.click();

  // Verify state change
  await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
});
```

### 4. Test Focus Management

```javascript
test('focus management on modal open', async ({ page }) => {
  // Open modal
  await page.getByRole('button', { name: 'Open Settings' }).click();

  // First focusable element in modal should receive focus
  const modal = page.getByRole('dialog', { name: 'Settings' });
  await expect(modal).toBeVisible();

  const closeButton = modal.getByRole('button', { name: 'Close' });
  await expect(closeButton).toBeFocused();
});
```

## Selector Validation

The selector strategy utility provides validation:

```typescript
import { validateSelector } from './utils/selector-strategy';

const result = validateSelector("page.locator('#submit-btn')");

console.log(result);
// {
//   valid: false,
//   priority: SelectorPriority.CSS,
//   warnings: [
//     'Consider using semantic selector (getByRole, getByLabel, etc.) instead of CSS selector',
//     'CSS selector may be brittle - prefer semantic selectors'
//   ]
// }
```

## Configuration Options

### Enable/Disable Semantic Selectors

While semantic selectors are recommended, you can adjust the strategy:

```typescript
// Strict mode - fail if semantic selector not available
const config: SelectorStrategyConfig = {
  preferSemantic: true,
  strict: true,  // Throws error if no semantic selector found
  maxPriority: SelectorPriority.TEXT,  // Don't allow CSS selectors
};

// Permissive mode - allow CSS fallback
const permissiveConfig: SelectorStrategyConfig = {
  preferSemantic: true,
  strict: false,
  maxPriority: SelectorPriority.CSS,  // Allow CSS as fallback
};
```

## Generated Test Structure

Tests generated with semantic selectors follow this structure:

```javascript
import { test, expect } from '@playwright/test';

test('component-name-action-description', async ({ page }) => {
  // Navigate to page
  await page.goto('/relevant-page');

  // Find element using semantic selector (role + name)
  const element = await page.getByRole('button', { name: 'Submit' });

  // Perform action
  await element.click();

  // Assert outcome using semantic selector
  await expect(page.getByText('Success')).toBeVisible();

  // Accessibility assertion
  await expect(element).toHaveAttribute('aria-pressed', 'true');
});
```

## Accessibility Tree Comparison

The test framework automatically captures accessibility trees before and after test execution for comparison:

```javascript
// Accessibility tree is captured automatically
// Differences are reported in test results

test('button click updates accessibility tree', async ({ page }) => {
  // Initial tree captured here
  await page.goto('/');

  // Action
  await page.getByRole('button', { name: 'Toggle Menu' }).click();

  // Final tree captured and compared
  // Reports show:
  // - Added elements
  // - Removed elements
  // - Changed ARIA attributes
});
```

## Migration Guide

### Migrating Existing Tests

To migrate from CSS selectors to semantic selectors:

1. **Identify Elements by Role**:
   ```javascript
   // Before
   page.locator('button.submit')

   // After
   page.getByRole('button', { name: 'Submit' })
   ```

2. **Use Labels for Inputs**:
   ```javascript
   // Before
   page.locator('#email-input')

   // After
   page.getByLabel('Email Address')
   ```

3. **Find by Text Content**:
   ```javascript
   // Before
   page.locator('.message-box')

   // After
   page.getByText('Welcome back!')
   ```

4. **Add Test IDs for Complex Elements**:
   ```javascript
   // In your component
   <div data-testid="user-profile">...</div>

   // In test
   page.getByTestId('user-profile')
   ```

## Troubleshooting

### Semantic Selector Not Found

If a semantic selector isn't working:

1. **Verify Element Has Accessible Role**:
   ```javascript
   // Check if element has proper ARIA role
   const element = await page.locator('.my-button');
   console.log(await element.getAttribute('role')); // Should be 'button'
   ```

2. **Check Accessible Name**:
   ```javascript
   // Verify accessible name is set
   console.log(await element.getAttribute('aria-label'));
   // or check text content
   console.log(await element.textContent());
   ```

3. **Use Accessibility Tree Inspector**:
   ```javascript
   // Capture and print accessibility tree
   const tree = await page.accessibility.snapshot();
   console.log(JSON.stringify(tree, null, 2));
   ```

### Fallback to CSS Selector

If you must use CSS selectors:

```javascript
// Add comment explaining why semantic selector can't be used
// TODO: Add proper ARIA label to element
const element = await page.locator('#legacy-element');
```

## References

- [Playwright Locators Best Practices](https://playwright.dev/docs/locators)
- [ARIA Roles](https://www.w3.org/TR/wai-aria-1.2/#role_definitions)
- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [PixelDust Accessibility Tree Testing](./accessibility-tree-testing.md)

## Related Documentation

- [Accessibility Tree Testing](./accessibility-tree-testing.md)
- [Workflow Discovery](./workflow-discovery.md)
- [Test Generation](./test-generation.md)
