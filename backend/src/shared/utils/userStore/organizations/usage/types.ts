export type UsageParams = {
  orgId: string;
  tokenCost: number;
  billedCost: number;
  action: string;
  requests?: number;
  keySetId?: string;
  keyId?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
};
