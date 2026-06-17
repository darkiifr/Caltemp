import { describe, expect, it } from 'vitest';
import {
  DATE_PICKER_DAY_BUTTON_CLASS,
  DATE_PICKER_POPOVER_CLASS,
  DATE_PICKER_POPOVER_STYLE,
} from './datePickerStyles';

describe('datePickerStyles', () => {
  it('uses explicit dark desktop-safe popover styles', () => {
    expect(DATE_PICKER_POPOVER_CLASS).toContain('caltemp-date-popover');
    expect(DATE_PICKER_POPOVER_CLASS).not.toContain('bg-white');
    expect(DATE_PICKER_POPOVER_STYLE.colorScheme).toBe('dark');
    expect(DATE_PICKER_POPOVER_STYLE.backgroundColor).toContain('24, 24, 27');
  });

  it('forces date buttons away from native WebView button colors', () => {
    expect(DATE_PICKER_DAY_BUTTON_CLASS).toContain('appearance-none');
    expect(DATE_PICKER_DAY_BUTTON_CLASS).toContain('bg-transparent');
  });
});
