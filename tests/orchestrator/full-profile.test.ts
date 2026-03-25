import { describe, it, expect } from "vitest";
import { FullProfileOrchestrator } from "../../src/orchestrator/full-profile.js";
import { RpoAdapter } from "../../src/adapters/rpo.adapter.js";
import { RuzPipeline } from "../../src/orchestrator/ruz-pipeline.js";
import { RuzAdapter } from "../../src/adapters/ruz.adapter.js";
import { RpvsAdapter } from "../../src/adapters/rpvs.adapter.js";
import { FinsprAdapter } from "../../src/adapters/finspr.adapter.js";
import { ViesAdapter } from "../../src/adapters/vies.adapter.js";
import { ReplikAdapter } from "../../src/adapters/replik.adapter.js";
import { ItmsAdapter } from "../../src/adapters/itms.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";
import "dotenv/config";

const http = new HttpClient();
const rpo = new RpoAdapter(http);
const ruzPipeline = new RuzPipeline(new RuzAdapter(http));
const rpvs = new RpvsAdapter(http);
const finspr = new FinsprAdapter(http);
const vies = new ViesAdapter(http);
const replik = new ReplikAdapter();
const itms = new ItmsAdapter(http);

const orchestrator = new FullProfileOrchestrator(
  rpo, ruzPipeline, rpvs, finspr, vies, replik, itms,
);

const ICO = "36421928";

describe("FullProfileOrchestrator", () => {
  it("getFullProfile returns complete structure", async () => {
    const result = await orchestrator.getFullProfile(ICO);

    // zakladneUdaje
    expect(result).toHaveProperty("zakladneUdaje");
    expect(result.zakladneUdaje).toHaveProperty("ico");
    expect(result.zakladneUdaje).toHaveProperty("nazov");
    expect(result.zakladneUdaje).toHaveProperty("sidlo");
    expect(result.zakladneUdaje).toHaveProperty("pravnaForma");
    expect(result.zakladneUdaje).toHaveProperty("datumVzniku");
    expect(result.zakladneUdaje).toHaveProperty("predmetyPodnikania");
    expect(typeof result.zakladneUdaje.ico).toBe("string");

    // statutari + spolocnici
    expect(Array.isArray(result.statutari)).toBe(true);
    expect(Array.isArray(result.spolocnici)).toBe(true);

    // financie
    expect(result).toHaveProperty("financie");
    expect(result.financie).toHaveProperty("klucoveUkazovatele");
    expect(result.financie).toHaveProperty("pocetZavierok");
    expect(typeof result.financie.pocetZavierok).toBe("number");

    // dph
    expect(result).toHaveProperty("dph");
    expect(result.dph).toHaveProperty("registrovany");
    expect(typeof result.dph.registrovany).toBe("boolean");

    // danovaSpolahlivost
    expect(result).toHaveProperty("danovaSpolahlivost");

    // insolvencia
    expect(result).toHaveProperty("insolvencia");
    expect(result.insolvencia).toHaveProperty("found");
    expect(result.insolvencia).toHaveProperty("konania");
    expect(Array.isArray(result.insolvencia.konania)).toBe(true);

    // kuv
    expect(result).toHaveProperty("kuv");
    expect(result.kuv).toHaveProperty("found");

    // eurofondy
    expect(result).toHaveProperty("eurofondy");
    expect(result.eurofondy).toHaveProperty("found");

    // _meta
    expect(result).toHaveProperty("_meta");
    expect(result._meta).toHaveProperty("zdrojeStatus");
    expect(result._meta).toHaveProperty("totalDurationMs");
    expect(result._meta).toHaveProperty("timestamp");
    expect(typeof result._meta.totalDurationMs).toBe("number");
    expect(result._meta.totalDurationMs).toBeGreaterThan(0);

    // zdrojeStatus should have entries for known sources
    const sources = Object.keys(result._meta.zdrojeStatus);
    expect(sources.length).toBeGreaterThan(0);

    // Each zdrojStatus entry should have standard shape
    for (const key of sources) {
      const entry = result._meta.zdrojeStatus[key];
      expect(entry).toHaveProperty("status");
      expect(["ok", "error", "not_found", "timeout"]).toContain(entry.status);
      expect(entry).toHaveProperty("durationMs");
    }
  });
});
