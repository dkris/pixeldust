/**
 * Selector Strategy Utilities
 *
 * Provides semantic selector generation with fallback hierarchy for robust test automation.
 * Follows Playwright best practices and accessibility guidelines.
 */

import type { InteractiveElement } from '../types';

/**
 * Selector priority levels (from most to least preferred)
 */
export enum SelectorPriority {
  ROLE = 1,        // page.getByRole('button', { name: 'Submit' })
  LABEL = 2,       // page.getByLabel('Email Address')
  PLACEHOLDER = 3, // page.getByPlaceholder('Enter email')
  TEXT = 4,        // page.getByText('Welcome')
  TEST_ID = 5,     // page.getByTestId('submit-btn')
  CSS = 6,         // page.locator('#submit-btn') - last resort
}

/**
 * Selector strategy configuration
 */
export interface SelectorStrategyConfig {
  /** Prefer semantic selectors over CSS selectors */
  preferSemantic: boolean;
  /** Include test ID in fallback chain */
  useTestId: boolean;
  /** Maximum selector priority to use (1=ROLE, 6=CSS) */
  maxPriority: SelectorPriority;
  /** Strict mode - fail if semantic selector not available */
  strict: boolean;
}

/**
 * Default selector strategy configuration
 */
export const DEFAULT_SELECTOR_STRATEGY: SelectorStrategyConfig = {
  preferSemantic: true,
  useTestId: true,
  maxPriority: SelectorPriority.CSS,
  strict: false,
};

/**
 * Generate best selector for an interactive element with fallback chain
 */
export function generateSelector(
  element: InteractiveElement,
  config: Partial<SelectorStrategyConfig> = {}
): string {
  const strategy = { ...DEFAULT_SELECTOR_STRATEGY, ...config };
  const selectors: Array<{ priority: SelectorPriority; code: string }> = [];

  // Priority 1: Role-based selector
  if (element.role && element.accessibleName) {
    selectors.push({
      priority: SelectorPriority.ROLE,
      code: `page.getByRole('${element.role}', { name: '${escapeString(element.accessibleName)}' })`,
    });
  } else if (element.role) {
    selectors.push({
      priority: SelectorPriority.ROLE,
      code: `page.getByRole('${element.role}')`,
    });
  }

  // Priority 2: Label-based selector (for inputs)
  if (element.ariaLabel || element.accessibleName) {
    const label = element.ariaLabel || element.accessibleName!;
    selectors.push({
      priority: SelectorPriority.LABEL,
      code: `page.getByLabel('${escapeString(label)}')`,
    });
  }

  // Priority 3: Placeholder (for inputs)
  // Would need to be extracted from element attributes

  // Priority 4: Text-based selector
  if (element.text) {
    selectors.push({
      priority: SelectorPriority.TEXT,
      code: `page.getByText('${escapeString(element.text)}')`,
    });
  }

  // Priority 5: Test ID
  if (strategy.useTestId && element.testId) {
    selectors.push({
      priority: SelectorPriority.TEST_ID,
      code: `page.getByTestId('${element.testId}')`,
    });
  }

  // Priority 6: CSS selector (fallback)
  if (element.selector) {
    selectors.push({
      priority: SelectorPriority.CSS,
      code: `page.locator('${element.selector}')`,
    });
  }

  // Filter by max priority and sort
  const validSelectors = selectors
    .filter(s => s.priority <= strategy.maxPriority)
    .sort((a, b) => a.priority - b.priority);

  if (validSelectors.length === 0) {
    if (strategy.strict) {
      throw new Error(`No valid selector found for element: ${JSON.stringify(element)}`);
    }
    // Ultimate fallback
    return `page.locator('${element.selector || element.componentTag || 'unknown'}')`;
  }

  // Return best selector (or provide fallback chain in comments)
  const best = validSelectors[0];

  if (strategy.preferSemantic && best.priority > SelectorPriority.TEXT) {
    // Warn if falling back to non-semantic selector
    console.warn(`Using non-semantic selector (priority ${best.priority}) for element:`, element);
  }

  return best.code;
}

/**
 * Generate selector with fallback chain as code comment
 */
export function generateSelectorWithFallback(
  element: InteractiveElement,
  config: Partial<SelectorStrategyConfig> = {}
): string {
  const strategy = { ...DEFAULT_SELECTOR_STRATEGY, ...config };
  const selectors: Array<{ priority: SelectorPriority; code: string }> = [];

  // Generate all possible selectors
  if (element.role && element.accessibleName) {
    selectors.push({
      priority: SelectorPriority.ROLE,
      code: `page.getByRole('${element.role}', { name: '${escapeString(element.accessibleName)}' })`,
    });
  } else if (element.role) {
    selectors.push({
      priority: SelectorPriority.ROLE,
      code: `page.getByRole('${element.role}')`,
    });
  }

  if (element.ariaLabel || element.accessibleName) {
    const label = element.ariaLabel || element.accessibleName!;
    selectors.push({
      priority: SelectorPriority.LABEL,
      code: `page.getByLabel('${escapeString(label)}')`,
    });
  }

  if (element.text) {
    selectors.push({
      priority: SelectorPriority.TEXT,
      code: `page.getByText('${escapeString(element.text)}')`,
    });
  }

  if (strategy.useTestId && element.testId) {
    selectors.push({
      priority: SelectorPriority.TEST_ID,
      code: `page.getByTestId('${element.testId}')`,
    });
  }

  if (element.selector) {
    selectors.push({
      priority: SelectorPriority.CSS,
      code: `page.locator('${element.selector}')`,
    });
  }

  const validSelectors = selectors
    .filter(s => s.priority <= strategy.maxPriority)
    .sort((a, b) => a.priority - b.priority);

  if (validSelectors.length === 0) {
    return `page.locator('${element.selector || element.componentTag || 'unknown'}')`;
  }

  // Primary selector
  let code = validSelectors[0].code;

  // Add fallback chain as comment if multiple options
  if (validSelectors.length > 1) {
    code += '\n    // Fallback: ' + validSelectors.slice(1, 3).map(s => s.code).join(' or ');
  }

  return code;
}

/**
 * Get recommended selector type for element
 */
export function getRecommendedSelectorType(element: InteractiveElement): string {
  if (element.role && element.accessibleName) {
    return 'role+name';
  } else if (element.role) {
    return 'role';
  } else if (element.ariaLabel || element.accessibleName) {
    return 'label';
  } else if (element.text) {
    return 'text';
  } else if (element.testId) {
    return 'testId';
  } else {
    return 'css';
  }
}

/**
 * Validate if selector follows best practices
 */
export function validateSelector(selector: string): {
  valid: boolean;
  priority: SelectorPriority;
  warnings: string[];
} {
  const warnings: string[] = [];
  let priority: SelectorPriority;

  if (selector.includes('getByRole')) {
    priority = SelectorPriority.ROLE;
  } else if (selector.includes('getByLabel')) {
    priority = SelectorPriority.LABEL;
  } else if (selector.includes('getByPlaceholder')) {
    priority = SelectorPriority.PLACEHOLDER;
  } else if (selector.includes('getByText')) {
    priority = SelectorPriority.TEXT;
  } else if (selector.includes('getByTestId')) {
    priority = SelectorPriority.TEST_ID;
  } else if (selector.includes('locator')) {
    priority = SelectorPriority.CSS;
    warnings.push('Consider using semantic selector (getByRole, getByLabel, etc.) instead of CSS selector');
  } else {
    priority = SelectorPriority.CSS;
    warnings.push('Unknown selector type');
  }

  // Check for brittle selectors
  if (selector.includes('#') || selector.includes('.')) {
    warnings.push('CSS selector may be brittle - prefer semantic selectors');
  }

  if (selector.match(/nth-child|nth-of-type/)) {
    warnings.push('Position-based selector is fragile - prefer semantic identification');
  }

  return {
    valid: warnings.length === 0,
    priority,
    warnings,
  };
}

/**
 * Escape string for use in selector
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * Generate selector examples for documentation
 */
export function generateSelectorExamples(element: InteractiveElement): string[] {
  const examples: string[] = [];

  examples.push('// Selector options (from best to worst):');

  if (element.role && element.accessibleName) {
    examples.push(`// 1. Role + Name: page.getByRole('${element.role}', { name: '${element.accessibleName}' })`);
  } else if (element.role) {
    examples.push(`// 1. Role: page.getByRole('${element.role}')`);
  }

  if (element.ariaLabel || element.accessibleName) {
    examples.push(`// 2. Label: page.getByLabel('${element.ariaLabel || element.accessibleName}')`);
  }

  if (element.text) {
    examples.push(`// 3. Text: page.getByText('${element.text}')`);
  }

  if (element.testId) {
    examples.push(`// 4. Test ID: page.getByTestId('${element.testId}')`);
  }

  if (element.selector) {
    examples.push(`// 5. CSS (fallback): page.locator('${element.selector}')`);
  }

  return examples;
}
