// Dexter's agent loop: the local model answers or calls tools (dexterTools.js),
// tool results are fed back, until it produces a final answer.
import { DEXTER_TOOLS, DEXTER_TOOL_NAMES, toLocalIso } from '../domain/dexterTools';
import { parseDexterAction } from '../domain/dexterActions';

export const MAX_AGENT_STEPS = 5;

export function buildDexterSystemPrompt({ now = new Date(), settings = {}, upcoming = [] } = {}) {
  const categories = Object.entries(settings.categoryLegend || {})
    .map(([key, meta]) => `${key} (${meta?.label || key})`)
    .join(', ');
  const today = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const agenda = upcoming.length
    ? upcoming.map(event => `- ${event.date} · ${event.title} [id=${event.id}]`).join('\n')
    : '- (aucun)';

  return [
    `Tu es Dexter, l'assistant de l'agenda Caltemp. Tu tournes en local sur l'ordinateur de l'utilisateur. Réponds en français, brièvement.`,
    `Aujourd'hui : ${today} (${toLocalIso(now)}). Les dates des outils sont locales, au format AAAA-MM-JJTHH:MM.`,
    `Catégories : ${categories || 'perso'}.`,
    `Prochains événements :\n${agenda}`,
    'Règles :',
    '1. Utilise les outils pour lire ou modifier l’agenda, changer de vue, ouvrir un écran ou un réglage. N’invente jamais un événement ni un id : appelle list_events si besoin.',
    '2. Pour une date relative (demain, lundi…), calcule-la à partir d’aujourd’hui.',
    '3. Après une action, confirme en une phrase. Ne montre jamais de JSON ni de noms d’outils.',
    '4. Une suppression attend la confirmation de l’utilisateur : dis-lui de confirmer dans la discussion.',
    '5. Si la demande est floue, pose une question courte.',
  ].join('\n');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Tolerant argument parsing: small models sometimes wrap or double-encode JSON. */
export function parseToolArguments(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  let parsed = tryParseJson(raw.trim());
  if (typeof parsed === 'string') parsed = tryParseJson(parsed);
  if (parsed && typeof parsed === 'object') return parsed;
  const braces = raw.match(/\{[\s\S]*\}/);
  return (braces && tryParseJson(braces[0])) || {};
}

/**
 * Tool calls written in the text instead of the structured field:
 * `<tool_call>{"name": ..., "arguments": ...}</tool_call>` (Qwen/Hermes) or
 * the legacy ```json {"action": ...}``` blocks.
 */
export function extractInlineToolCalls(content = '') {
  const calls = [];
  for (const match of content.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g)) {
    const parsed = tryParseJson(match[1]);
    if (parsed?.name && DEXTER_TOOL_NAMES.has(parsed.name)) {
      calls.push({ name: parsed.name, arguments: parsed.arguments || parsed.parameters || {} });
    }
  }
  if (calls.length) return calls;

  const legacy = parseDexterAction(content);
  if (legacy.ok && DEXTER_TOOL_NAMES.has(legacy.action)) {
    return [{ name: legacy.action, arguments: legacy.data }];
  }

  const bare = content.trim().match(/^\{[\s\S]*\}$/) && tryParseJson(content.trim());
  if (bare?.name && DEXTER_TOOL_NAMES.has(bare.name)) {
    return [{ name: bare.name, arguments: bare.arguments || bare.parameters || {} }];
  }
  return [];
}

/** Text worth showing while a step streams (hides tool-call markup). */
export function visibleAssistantText(content = '') {
  return content
    .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '')
    .replace(/```json[\s\S]*?(```|$)/g, '')
    .replace(/<\/?think>/g, '')
    .trim();
}

/**
 * Runs the loop.
 * - `complete({ messages, tools, onDelta })` → `{ content, toolCalls }`
 * - `executeTool(name, args)` → result of `executeDexterTool`
 * Returns `{ text, actions, confirmations, closesDexter }`.
 */
export async function runDexterAgent({
  messages,
  complete,
  executeTool,
  onText,
  onToolStart,
  signal,
  maxSteps = MAX_AGENT_STEPS,
}) {
  const conversation = [...messages];
  const actions = [];
  const confirmations = [];
  let closesDexter = false;
  let lastText = '';

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await complete({
      messages: conversation,
      tools: DEXTER_TOOLS,
      onDelta: (fullText) => {
        const visible = visibleAssistantText(fullText);
        if (visible) onText?.(visible);
      },
    });

    let calls = (response.toolCalls || [])
      .filter(call => call?.function?.name)
      .map((call, index) => ({
        id: call.id || `call_${step}_${index}`,
        name: call.function.name,
        arguments: parseToolArguments(call.function.arguments),
      }));
    if (!calls.length) {
      calls = extractInlineToolCalls(response.content || '').map((call, index) => ({
        id: `call_${step}_${index}`,
        name: call.name,
        arguments: parseToolArguments(call.arguments),
      }));
    }

    lastText = visibleAssistantText(response.content || '');
    if (!calls.length) {
      return { text: lastText, actions, confirmations, closesDexter };
    }

    conversation.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: calls.map(call => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    });

    for (const call of calls) {
      onToolStart?.(call.name, call.arguments);
      let outcome;
      try {
        outcome = await executeTool(call.name, call.arguments);
      } catch (error) {
        outcome = { ok: false, result: { error: error?.message || String(error) } };
      }
      actions.push({ name: call.name, ok: outcome.ok, display: outcome.display || '' });
      if (outcome.confirmation) confirmations.push(outcome.confirmation);
      if (outcome.closesDexter) closesDexter = true;
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(outcome.result ?? {}),
      });
    }

    // The calendar takes over the screen: no need for another model round.
    if (closesDexter) return { text: lastText, actions, confirmations, closesDexter };
  }

  return {
    text: lastText || 'J’ai effectué plusieurs actions mais je n’ai pas pu conclure. Reformulez si besoin.',
    actions,
    confirmations,
    closesDexter,
  };
}
