import { ScuteBaseHttp } from "./lib/ScuteBaseHttp";
import { accessTokenHeader } from "./lib/helpers";
import type { UniqueIdentifier } from "./lib/types/general";

// ── Types ──

export type VerificationStatus =
  | "pending"
  | "verified"
  | "failed"
  | "expired"
  | "cancelled"
  | "denied";

export type VerificationMethod =
  | "email_otp"
  | "sms_otp"
  | "magic_link"
  | "totp"
  | "webauthn"
  | "push";

export type Verification = {
  id: UniqueIdentifier;
  verification_id: UniqueIdentifier;
  status: VerificationStatus;
  channel: string;
  verification_type: string;
  reason: string;
  intent: string;
  intent_fields: Record<string, unknown>;
  identifier: string;
  metadata: Record<string, unknown>;
  recipient: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  purpose: string;
  challenge_method: VerificationMethod;
  token: string;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  verified_at: string | null;
  remaining_attempts: number;
  max_attempts: number;
};

export type VerificationListParams = {
  status?: VerificationStatus;
  page?: number;
  limit?: number;
};

export type VerificationRisk = {
  score: number;
  level: string;
  signals: string[];
  recommendation: string;
  details: Record<string, unknown>;
};

export type VerificationResult = {
  verification: Verification;
};

// ── API Class ──

export type ScuteVerifyApiConfig = {
  appId: UniqueIdentifier;
  baseUrl?: string;
  errorReporting?: boolean;
  getAccessToken: () => Promise<string | null>;
};

class ScuteVerifyApi extends ScuteBaseHttp {
  private readonly appId: UniqueIdentifier;
  private readonly getAccessToken: () => Promise<string | null>;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastSeenId: UniqueIdentifier | null = null;
  private listeners: Set<(verification: Verification) => void> = new Set();

  constructor(config: ScuteVerifyApiConfig) {
    const baseUrl = config.baseUrl || "https://api.scute.io";
    super(config.errorReporting ?? false, baseUrl);
    this.appId = config.appId;
    this.getAccessToken = config.getAccessToken;
  }

  private async authHeaders(): Promise<HeadersInit> {
    const token = await this.getAccessToken();
    if (!token) return {};
    return accessTokenHeader(token);
  }

  /**
   * List verifications for the current user.
   */
  async list(params?: VerificationListParams) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return this.get<{ verifications: Verification[] }>(
      `/v1/verify/${this.appId}/verifications${query}`,
      await this.authHeaders()
    );
  }

  /**
   * List all verifications for the app (admin/management).
   */
  async listAll(params?: VerificationListParams) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString() ? `?${qs.toString()}` : "";

    return this.get<{ verifications: Verification[] }>(
      `/v1/verify/${this.appId}/verifications/app${query}`,
      await this.authHeaders()
    );
  }

  /**
   * Get a single verification by ID.
   */
  async getById(id: UniqueIdentifier) {
    return this.get<VerificationResult>(
      `/v1/verify/${this.appId}/verifications/${id}`,
      await this.authHeaders()
    );
  }

  /**
   * Approve a pending verification.
   */
  async approve(id: UniqueIdentifier) {
    return this.post<VerificationResult>(
      `/v1/verify/${this.appId}/verifications/${id}/approve`,
      null,
      await this.authHeaders()
    );
  }

  /**
   * Deny a pending verification.
   */
  async deny(id: UniqueIdentifier, reason?: string) {
    return this.post<VerificationResult>(
      `/v1/verify/${this.appId}/verifications/${id}/deny`,
      { reason },
      await this.authHeaders()
    );
  }

  /**
   * Resend a verification (creates a fresh challenge with the same params).
   */
  async resend(id: UniqueIdentifier) {
    return this.post<VerificationResult>(
      `/v1/verify/${this.appId}/verifications/${id}/resend`,
      null,
      await this.authHeaders()
    );
  }

  /**
   * Cancel a pending verification.
   */
  async cancel(id: UniqueIdentifier) {
    return this.delete(
      `/v1/verify/${this.appId}/verifications/${id}`,
      await this.authHeaders()
    );
  }

  /**
   * Verify an OTP code against a verification.
   */
  async verifyCode(id: UniqueIdentifier, code: string) {
    return this.post<VerificationResult>(
      `/v1/verify/${this.appId}/verifications/${id}/verify`,
      { code },
      await this.authHeaders()
    );
  }

  /**
   * Subscribe to new verifications. Polls every `intervalMs` (default 3000ms).
   * Returns an unsubscribe function.
   */
  onNew(
    callback: (verification: Verification) => void,
    intervalMs: number = 3000
  ): () => void {
    this.listeners.add(callback);

    // Start polling if not already running
    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(() => this.pollForNew(), intervalMs);
    }

    // Return unsubscribe
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0 && this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
    };
  }

  /**
   * Stop all polling.
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.listeners.clear();
  }

  private async pollForNew() {
    try {
      const { data } = await this.list({ status: "pending", limit: 10 });
      if (!data?.verifications) return;

      for (const v of data.verifications) {
        // Only notify for verifications we haven't seen
        if (this.lastSeenId && v.id <= this.lastSeenId) continue;

        for (const listener of this.listeners) {
          try {
            listener(v);
          } catch {
            // Don't let listener errors break the poll
          }
        }
      }

      if (data.verifications.length > 0) {
        this.lastSeenId = data.verifications[0].id;
      }
    } catch {
      // Silently handle polling errors
    }
  }
}

export default ScuteVerifyApi;
