# Contributing to PixelDust

Thank you for your interest in contributing to PixelDust! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker or Podman
- Git

### Setup Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/pixeldust.git
   cd pixeldust
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run tests:
   ```bash
   npm test
   ```

## Development Workflow

### Project Structure

```
pixeldust/
├── src/
│   ├── agents/          # Agent implementations
│   ├── core/            # Core functionality
│   ├── cli/             # CLI interface
│   ├── storage/         # Database and storage
│   ├── types/           # TypeScript types
│   └── utils/           # Utilities
├── tests/
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── e2e/             # End-to-end tests
├── examples/            # Example configurations
└── templates/           # Templates and boilerplates
```

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Run linter:
   ```bash
   npm run lint
   ```

4. Format code:
   ```bash
   npm run format
   ```

5. Run tests:
   ```bash
   npm test
   ```

6. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Submitting Changes

1. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub

3. Fill in the PR template with:
   - Description of changes
   - Related issues
   - Testing steps
   - Screenshots (if applicable)

## Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Write tests for new features

## Testing

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### E2E Tests

```bash
npm run test:e2e
```

## Adding New Agents

To add a new agent:

1. Create a new file in `src/agents/`
2. Extend `BaseAgent`
3. Implement the `execute` method
4. Add agent to orchestrator
5. Write tests
6. Update documentation

Example:

```typescript
import { BaseAgent } from './base-agent';
import { AgentType, AgentContext, AgentResult } from '../types';

export class MyNewAgent extends BaseAgent {
  constructor() {
    super(AgentType.MY_NEW_AGENT);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      // Your implementation
      return this.success({ data: 'result' });
    } catch (error) {
      return this.failure(error as Error);
    }
  }
}
```

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for architectural changes
- Add JSDoc comments to public APIs
- Update examples if needed

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Join our Discord (coming soon)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
