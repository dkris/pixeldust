import { FrameworkType, FrameworkConfig } from '../types';

/**
 * Framework Detection Utility
 * Automatically detects framework type and related packages
 */

export interface FrameworkInfo {
  type: FrameworkType;
  componentPrefix?: string;
  relatedPackages: string[];
  importPatterns: RegExp[];
  componentPatterns: RegExp[];
}

/**
 * Framework registry with detection patterns and related packages
 */
const FRAMEWORK_REGISTRY: Record<string, FrameworkInfo> = {
  // React
  'react': {
    type: 'react',
    relatedPackages: ['react-dom'],
    importPatterns: [
      // React component imports: import { Button } from 'react-bootstrap'
      /import\s+\{[^}]*\}[^;]*from\s+['"]react['"]/gi,
      /import\s+React/gi,
      /from\s+['"]react['"]/gi,
    ],
    componentPatterns: [
      // JSX/TSX: <Button>, <MyComponent />
      /<([A-Z][a-zA-Z0-9]*)[>\s]/g,
    ],
  },

  // UI5 Web Components
  '@ui5/webcomponents': {
    type: 'web-components',
    componentPrefix: 'ui5',
    relatedPackages: [],
    importPatterns: [
      /import\s+["']@ui5\/webcomponents(?:-[a-z]+)?\/dist\/([A-Z][a-zA-Z0-9]+)(?:\.js)?["']/gi,
      /import\s+\{[^}]*\}\s+from\s+["']@ui5\/webcomponents/gi,
    ],
    componentPatterns: [
      /<(ui5-[a-z0-9-]+)(?:\s|\/|>)/gi,
    ],
  },

  // UI5 Web Components for React
  '@ui5/webcomponents-react': {
    type: 'react-ui5',
    componentPrefix: 'ui5',
    relatedPackages: ['react', 'react-dom', '@ui5/webcomponents'],
    importPatterns: [
      /import\s+\{[^}]*\}\s+from\s+["']@ui5\/webcomponents-react["']/gi,
      /from\s+["']@ui5\/webcomponents-react/gi,
    ],
    componentPatterns: [
      // React component names from UI5 (PascalCase)
      /<(Button|Input|Table|List|Panel|Card|Avatar|Badge|Bar|Breadcrumbs|BusyIndicator|Calendar|CheckBox|ComboBox|DatePicker|DateRangePicker|Dialog|FileUploader|Icon|Label|Link|Menu|MessageStrip|MultiComboBox|MultiInput|NavItem|ObjectPage|Page|Popover|RadioButton|RangeSlider|Rating|ResponsiveGridLayout|SearchField|SegmentedButton|Select|Slider|StepInput|Switch|TabContainer|TextArea|TimePicker|Title|Toast|ToggleButton|Token|Toolbar|Tree|Upload|Wizard)[>\s]/g,
    ],
  },

  // Fluent UI Web Components
  '@fluentui/web-components': {
    type: 'web-components',
    componentPrefix: 'fluent',
    relatedPackages: [],
    importPatterns: [
      /import\s+["']@fluentui\/web-components["']/gi,
    ],
    componentPatterns: [
      /<(fluent-[a-z0-9-]+)(?:\s|\/|>)/gi,
    ],
  },

  // Shoelace
  '@shoelace-style/shoelace': {
    type: 'web-components',
    componentPrefix: 'sl',
    relatedPackages: [],
    importPatterns: [
      /import\s+["']@shoelace-style\/shoelace["']/gi,
    ],
    componentPatterns: [
      /<(sl-[a-z0-9-]+)(?:\s|\/|>)/gi,
    ],
  },

  // Material Web Components
  '@material/web': {
    type: 'web-components',
    componentPrefix: 'md',
    relatedPackages: [],
    importPatterns: [
      /import\s+["']@material\/web["']/gi,
    ],
    componentPatterns: [
      /<(md-[a-z0-9-]+)(?:\s|\/|>)/gi,
    ],
  },
};

/**
 * Detect framework type from framework name
 */
export function detectFrameworkType(frameworkName: string): FrameworkType {
  const info = FRAMEWORK_REGISTRY[frameworkName];
  if (info) {
    return info.type;
  }

  // Fallback detection based on naming patterns
  if (frameworkName.includes('react')) {
    return frameworkName.includes('ui5') ? 'react-ui5' : 'react';
  }
  if (frameworkName.includes('vue')) {
    return 'vue';
  }
  if (frameworkName.includes('angular')) {
    return 'angular';
  }

  // Default to web-components
  return 'web-components';
}

/**
 * Get framework information including related packages
 */
export function getFrameworkInfo(frameworkName: string): FrameworkInfo {
  const info = FRAMEWORK_REGISTRY[frameworkName];
  if (info) {
    return info;
  }

  // Return default info
  return {
    type: detectFrameworkType(frameworkName),
    relatedPackages: [],
    importPatterns: [],
    componentPatterns: [],
  };
}

/**
 * Get all packages that need to be upgraded together
 */
export function getRelatedPackages(frameworkConfig: FrameworkConfig): string[] {
  const frameworkInfo = getFrameworkInfo(frameworkConfig.name);

  // Merge from config and framework info
  const relatedPackages = [
    ...(frameworkConfig.relatedPackages || []),
    ...frameworkInfo.relatedPackages,
  ];

  // Deduplicate
  return Array.from(new Set(relatedPackages));
}

/**
 * Get component prefix for web component frameworks
 */
export function getComponentPrefix(frameworkName: string): string | undefined {
  const info = FRAMEWORK_REGISTRY[frameworkName];
  return info?.componentPrefix;
}

/**
 * Get import patterns for scanning source files
 */
export function getImportPatterns(frameworkName: string): RegExp[] {
  const info = FRAMEWORK_REGISTRY[frameworkName];
  return info?.importPatterns || [];
}

/**
 * Get component patterns for scanning source files
 */
export function getComponentPatterns(frameworkName: string): RegExp[] {
  const info = FRAMEWORK_REGISTRY[frameworkName];
  return info?.componentPatterns || [];
}

/**
 * Check if framework is React-based
 */
export function isReactFramework(frameworkConfig: FrameworkConfig): boolean {
  const type = frameworkConfig.type || detectFrameworkType(frameworkConfig.name);
  return type === 'react' || type === 'react-ui5';
}

/**
 * Check if framework is web components based
 */
export function isWebComponentsFramework(frameworkConfig: FrameworkConfig): boolean {
  const type = frameworkConfig.type || detectFrameworkType(frameworkConfig.name);
  return type === 'web-components' || type === 'react-ui5';
}

/**
 * Get framework-specific upgrade strategy
 */
export interface UpgradeStrategy {
  upgradeReactDom: boolean; // For React frameworks
  upgradeTypes: boolean; // TypeScript types
  upgradeTestingLibrary: boolean; // Testing library packages
}

export function getUpgradeStrategy(frameworkConfig: FrameworkConfig): UpgradeStrategy {
  const type = frameworkConfig.type || detectFrameworkType(frameworkConfig.name);

  switch (type) {
    case 'react':
    case 'react-ui5':
      return {
        upgradeReactDom: true,
        upgradeTypes: true,
        upgradeTestingLibrary: true,
      };

    default:
      return {
        upgradeReactDom: false,
        upgradeTypes: false,
        upgradeTestingLibrary: false,
      };
  }
}

export default {
  detectFrameworkType,
  getFrameworkInfo,
  getRelatedPackages,
  getComponentPrefix,
  getImportPatterns,
  getComponentPatterns,
  isReactFramework,
  isWebComponentsFramework,
  getUpgradeStrategy,
};
