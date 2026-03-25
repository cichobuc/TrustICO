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
import { ReplikAdapter } from "../adapters/replik.adapter.js";
import { DatahubAdapter } from "../adapters/datahub.adapter.js";
import { ItmsAdapter } from "../adapters/itms.adapter.js";
import { RuzPipeline } from "../orchestrator/ruz-pipeline.js";
import { IcoResolver } from "../orchestrator/resolver.js";
import { FullProfileOrchestrator } from "../orchestrator/full-profile.js";

export const sharedHttpClient = new HttpClient();
export const sharedRpoAdapter = new RpoAdapter(sharedHttpClient);
export const sharedRuzAdapter = new RuzAdapter(sharedHttpClient);
export const sharedRpvsAdapter = new RpvsAdapter(sharedHttpClient);
export const sharedFinsprAdapter = new FinsprAdapter(sharedHttpClient);
export const sharedViesAdapter = new ViesAdapter(sharedHttpClient);
export const sharedReplikAdapter = new ReplikAdapter();
export const sharedDatahubAdapter = new DatahubAdapter(sharedHttpClient);
export const sharedItmsAdapter = new ItmsAdapter(sharedHttpClient);
export const sharedRuzPipeline = new RuzPipeline(sharedRuzAdapter);
export const sharedResolver = new IcoResolver(sharedHttpClient);
export const sharedFullProfile = new FullProfileOrchestrator(
  sharedRpoAdapter,
  sharedRuzPipeline,
  sharedRpvsAdapter,
  sharedFinsprAdapter,
  sharedViesAdapter,
  sharedReplikAdapter,
  sharedItmsAdapter,
);
