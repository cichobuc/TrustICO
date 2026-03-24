---
name: add-tool
description: Scaffold a new MCP tool handler with input schema and registration
arguments:
  - name: name
    description: "Tool name in kebab-case (e.g., company-search, company-financials)"
    required: true
---

Vytvor nový MCP tool handler "{{name}}" a zaregistruj ho v server.ts.

## Kroky

### 1. Vytvor tool handler: `src/tools/{{name}}.ts`

```typescript
// src/tools/{{name}}.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function register{{PascalName}}Tool(server: McpServer): void {
  server.tool(
    '{{snake_name}}',
    'TODO: Anglický popis pre AI klienta',
    {
      ico: {
        type: 'string' as const,
        description: 'IČO (8-digit company ID)',
      },
    },
    async ({ ico }) => {
      // TODO: Implementovať
      // 1. Validuj input (IČO = 8 číslic)
      // 2. Zavolaj adapter
      // 3. Vráť response s _meta

      const start = Date.now();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            // ...data,
            _meta: {
              source: 'TODO',
              durationMs: Date.now() - start,
              timestamp: new Date().toISOString(),
            },
          }),
        }],
      };
    }
  );
}
```

### 2. Zaregistruj tool v `server.ts`

Pridaj import a volanie na koniec `createServer()`:
```typescript
import { register{{PascalName}}Tool } from './tools/{{name}}.js';
// ...
register{{PascalName}}Tool(server);
```

### 3. Pripomeň používateľovi
- Doplniť popis toolu (description) — bude ho čítať AI klient
- Pridať validáciu inputu (IČO = 8 číslic, DIČ = 10 číslic)
- Implementovať handler logiku s volaním na správny adapter
- Pridať `_meta` sekciu do response

## Pomenovanie konvencie

- Súbor: `{{name}}.ts` (kebab-case)
- MCP tool name: `{{snake_name}}` (snake_case)
- Register funkcia: `register{{PascalName}}Tool` (PascalCase)
- Popis: anglicky (MCP tools sú pre AI klientov)

## Response formát

### Úspech
```json
{
  "content": [{
    "type": "text",
    "text": "{\"data\": ..., \"_meta\": {\"source\": \"rpo\", \"durationMs\": 234, \"timestamp\": \"...\"}}"
  }]
}
```

### Error
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "{\"error\": \"Human-readable message\", \"_meta\": {\"source\": \"rpo\", \"durationMs\": 100}}"
  }]
}
```
