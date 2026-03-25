/**
 * Unit tests for RpoAdapter.mapBranches() with mock data.
 * Verifies branch mapping logic without needing external API access.
 */
import { describe, it, expect } from "vitest";
import { RpoAdapter } from "../../src/adapters/rpo.adapter.js";
import { HttpClient } from "../../src/utils/http-client.js";
import type { RpoEntityDetail } from "../../src/types/rpo.types.js";

const http = new HttpClient();
const adapter = new RpoAdapter(http);

// Mock entity with organization units (prevádzkarne)
const entityWithBranches: RpoEntityDetail = {
  id: 12345,
  identifiers: [{ value: "36421928", validFrom: "2002-01-01" }],
  fullNames: [{ value: "Test Company s.r.o.", validFrom: "2002-01-01" }],
  addresses: [],
  statutoryBodies: [],
  stakeholders: [],
  activities: [],
  organizationUnits: [
    {
      id: 100,
      fullNames: [{ value: "Prevádzkareň Bratislava", validFrom: "2015-01-01" }],
      addresses: [
        {
          street: "Karadžičova",
          buildingNumber: "12",
          municipality: { value: "Bratislava - mestská časť Ružinov" },
          postalCodes: ["82108"],
          validFrom: "2015-01-01",
        },
      ],
      activities: [
        { economicActivityDescription: "Počítačové služby" },
        { economicActivityDescription: "IT konzultácie" },
      ],
      statutoryBodies: [
        {
          personName: {
            formatedName: "Ing. Ján Novák",
            givenNames: ["Ján"],
            familyNames: ["Novák"],
          },
        },
      ],
      validFrom: "2015-01-01",
    },
    {
      id: 101,
      fullNames: [{ value: "Prevádzkareň Košice", validFrom: "2018-06-01" }],
      addresses: [
        {
          street: "Hlavná",
          buildingNumber: "5",
          municipality: { value: "Košice - mestská časť Staré Mesto" },
          postalCodes: ["04001"],
          validFrom: "2018-06-01",
        },
      ],
      activities: [
        { economicActivityDescription: "Maloobchod" },
      ],
      statutoryBodies: [],
      validFrom: "2018-06-01",
    },
  ],
};

// Mock entity without organization units
const entityWithoutBranches: RpoEntityDetail = {
  id: 99999,
  identifiers: [{ value: "00000001", validFrom: "2000-01-01" }],
  fullNames: [{ value: "Empty Company s.r.o.", validFrom: "2000-01-01" }],
  addresses: [],
  statutoryBodies: [],
  stakeholders: [],
  activities: [],
  organizationUnits: [],
};

// Mock entity with missing/sparse org unit data
const entityWithSparseUnit: RpoEntityDetail = {
  id: 55555,
  identifiers: [{ value: "12345678", validFrom: "2010-01-01" }],
  fullNames: [{ value: "Sparse s.r.o.", validFrom: "2010-01-01" }],
  addresses: [],
  statutoryBodies: [],
  stakeholders: [],
  activities: [],
  organizationUnits: [
    {
      id: 200,
      // No fullNames, no addresses, no activities, no statutoryBodies
      validFrom: "2020-01-01",
    },
  ],
};

describe("RpoAdapter.mapBranches", () => {
  it("maps entity with 2 branches correctly", () => {
    const result = adapter.mapBranches(entityWithBranches);

    expect(result.ico).toBe("36421928");
    expect(result.pocet).toBe(2);
    expect(result.prevadzkarne).toHaveLength(2);

    // First branch
    const b1 = result.prevadzkarne[0];
    expect(b1.nazov).toBe("Prevádzkareň Bratislava");
    expect(b1.adresa).toEqual({
      ulica: "Karadžičova 12",
      mesto: "Bratislava - mestská časť Ružinov",
      psc: "82108",
    });
    expect(b1.predmetPodnikania).toEqual(["Počítačové služby", "IT konzultácie"]);
    expect(b1.veduci).toBe("Ing. Ján Novák");
    expect(b1.od).toBe("2015-01-01");

    // Second branch
    const b2 = result.prevadzkarne[1];
    expect(b2.nazov).toBe("Prevádzkareň Košice");
    expect(b2.adresa).toEqual({
      ulica: "Hlavná 5",
      mesto: "Košice - mestská časť Staré Mesto",
      psc: "04001",
    });
    expect(b2.predmetPodnikania).toEqual(["Maloobchod"]);
    expect(b2.veduci).toBeNull();
    expect(b2.od).toBe("2018-06-01");
  });

  it("returns empty array for entity with no branches", () => {
    const result = adapter.mapBranches(entityWithoutBranches);

    expect(result.ico).toBe("00000001");
    expect(result.pocet).toBe(0);
    expect(result.prevadzkarne).toEqual([]);
  });

  it("handles sparse organization unit data gracefully", () => {
    const result = adapter.mapBranches(entityWithSparseUnit);

    expect(result.ico).toBe("12345678");
    expect(result.pocet).toBe(1);

    const branch = result.prevadzkarne[0];
    expect(branch.nazov).toBe("Organizačná zložka 200");
    expect(branch.adresa).toBeNull();
    expect(branch.predmetPodnikania).toEqual([]);
    expect(branch.veduci).toBeNull();
    expect(branch.od).toBe("2020-01-01");
  });

  it("handles entity with undefined organizationUnits", () => {
    const entity: RpoEntityDetail = {
      id: 11111,
      identifiers: [{ value: "99999999" }],
      fullNames: [{ value: "No Units s.r.o." }],
      addresses: [],
      statutoryBodies: [],
      stakeholders: [],
      activities: [],
      // organizationUnits is undefined
    };

    const result = adapter.mapBranches(entity);

    expect(result.ico).toBe("99999999");
    expect(result.pocet).toBe(0);
    expect(result.prevadzkarne).toEqual([]);
  });
});
