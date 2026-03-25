/**
 * Health check — pings each API source in parallel with a short timeout.
 * Returns per-source status so operators can see what's up/down.
 */

import { logger } from "./logger.js";

const HEALTH_TIMEOUT_MS = 5_000;

interface SourceHealth {
  source: string;
  status: "ok" | "degraded" | "down";
  durationMs: number;
  error?: string;
}

export interface HealthResult {
  status: "ok" | "degraded" | "down";
  version: string;
  timestamp: string;
  uptime: number;
  sources: SourceHealth[];
}

/** Lightweight ping targets — one cheap GET per source. */
const PING_TARGETS: { source: string; url: string; method?: string; body?: string; headers?: Record<string, string> }[] = [
  {
    source: "rpo",
    url: "https://api.statistics.sk/rpo/v1/search?identifier=36421928",
  },
  {
    source: "ruz",
    url: "https://registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico=36421928",
  },
  {
    source: "rpvs",
    url: "https://rpvs.gov.sk/OpenData/Partneri?$filter=Ico%20eq%20%2736421928%27",
  },
  {
    source: "vies",
    url: "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",
    method: "POST",
    body: JSON.stringify({ countryCode: "SK", vatNumber: "2020317068" }),
    headers: { "Content-Type": "application/json" },
  },
  {
    source: "datahub",
    url: "https://data.slovensko.digital/api/data/crz/contracts/1",
  },
  {
    source: "itms",
    url: "https://opendata.itms2014.sk/v2/operacneProgramy",
  },
];

async function pingSource(target: typeof PING_TARGETS[number]): Promise<SourceHealth> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const resp = await fetch(target.url, {
      method: target.method ?? "GET",
      headers: target.headers,
      body: target.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const durationMs = Date.now() - start;

    if (resp.status >= 200 && resp.status < 500) {
      // 4xx may be expected (e.g. RPVS returns 404 for missing entities)
      // We only treat 5xx as degraded
      return { source: target.source, status: "ok", durationMs };
    }
    return {
      source: target.source,
      status: "degraded",
      durationMs,
      error: `HTTP ${resp.status}`,
    };
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: target.source,
      status: "down",
      durationMs,
      error: message,
    };
  }
}

export async function checkHealth(): Promise<HealthResult> {
  // Add FinSpr only if API key is configured
  const targets = [...PING_TARGETS];
  const finsrpKey = process.env.FINSPR_API_KEY;
  if (finsrpKey) {
    targets.push({
      source: "finspr",
      url: "https://iz.opendata.financnasprava.sk/api/data/ds_dphs/search?column=ico&search=36421928&page=1",
      headers: { key: finsrpKey },
    });
  }

  // REPLIK is SOAP — just check if the WSDL endpoint is reachable
  targets.push({
    source: "replik",
    url: "https://replik-ws.justice.sk/konanieService?wsdl",
  });

  const results = await Promise.allSettled(targets.map(pingSource));

  const sources: SourceHealth[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      source: targets[i].source,
      status: "down" as const,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  const downCount = sources.filter((s) => s.status === "down").length;
  const degradedCount = sources.filter((s) => s.status === "degraded").length;

  let overallStatus: "ok" | "degraded" | "down";
  if (downCount === sources.length) {
    overallStatus = "down";
  } else if (downCount > 0 || degradedCount > 0) {
    overallStatus = "degraded";
  } else {
    overallStatus = "ok";
  }

  const result: HealthResult = {
    status: overallStatus,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sources,
  };

  logger.info("health check completed", {
    status: overallStatus,
    down: downCount,
    degraded: degradedCount,
  });

  return result;
}
