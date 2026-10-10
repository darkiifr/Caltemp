// Dexter's language model runs locally: llama.cpp's `llama-server`, started on
// demand by the native layer (see services/localAi.js). It speaks the
// OpenAI-compatible chat API, including streaming and tool calls.
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  ensureLocalServer,
  getCachedLocalAiStatus,
  isModelReady,
  normalizeLocalAiSettings,
  touchLocalServer,
} from './localAi';

const TOUCH_INTERVAL_MS = 15000;

/** Synchronous check based on the last known native status. */
export function isAiConfigured(settings = {}) {
  return isModelReady(getCachedLocalAiStatus(), settings?.localAi ?? settings);
}

function emitAiUsage(detail) {
  if (typeof window === 'undefined' || !detail) return;
  window.dispatchEvent(new CustomEvent('caltemp:ai-usage', {
    detail: {
      requestedAt: new Date().toISOString(),
      ...detail,
    },
  }));
}

export async function searchWeb(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const response = await tauriFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Caltemp/1.0' }
    });
    if (!response.ok) return null;

    const data = await response.json();
    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.AbstractSource || 'Résumé', snippet: data.AbstractText, link: data.AbstractURL });
    }
    for (const topic of data.RelatedTopics || []) {
      if (topic.Text && results.length < 8) {
        results.push({ title: 'Infos', snippet: topic.Text, link: topic.FirstURL });
      }
      for (const subtopic of topic.Topics || []) {
        if (subtopic.Text && results.length < 8) {
          results.push({ title: 'Détail', snippet: subtopic.Text, link: subtopic.FirstURL });
        }
      }
    }
    return results.length > 0 ? results : null;
  } catch (error) {
    console.error('Web Search Error:', error);
    return null;
  }
}

// The WebView's fetch streams natively; the HTTP plugin is a fallback for
// WebViews that refuse loopback requests from the app origin.
async function postToLocalServer(url, init) {
  try {
    return await window.fetch(url, init);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return tauriFetch(url, init);
  }
}

function friendlyHttpError(status, message) {
  if (status === 400 && /context|n_ctx|too long|exceeds/i.test(message)) {
    return 'La conversation est trop longue pour le modèle local. Démarrez une nouvelle discussion.';
  }
  if (status === 401) return 'Le serveur local a refusé la requête. Réessayez.';
  if (status === 503) return 'Le modèle local est en cours de chargement. Réessayez dans un instant.';
  return message || `Erreur du modèle local (${status}).`;
}

/** Merges streamed `tool_calls` deltas (sent piece by piece, keyed by index). */
export function mergeToolCallDeltas(toolCalls, deltas = []) {
  for (const delta of deltas) {
    const index = Number.isInteger(delta.index) ? delta.index : toolCalls.length;
    const current = toolCalls[index] || { id: '', type: 'function', function: { name: '', arguments: '' } };
    if (delta.id) current.id = delta.id;
    if (delta.function?.name) current.function.name += delta.function.name;
    if (delta.function?.arguments) current.function.arguments += delta.function.arguments;
    toolCalls[index] = current;
  }
  return toolCalls;
}

/** Reads an OpenAI-style SSE stream. */
export async function readChatStream(body, { onDelta } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;
  let model = '';
  const toolCalls = [];
  let lastTouch = Date.now();

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') return true;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return false;
    }
    if (json.error) throw new Error(json.error.message || 'Erreur pendant la génération.');
    if (json.model) model = json.model;
    if (json.usage) usage = json.usage;
    const delta = json.choices?.[0]?.delta || {};
    if (Array.isArray(delta.tool_calls)) mergeToolCallDeltas(toolCalls, delta.tool_calls);
    if (delta.content) {
      content += delta.content;
      onDelta?.(content, delta.content);
    }
    return false;
  };

  let finished = false;
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (handleLine(line)) {
        finished = true;
        break;
      }
    }
    if (Date.now() - lastTouch > TOUCH_INTERVAL_MS) {
      lastTouch = Date.now();
      touchLocalServer();
    }
  }
  if (!finished && buffer) handleLine(buffer);
  return { content, toolCalls: toolCalls.filter(Boolean), usage, model };
}

/**
 * One chat completion against the local model.
 * Returns `{ content, toolCalls, usage, model }`.
 */
export async function chatCompletion({
  messages,
  tools,
  settings = {},
  signal,
  onDelta,
  maxTokens = 1024,
  temperature = 0.4,
}) {
  const local = normalizeLocalAiSettings(settings?.localAi ?? settings);
  const send = async () => {
    const server = await ensureLocalServer(local);
    const payload = {
      model: server.modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (tools?.length) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }
    const response = await postToLocalServer(`${server.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${server.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
    return { server, response };
  };

  let attempt;
  try {
    attempt = await send();
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    // The idle watchdog may have stopped the server between two calls: start it again once.
    attempt = await send();
  }

  const { server, response } = attempt;
  if (!response.ok) {
    let message = '';
    try {
      const data = await response.json();
      message = data?.error?.message || '';
    } catch {
      // Keep the generic message.
    }
    throw new Error(friendlyHttpError(response.status, message));
  }

  const result = await readChatStream(response.body, { onDelta });
  emitAiUsage({ model: server.modelId, actualModel: server.modelId, usage: result.usage });
  touchLocalServer();
  return { ...result, model: server.modelId };
}

/** Plain text generation (used outside Dexter's agent loop). */
export async function generateText({ messages, context, onChunk, signal, think = false, maxTokens, settings = {} }) {
  const finalMessages = messages.map(message => ({ ...message }));
  const extra = [];
  if (context) extra.push(`CONTEXTE :\n${context}`);
  if (think) {
    extra.push('Avant ta réponse finale, raisonne étape par étape dans des balises <thought>...</thought>, puis donne la réponse.');
  }
  if (extra.length) {
    const systemIndex = finalMessages.findIndex(message => message.role === 'system');
    if (systemIndex >= 0) {
      finalMessages[systemIndex].content = `${finalMessages[systemIndex].content}\n\n${extra.join('\n\n')}`;
    } else {
      finalMessages.unshift({ role: 'system', content: extra.join('\n\n') });
    }
  }

  let first = true;
  const { content } = await chatCompletion({
    messages: finalMessages,
    settings,
    signal,
    maxTokens: maxTokens || (think ? 1600 : 800),
    temperature: think ? 0.6 : 0.4,
    onDelta: onChunk
      ? (fullText, chunk) => {
          onChunk(fullText, chunk, first);
          first = false;
        }
      : undefined,
  });
  if (!content?.trim()) throw new Error('Le modèle local a renvoyé une réponse vide.');
  return content;
}
