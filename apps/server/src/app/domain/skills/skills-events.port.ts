export abstract class SkillsEventsPort {
  abstract publish(orgId: string, event: { kind: 'changed'; name?: string }): void;
  abstract subscribe(
    listener: (frame: { orgId: string; kind: 'changed'; name?: string }) => void,
  ): () => void;
}
