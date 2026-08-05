import type { TransportEvent, WorkspaceSummary } from "data-layer/contracts";

export type GatewayClientRequest = {
  workspaceId: WorkspaceSummary["id"];
  message: string;
};

export type GatewayClientEvent = TransportEvent;
