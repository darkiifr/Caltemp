import { describe, expect, it } from 'vitest';
import { assertPermission } from './extensionPermissions';

describe('assertPermission', () => {
  it('allows declared permissions', () => {
    expect(() => assertPermission(['calendar:read'], 'calendar:read', 'demo')).not.toThrow();
  });

  it('blocks missing permissions with extension context', () => {
    expect(() => assertPermission([], 'calendar:write', 'demo')).toThrow(
      /demo.*calendar:write/i,
    );
  });
});
