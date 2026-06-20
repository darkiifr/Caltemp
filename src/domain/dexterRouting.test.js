import { describe, expect, it } from 'vitest';
import {
  isLikelyUnclearDexterMessage,
  normalizeUnclearDexterReply,
  shouldUseLocalDexterCommand,
} from './dexterRouting';

describe('Dexter routing', () => {
  it('routes typed calendar requests to the local engine even when AI is available', () => {
    expect(shouldUseLocalDexterCommand({
      source: 'typed',
      text: 'liste mes rappels',
      aiEnabled: true,
      aiConfigured: true,
    })).toBe(true);

    expect(shouldUseLocalDexterCommand({
      source: 'typed',
      text: 'déplace france à 21h',
      aiEnabled: true,
      aiConfigured: true,
    })).toBe(true);

    expect(shouldUseLocalDexterCommand({
      source: 'typed',
      text: "active l'alerte",
      aiEnabled: true,
      aiConfigured: true,
    })).toBe(true);

    expect(shouldUseLocalDexterCommand({
      source: 'typed',
      text: 'résume ma semaine',
      aiEnabled: true,
      aiConfigured: true,
    })).toBe(true);
  });

  it('keeps the home quick prompts on the local engine', () => {
    expect(shouldUseLocalDexterCommand({
      source: 'quick-prompt',
      aiEnabled: true,
      aiConfigured: true,
    })).toBe(true);
  });

  it('does not force web questions through the local calendar engine', () => {
    expect(shouldUseLocalDexterCommand({
      source: 'typed',
      text: 'cherche la météo sur internet',
      aiEnabled: true,
      aiConfigured: true,
    })).toBe(false);
  });

  it('detects short unclear messages without calendar intent', () => {
    expect(isLikelyUnclearDexterMessage('dubi gust genug')).toBe(true);
    expect(isLikelyUnclearDexterMessage("Créer l'anniversaire de sacha le 6 juin")).toBe(false);
  });

  it('replaces invented calendar status replies for unclear messages', () => {
    const reply = normalizeUnclearDexterReply({
      userText: 'dubi gust genug',
      assistantText: 'Titre : Mise à Jour du Calendrier Date : 2026-06-19 Statut : Normal\n\nLe calendrier est mis à jour sans alerte immédiate.',
    });

    expect(reply).toBe("Je n’ai pas compris ta demande. Reformule en précisant si tu veux créer un événement, modifier un rappel ou poser une question.");
  });
});
