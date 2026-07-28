import '@testing-library/jest-dom/vitest';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

afterEach(() => {
  cleanup();
  // Prevent persisted locale/state from bleeding across tests.
  window.localStorage.clear();
  document.documentElement.lang = 'en';
});
