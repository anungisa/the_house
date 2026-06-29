import { randomUUID } from 'node:crypto';

/**
 * UUID abstraction (scaffold).
 *
 * Injecting an IdGenerator keeps id creation deterministic and testable. Domain code
 * should depend on this rather than calling crypto directly.
 */

export interface IdGenerator {
  /** Generate a new unique identifier (UUID v4 by default). */
  newId(): string;
}

export const uuidGenerator: IdGenerator = {
  newId: () => randomUUID(),
};
