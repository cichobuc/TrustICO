/**
 * SOAP client wrapper for IS REPLIK (replik-ws.justice.sk).
 *
 * Uses the `soap` npm package. Creates clients lazily and caches them
 * to avoid re-parsing WSDL on every call.
 */

import { createClientAsync, type Client } from "soap";

const REPLIK_WSDL_BASE = "https://replik-ws.justice.sk/replik";

const KONANIE_WSDL = `${REPLIK_WSDL_BASE}/konanieService?wsdl`;
const OZNAM_WSDL = `${REPLIK_WSDL_BASE}/oznamService?wsdl`;

const clients = new Map<string, Client>();

/**
 * Get or create a SOAP client for the given WSDL URL.
 * Clients are cached after first creation.
 */
async function getClient(wsdlUrl: string): Promise<Client> {
  let client = clients.get(wsdlUrl);
  if (client) return client;

  client = await createClientAsync(wsdlUrl, {
    wsdl_options: { timeout: 10_000 },
    request: undefined,
  });
  clients.set(wsdlUrl, client);
  return client;
}

/**
 * Call a SOAP operation on the konanieService.
 */
export async function callKonanieService<T>(
  operation: string,
  args: Record<string, unknown>,
): Promise<T> {
  const client = await getClient(KONANIE_WSDL);
  const methodName = `${operation}Async`;
  if (typeof (client as Record<string, unknown>)[methodName] !== "function") {
    throw new Error(`SOAP operation ${operation} not found on konanieService`);
  }
  const [result] = await (client as Record<string, (...a: unknown[]) => Promise<unknown[]>>)[methodName](args);
  return result as T;
}

/**
 * Call a SOAP operation on the oznamService.
 */
export async function callOznamService<T>(
  operation: string,
  args: Record<string, unknown>,
): Promise<T> {
  const client = await getClient(OZNAM_WSDL);
  const methodName = `${operation}Async`;
  if (typeof (client as Record<string, unknown>)[methodName] !== "function") {
    throw new Error(`SOAP operation ${operation} not found on oznamService`);
  }
  const [result] = await (client as Record<string, (...a: unknown[]) => Promise<unknown[]>>)[methodName](args);
  return result as T;
}
