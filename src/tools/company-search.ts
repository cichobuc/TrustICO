/**
 * MCP tool: company_search
 *
 * Intelligent search — detects IČO, company name, or DIČ/IČ DPH
 * and returns matching companies from RPO.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpClient } from "../utils/http-client.js";
import { IcoResolver } from "../orchestrator/resolver.js";

const http = new HttpClient();
const resolver = new IcoResolver(http);

export function registerCompanySearch(server: McpServer): void {
  server.tool(
    "company_search",
    "Inteligentný search slovenských firiem — rozpozná IČO (8 číslic), názov firmy alebo DIČ/IČ DPH a vráti zoznam zhôd z RPO.",
    { query: z.string().describe("IČO (8 číslic), názov firmy, alebo DIČ/IČ DPH") },
    async ({ query }) => {
      const result = await resolver.resolve(query);

      const response = {
        results: result.results,
        count: result.results.length,
        _meta: {
          source: "rpo",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

      if (result.error && result.results.length === 0) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: result.error, ...response }, null, 2) }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );
}
