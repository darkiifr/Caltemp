import { describe, expect, it } from 'vitest';
import { insertDictationText } from './Editor';

describe('Editor dictation insertion', () => {
  it('inserts final dictation at the current cursor position', () => {
    expect(insertDictationText('Bonjour monde', 'cher ', 8, 8)).toEqual({
      content: 'Bonjour cher monde',
      cursor: 12,
    });
  });

  it('replaces the selected text and keeps natural spacing', () => {
    expect(insertDictationText('Bonjour ancien monde', 'nouveau', 8, 14)).toEqual({
      content: 'Bonjour nouveau monde',
      cursor: 15,
    });
  });
});
