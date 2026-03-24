/**
 * Shared client instances for RUZ-based tools.
 *
 * All RUZ tools MUST import from here to ensure a single HttpClient
 * instance is used — this guarantees correct rate limiting (30 req/min).
 */

import { HttpClient } from "../utils/http-client.js";
import { RuzAdapter } from "../adapters/ruz.adapter.js";
import { RuzPipeline } from "../orchestrator/ruz-pipeline.js";

export const sharedHttpClient = new HttpClient();
export const sharedRuzAdapter = new RuzAdapter(sharedHttpClient);
export const sharedRuzPipeline = new RuzPipeline(sharedRuzAdapter);
