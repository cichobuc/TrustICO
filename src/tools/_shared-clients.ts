/**
 * Shared client instances for all tools.
 *
 * All tools MUST import from here to ensure a single HttpClient
 * instance is used — this guarantees correct rate limiting.
 */

import { HttpClient } from "../utils/http-client.js";
import { RpoAdapter } from "../adapters/rpo.adapter.js";
import { RuzAdapter } from "../adapters/ruz.adapter.js";
import { RpvsAdapter } from "../adapters/rpvs.adapter.js";
import { FinsprAdapter } from "../adapters/finspr.adapter.js";
import { ViesAdapter } from "../adapters/vies.adapter.js";
import { RuzPipeline } from "../orchestrator/ruz-pipeline.js";
import { IcoResolver } from "../orchestrator/resolver.js";

export const sharedHttpClient = new HttpClient();
export const sharedRpoAdapter = new RpoAdapter(sharedHttpClient);
export const sharedRuzAdapter = new RuzAdapter(sharedHttpClient);
export const sharedRpvsAdapter = new RpvsAdapter(sharedHttpClient);
export const sharedFinsprAdapter = new FinsprAdapter(sharedHttpClient);
export const sharedViesAdapter = new ViesAdapter(sharedHttpClient);
export const sharedRuzPipeline = new RuzPipeline(sharedRuzAdapter);
export const sharedResolver = new IcoResolver(sharedHttpClient);
