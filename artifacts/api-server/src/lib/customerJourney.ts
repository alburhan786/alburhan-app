import type { Response } from "express";

const clientMap = new Map<string, Set<Response>>();

export function addCustomerSseClient(bookingId: string, res: Response): void {
  if (!clientMap.has(bookingId)) clientMap.set(bookingId, new Set());
  clientMap.get(bookingId)!.add(res);
}

export function removeCustomerSseClient(bookingId: string, res: Response): void {
  const clients = clientMap.get(bookingId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) clientMap.delete(bookingId);
}

export function broadcastCustomerJourneyUpdate(bookingId: string, journeyStatus: string): void {
  const clients = clientMap.get(bookingId);
  if (!clients?.size) return;
  const payload = `event: journey_update\ndata: ${JSON.stringify({ journeyStatus, ts: new Date().toISOString() })}\n\n`;
  for (const client of [...clients]) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
  console.log(`[CustomerJourney] SSE → ${clients.size} client(s) booking=${bookingId} status=${journeyStatus}`);
}
