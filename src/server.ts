import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCompanySearch } from "./tools/company-search.js";
import { registerCompanyPeople } from "./tools/company-people.js";
import { registerCompanyHistory } from "./tools/company-history.js";
import { registerCompanyBranches } from "./tools/company-branches.js";
import { registerCompanyFinancials } from "./tools/company-financials.js";
import { registerFinancialReport } from "./tools/financial-report.js";
import { registerFinancialAttachment } from "./tools/financial-attachment.js";
import { registerCompanyKuv } from "./tools/company-kuv.js";
import { registerCompanyTaxStatus } from "./tools/company-tax-status.js";
import { registerCompanyVatCheck } from "./tools/company-vat-check.js";
import { registerCompanyInsolvency } from "./tools/company-insolvency.js";
import { registerCrzOvTools } from "./tools/crz-ov-tools.js";
import { registerCompanyEuFunds } from "./tools/company-eu-funds.js";
import { registerCompanyFullProfile } from "./tools/company-full-profile.js";
import { registerCompanyCompare } from "./tools/company-compare.js";
import { registerVerifyCompanyId } from "./tools/verify-company-id.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "trustico",
    version: "1.0.0",
  });

  // Phase 2a: RPO-based tools
  registerCompanySearch(server);
  registerCompanyPeople(server);
  registerCompanyHistory(server);
  registerCompanyBranches(server);

  // Phase 2b: RegisterUZ financial tools
  registerCompanyFinancials(server);
  registerFinancialReport(server);
  registerFinancialAttachment(server); // registers both financial_attachment + financial_report_pdf

  // Phase 2c: RPVS, FinSpr, VIES tools
  registerCompanyKuv(server);
  registerCompanyTaxStatus(server);
  registerCompanyVatCheck(server);

  // Phase 2d: REPLIK, DataHub, ITMS tools
  registerCompanyInsolvency(server); // registers company_insolvency + company_insolvency_notices + insolvency_detail
  registerCrzOvTools(server); // registers crz_contracts + ov_filing
  registerCompanyEuFunds(server);

  // Phase 3: Full profile orchestration + compare
  registerCompanyFullProfile(server);
  registerCompanyCompare(server);

  // Phase 3b: Verification tools
  registerVerifyCompanyId(server);

  return server;
}
