/** Thrown by normalizer/codec stubs that are specified but not yet implemented. */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented yet (Phase A stub)`);
    this.name = "NotImplementedError";
  }
}
