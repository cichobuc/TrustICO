/**
 * MCP tool: company_compare
 *
 * Porovnanie 2–10 firiem + personálne prepojenia.
 * For each company: fetch people (RPO) and financials (RUZ) in parallel.
 * Find personnel connections: same meno+priezvisko across companies.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  sharedRpoAdapter as rpo,
  sharedRuzPipeline as ruzPipeline,
} from "./_shared-clients.js";
import { validateICO } from "../utils/validators.js";
import type { Statutar, Spolocnik } from "../types/rpo.types.js";

/** Title-stripping regex — matches common Slovak academic/professional titles. */
const TITLE_RE = /^(Ing\.|Mgr\.|Bc\.|JUDr\.|MUDr\.|RNDr\.|PhDr\.|PaedDr\.|ThDr\.|MVDr\.|DrSc\.|doc\.|prof\.|PhD\.|CSc\.|MBA|Dipl\.)\s*/gi;

type CompanyCompareEntry = {
  ico: string;
  nazov: string;
  trzby: number | null;
  zisk: number | null;
  aktiva: number | null;
  vlastneImanie: number | null;
  aktivna: boolean;
  pocetZamestnancov: number | null;
};

type PersonalnePrepojenie = {
  osoba: string;
  firmy: Array<{
    ico: string;
    funkcia: string | null;
    od: string | null;
  }>;
};

export function registerCompanyCompare(server: McpServer): void {
  server.tool(
    "company_compare",
    "Porovnanie 2–10 firiem: finančné ukazovatele + personálne prepojenia (spoloční štatutári/spoločníci). Vstup: zoznam IČO.",
    {
      icos: z.array(z.string()).min(2).max(10).describe("Zoznam 2–10 IČO na porovnanie"),
    },
    async ({ icos }) => {
      const start = Date.now();

      try {
      // Validate all IČOs
      const validated: string[] = [];
      for (const ico of icos) {
        const v = validateICO(ico);
        if (!v.valid) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: `Neplatné IČO "${ico}": ${v.error}`,
                _meta: { source: "rpo+ruz", durationMs: 0, timestamp: new Date().toISOString() },
              }),
            }],
          };
        }
        validated.push(v.normalized);
      }

      // Fetch people + financials for ALL companies in parallel
      const fetchPromises = validated.map(async (ico) => {
        const [entityResult, finResult] = await Promise.allSettled([
          rpo.getEntityByIco(ico),
          ruzPipeline.getFinancials(ico),
        ]);

        const entity = entityResult.status === "fulfilled" && entityResult.value.found
          ? entityResult.value.data
          : null;
        const people = entity ? rpo.mapPeople(entity) : null;

        const fin = finResult.status === "fulfilled" && finResult.value.success
          ? finResult.value.data
          : null;

        // Get company name from RPO entity
        const currentName = entity?.fullNames?.find((n) => !n.validTo)?.value
          ?? entity?.fullNames?.[0]?.value ?? ico;

        // Determine active status from entity before discarding it
        const aktivna = entity ? !!entity.fullNames?.some((n) => !n.validTo) : true;

        return { ico, people, fin, currentName, aktivna };
      });

      const results = await Promise.allSettled(fetchPromises);

      // Build firmy array and collect all people per company
      const firmy: CompanyCompareEntry[] = [];
      const peopleByCompany: Array<{
        ico: string;
        statutari: Statutar[];
        spolocnici: Spolocnik[];
      }> = [];

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { ico, people, fin, currentName, aktivna } = r.value;

        const ukazovatele = fin?.klucoveUkazovatele;
        firmy.push({
          ico,
          nazov: currentName,
          trzby: ukazovatele?.trzby ?? null,
          zisk: ukazovatele?.vysledokHospodarenia ?? null,
          aktiva: ukazovatele?.aktivaCelkom ?? null,
          vlastneImanie: ukazovatele?.vlastneImanie ?? null,
          aktivna,
          pocetZamestnancov: null,
        });

        if (people) {
          peopleByCompany.push({
            ico,
            statutari: people.statutari,
            spolocnici: people.spolocnici,
          });
        }
      }

      // Find personnel connections: same meno+priezvisko across different companies
      const personMap = new Map<string, Array<{ ico: string; funkcia: string | null; od: string | null }>>();

      for (const company of peopleByCompany) {
        // Add statutari
        for (const s of company.statutari) {
          if (!s.meno && !s.priezvisko) continue;
          const key = normalizeName(s.meno, s.priezvisko);
          if (!key) continue;

          const list = personMap.get(key) ?? [];
          list.push({ ico: company.ico, funkcia: s.typ, od: s.od });
          personMap.set(key, list);
        }

        // Add spolocnici (only persons, not companies)
        for (const s of company.spolocnici) {
          if (!s.nazov || s.ico) continue; // Skip companies (they have IČO)
          const parts = s.nazov.split(/\s+/);
          if (parts.length < 2) continue;
          const key = normalizeName(parts[0], parts[parts.length - 1]);
          if (!key) continue;

          const list = personMap.get(key) ?? [];
          list.push({ ico: company.ico, funkcia: "spoločník", od: s.od });
          personMap.set(key, list);
        }
      }

      // Filter to only people appearing in 2+ companies
      const personalnePrepojenia: PersonalnePrepojenie[] = [];
      for (const [key, entries] of personMap) {
        const uniqueIcos = new Set(entries.map((e) => e.ico));
        if (uniqueIcos.size < 2) continue;

        // Deduplicate entries per company (take first role)
        const deduped: Array<{ ico: string; funkcia: string | null; od: string | null }> = [];
        const seen = new Set<string>();
        for (const e of entries) {
          if (!seen.has(e.ico)) {
            seen.add(e.ico);
            deduped.push(e);
          }
        }

        personalnePrepojenia.push({
          osoba: key,
          firmy: deduped,
        });
      }

      const result = {
        firmy,
        personalnePrepojenia,
        pocetPrepojeni: personalnePrepojenia.length,
        _meta: {
          source: "rpo+ruz",
          durationMs: Date.now() - start,
          timestamp: new Date().toISOString(),
        },
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
      } catch (err) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              _meta: { source: "rpo+ruz", durationMs: Date.now() - start, timestamp: new Date().toISOString() },
            }),
          }],
        };
      }
    },
  );
}

/**
 * Normalize a person's name for matching across companies.
 * Strips titles, lowercases, trims.
 */
function normalizeName(meno: string | null, priezvisko: string | null): string | null {
  if (!meno && !priezvisko) return null;

  const clean = (s: string | null) =>
    (s ?? "").replace(TITLE_RE, "").trim().toLowerCase();

  const m = clean(meno);
  const p = clean(priezvisko);
  if (!m && !p) return null;
  return `${m} ${p}`.trim();
}
