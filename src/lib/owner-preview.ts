export const ownerPreviewCookieName = "roastmycv-owner-preview";
export const ownerPreviewModeStorageKey = "roastmycv-owner-preview-mode";

export const ownerPreviewModes = [
  "actual",
  "unpaid",
  "rewrite_paid",
  "full_paid",
] as const;

export type OwnerPreviewMode = (typeof ownerPreviewModes)[number];

export function isOwnerPreviewMode(value: string): value is OwnerPreviewMode {
  return ownerPreviewModes.includes(value as OwnerPreviewMode);
}
