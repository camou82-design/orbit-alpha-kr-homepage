import type { KiwoomSymbol } from "./types.js";

/** Lifecycle for domestic stock orders (interface-only in phase 1). */
export enum OrderStatus {
  NEW = "NEW",
  SUBMITTED = "SUBMITTED",
  PARTIALLY_FILLED = "PARTIALLY_FILLED",
  FILLED = "FILLED",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
}

export interface OrderRequest {
  symbol: KiwoomSymbol;
  qty: number;
  side: "BUY" | "SELL";
}

export interface OrderState {
  id: string;
  status: OrderStatus;
  request: OrderRequest;
}
