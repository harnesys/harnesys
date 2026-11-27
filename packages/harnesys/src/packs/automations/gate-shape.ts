export const GATE_ARMS_SHAPE =
  '{ on: exit-code, pass?: number[] (default [0]) } | { on: stdout, match: contains|regex, value } | { on: json, path, op: truthy|exists|equals, value? }';
