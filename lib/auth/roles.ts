export const APP_ROLES = [
  "citizen",
  "dlao_officer",
  "chief_legal_aid_officer",
  "metropolitan_legal_aid_officer",
  "special_mediator",
  "paralegal",
  "udc_entrepreneur",
  "panel_lawyer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type StaffRole = Exclude<AppRole, "citizen">;
export type VerificationStatus = "unverified" | "verified" | "pending";

export interface SessionUser {
  id: string;
  displayName: string;
  role: AppRole;
  status: "active" | "disabled";
  verificationStatus: VerificationStatus;
  isMock: boolean;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  citizen: "নাগরিক",
  dlao_officer: "জেলা লিগ্যাল এইড অফিসার",
  chief_legal_aid_officer: "চিফ লিগ্যাল এইড অফিসার",
  metropolitan_legal_aid_officer: "মেট্রোপলিটান লিগ্যাল এইড অফিসার",
  special_mediator: "বিশেষ মধ্যস্থতাকারী",
  paralegal: "প্যারালিগ্যাল",
  udc_entrepreneur: "ইউডিসি উদ্যোক্তা",
  panel_lawyer: "প্যানেল আইনজীবী",
};

export const MOCK_ROLE_IDENTITIES: Record<StaffRole, Omit<SessionUser, "id" | "isMock">> = {
  dlao_officer: {
    displayName: "মো. করিম (মক)",
    role: "dlao_officer",
    status: "active",
    verificationStatus: "verified",
  },
  chief_legal_aid_officer: {
    displayName: "সাব্বির হাসান (মক)",
    role: "chief_legal_aid_officer",
    status: "active",
    verificationStatus: "verified",
  },
  metropolitan_legal_aid_officer: {
    displayName: "নাজমা সুলতানা (মক)",
    role: "metropolitan_legal_aid_officer",
    status: "active",
    verificationStatus: "verified",
  },
  special_mediator: {
    displayName: "ফারহানা আক্তার (মক)",
    role: "special_mediator",
    status: "active",
    verificationStatus: "verified",
  },
  paralegal: {
    displayName: "তানভীর আহমেদ (মক)",
    role: "paralegal",
    status: "active",
    verificationStatus: "verified",
  },
  udc_entrepreneur: {
    displayName: "রুবিনা ইয়াসমিন (মক)",
    role: "udc_entrepreneur",
    status: "active",
    verificationStatus: "verified",
  },
  panel_lawyer: {
    displayName: "অ্যাডভোকেট শফিকুল ইসলাম (মক)",
    role: "panel_lawyer",
    status: "active",
    verificationStatus: "verified",
  },
};

export function isStaffRole(role: AppRole): role is StaffRole {
  return role !== "citizen";
}

export function canAccessCase(role: AppRole, userId: string, ownerUserId: string): boolean {
  return role === "citizen" ? userId === ownerUserId : isStaffRole(role);
}
