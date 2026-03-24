import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCompanySearch } from "./tools/company-search.js";
import { registerCompanyPeople } from "./tools/company-people.js";
import { registerCompanyHistory } from "./tools/company-history.js";
import { registerCompanyBranches } from "./tools/company-branches.js";
import { registerCompanyFinancials } from "./tools/company-financials.js";
import { registerFinancialReport } from "./tools/financial-report.js";
import { registerFinancialAttachment } from "./tools/financial-attachment.js";

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

  return server;
}
