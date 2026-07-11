import type { Adapter, AdapterPayload } from "oidc-provider";
import { createServiceClient } from "@/lib/supabase/service";

// Supabase-backed storage for oidc-provider, mirroring Panva's reference
// Postgres adapter (github.com/panva/node-oidc-provider discussions #1310) over
// the `oidc_payloads` table. Server-only: writes via the service-role client,
// which bypasses RLS — the table denies all client access (migration 0033).
//
// One table, keyed by (id, type). The grant_id / user_code / uid columns are
// denormalised out of the payload only so revokeByGrantId / findByUserCode /
// findByUid can index them; everything else lives in `payload` (jsonb).
export class SupabaseAdapter implements Adapter {
  constructor(private readonly type: string) {}

  private db() {
    return createServiceClient();
  }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const { error } = await this.db()
      .from("oidc_payloads")
      .upsert(
        {
          id,
          type: this.type,
          payload: payload as never,
          grant_id: payload.grantId ?? null,
          user_code: payload.userCode ?? null,
          uid: payload.uid ?? null,
          expires_at: expiresAt,
        },
        { onConflict: "id,type" },
      );
    if (error) throw new Error(`oidc adapter upsert ${this.type}: ${error.message}`);
  }

  private shape(row: {
    payload: unknown;
    consumed_at: string | null;
  }): AdapterPayload {
    const payload = (row.payload ?? {}) as AdapterPayload;
    return row.consumed_at ? { ...payload, consumed: Math.floor(Date.parse(row.consumed_at) / 1000) } : payload;
  }

  private async findBy(column: "id" | "user_code" | "uid", value: string) {
    const { data, error } = await this.db()
      .from("oidc_payloads")
      .select("payload, consumed_at, expires_at")
      .eq("type", this.type)
      .eq(column, value)
      .maybeSingle();
    if (error) throw new Error(`oidc adapter find ${this.type}: ${error.message}`);
    if (!data) return undefined;
    // Expired rows are treated as absent (cleanup is best-effort via TTL, not here).
    if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return undefined;
    return this.shape(data);
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    return this.findBy("id", id);
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.findBy("user_code", userCode);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.findBy("uid", uid);
  }

  async consume(id: string): Promise<void> {
    const { error } = await this.db()
      .from("oidc_payloads")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("type", this.type);
    if (error) throw new Error(`oidc adapter consume ${this.type}: ${error.message}`);
  }

  async destroy(id: string): Promise<void> {
    const { error } = await this.db()
      .from("oidc_payloads")
      .delete()
      .eq("id", id)
      .eq("type", this.type);
    if (error) throw new Error(`oidc adapter destroy ${this.type}: ${error.message}`);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    const { error } = await this.db().from("oidc_payloads").delete().eq("grant_id", grantId);
    if (error) throw new Error(`oidc adapter revokeByGrantId: ${error.message}`);
  }
}
