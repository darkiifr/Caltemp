import { describe, expect, it } from 'vitest';
import { insertPromptDictationText, getDictationUnavailableMessage } from './ai-prompt-box';

describe('PromptInputBox dictation helpers', () => {
  it('inserts dictated text naturally without creating an audio attachment', () => {
    expect(insertPromptDictationText('Crée un rappel', 'demain à 9h')).toBe('Crée un rappel demain à 9h');
  });

  it('replaces selected input text with final dictation text', () => {
    expect(insertPromptDictationText('Crée ancien rappel', 'nouveau', 5, 11)).toBe('Crée nouveau rappel');
  });

  it('explains unsupported dictation without suggesting audio upload to the chat model', () => {
    expect(getDictationUnavailableMessage()).toBe('Dictée non disponible dans ce WebView.');
  });
});
