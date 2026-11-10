export abstract class AddonReasonsToLivePort {
  abstract hasReason(orgId: string, addonId: string): boolean;
}
