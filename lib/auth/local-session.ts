import type { SessionUser } from "./roles";

interface LocalSessionRecord {
  user: SessionUser;
  expiresAt: number;
}

interface LocalAuthStore {
  sessions: Map<string, LocalSessionRecord>;
  intakes: Map<string, LocalSessionRecord & { token: string }>;
}

const globalAuth = globalThis as typeof globalThis & {
  __legalVoiceAuthStore?: LocalAuthStore;
};

function getStore(): LocalAuthStore {
  if (!globalAuth.__legalVoiceAuthStore) {
    globalAuth.__legalVoiceAuthStore = { sessions: new Map(), intakes: new Map() };
  }
  return globalAuth.__legalVoiceAuthStore;
}

export function createLocalCitizenSession(
  displayName: string,
  phone: string | null,
  intakeId?: string,
): {
  user: SessionUser;
  token: string;
  expiresAt: Date;
} {
  if (intakeId) {
    const existing = getStore().intakes.get(intakeId);
    if (existing) {
      return { user: existing.user, token: existing.token, expiresAt: new Date(existing.expiresAt) };
    }
  }

  const id = `CIT-${crypto.randomUUID()}`;
  const token = `local-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const user: SessionUser = {
    id,
    displayName: displayName.trim() || "নাগরিক",
    role: "citizen",
    status: "active",
    verificationStatus: phone ? "pending" : "unverified",
    isMock: false,
  };
  const record = { user, expiresAt: expiresAt.getTime() };
  getStore().sessions.set(token, record);
  if (intakeId) getStore().intakes.set(intakeId, { ...record, token });
  return { user, token, expiresAt };
}

export function getLocalSessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const record = getStore().sessions.get(token);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) getStore().sessions.delete(token);
    return null;
  }
  return record.user;
}
