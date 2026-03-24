/**
 * MCP tools: crz_contracts, ov_filing
 *
 * Zmluvy z CRZ a podania z Obchodného vestníka (DataHub slovensko.digital).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sharedDatahubAdapter as datahub } from "./_shared-clients.js";

export function registerCrzOvTools(server: McpServer): void {
  // --- crz_contracts ---
  server.tool(
    "crz_contracts",
    "Detail zmluvy z Centrálneho registra zmlúv (CRZ) podľa interného ID. Vstup: ID zmluvy.",
    { contractId: z.number().describe("Interné ID zmluvy v CRZ") },
    async ({ contractId }) => {
      const result = await datahub.getCRZContract(contractId);

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: { source: "datahub-crz", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      if (!result.found) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              contractId,
              found: false,
              _meta: { source: "datahub-crz", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const response = {
        ...result.data,
        _meta: {
          source: "datahub-crz",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );

  // --- ov_filing ---
  server.tool(
    "ov_filing",
    "Podanie z Obchodného vestníka (OV) podľa interného ID a typu. Typy: or_podanie, konkurz, likvidacia.",
    {
      id: z.number().describe("Interné ID podania v OV"),
      type: z.enum(["or_podanie", "konkurz", "likvidacia"]).describe("Typ podania"),
    },
    async ({ id, type }) => {
      const result = await datahub.getOVFiling(id, type);

      if (result.error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: result.error,
              _meta: { source: "datahub-ov", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      if (!result.found) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              id,
              type,
              found: false,
              _meta: { source: "datahub-ov", durationMs: result.durationMs, timestamp: new Date().toISOString() },
            }, null, 2),
          }],
        };
      }

      const response = {
        ...result.data,
        _meta: {
          source: "datahub-ov",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
      };
    },
  );
}
