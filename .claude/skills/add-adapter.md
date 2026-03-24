---
name: add-adapter
description: Scaffold a new API adapter with types, implementation, and test file
arguments:
  - name: name
    description: "Adapter name in kebab-case (e.g., rpvs, finspr, datahub)"
    required: true
---

Vytvor nový API adapter "{{name}}" so všetkými potrebnými súbormi.

## Kroky

### 1. Vytvor types súbor: `src/types/{{name}}.types.ts`

```typescript
// src/types/{{name}}.types.ts

export interface {{PascalName}}Entity {
  // TODO: Doplniť podľa API response
}

export interface {{PascalName}}SearchResult {
  // TODO: Doplniť podľa API response
}
```

### 2. Vytvor adapter: `src/adapters/{{name}}.adapter.ts`

Použi túto šablónu:

```typescript
// src/adapters/{{name}}.adapter.ts
import type { AdapterResult } from '../types/common.types.js';
import type { {{PascalName}}Entity } from '../types/{{name}}.types.js';
import type { HttpClient } from '../utils/http-client.js';

const {{UPPER_NAME}}_BASE_URL = ''; // TODO: Doplniť

export class {{PascalName}}Adapter {
  constructor(private http: HttpClient) {}

  async search(ico: string): Promise<AdapterResult<{{PascalName}}SearchResult>> {
    const start = Date.now();
    try {
      const response = await this.http.get(`${{{UPPER_NAME}}_BASE_URL}/...`, {
        source: '{{name}}',
      });

      if (!response.ok) {
        return {
          found: false,
          error: `{{PascalName}} API returned ${response.status}`,
          durationMs: Date.now() - start,
          source: '{{name}}',
        };
      }

      const data = await response.json();
      return {
        found: true,
        data,
        durationMs: Date.now() - start,
        source: '{{name}}',
      };
    } catch (error) {
      return {
        found: false,
        error: `{{PascalName}} request failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
        source: '{{name}}',
      };
    }
  }
}
```

### 3. Vytvor test: `tests/adapters/{{name}}.test.ts`

```typescript
// tests/adapters/{{name}}.test.ts
import { describe, it, expect } from 'vitest';
import { {{PascalName}}Adapter } from '../../src/adapters/{{name}}.adapter.js';
import { HttpClient } from '../../src/utils/http-client.js';

describe('{{PascalName}}Adapter', () => {
  const http = new HttpClient();
  const adapter = new {{PascalName}}Adapter(http);

  it('should find Websupport by IČO', async () => {
    const result = await adapter.search('36421928');
    expect(result.source).toBe('{{name}}');
    expect(result.durationMs).toBeGreaterThan(0);
    // TODO: Add specific assertions
  }, 15_000);

  it('should handle non-existent IČO', async () => {
    const result = await adapter.search('00000001');
    expect(result.found).toBe(false);
    expect(result.source).toBe('{{name}}');
  }, 15_000);
});
```

### 4. Pripomeň používateľovi
- Registrovať adapter v orchestrátore (`src/orchestrator/full-profile.ts`)
- Pridať rate limit do `http-client.ts` ak ešte nie je
- Skontrolovať CLAUDE.md pre API quirks

## Pomenovanie

- Súbor: `{{name}}.adapter.ts` (kebab-case)
- Trieda: `{{PascalName}}Adapter` (PascalCase)
- Konštanta: `{{UPPER_NAME}}_BASE_URL` (UPPER_SNAKE_CASE)
- Source tag: `'{{name}}'`
