import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export const OPENROUTER_FREE_MODEL_IDS = [
    'openai/gpt-oss-120b:free',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free'
];
export const OPENROUTER_FREE_MODEL_ID = OPENROUTER_FREE_MODEL_IDS[0];
export const FREE_MODEL_PREFERENCES = OPENROUTER_FREE_MODEL_IDS;
export const FALLBACK_FREE_MODELS = OPENROUTER_FREE_MODEL_IDS;

export function getOpenRouterApiKey() {
    return import.meta.env.VITE_OPENROUTER_API_KEY?.trim() || '';
}

export function isAiConfigured() {
    return Boolean(getOpenRouterApiKey());
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

        if (response.ok) {
            const data = await response.json();
            let results = [];
            
            if (data.AbstractText) {
                results.push({ title: data.AbstractSource || "Résumé", snippet: data.AbstractText, link: data.AbstractURL });
            }
            
            if (data.RelatedTopics) {
                data.RelatedTopics.forEach(topic => {
                    if (topic.Text && results.length < 8) {
                        results.push({ title: "Infos", snippet: topic.Text, link: topic.FirstURL });
                    }
                    if (topic.Topics) {
                        topic.Topics.forEach(subtopic => {
                            if (subtopic.Text && results.length < 8) {
                                results.push({ title: "Détail", snippet: subtopic.Text, link: subtopic.FirstURL });
                            }
                        });
                    }
                });
            }

            return results.length > 0 ? results : null;
        }
        return null;
    } catch (error) {
        console.error("Web Search Error:", error);
        return null;
    }
}

function isZeroCost(value) {
    return Number(value) === 0;
}

function isTextOutputModel(model = {}) {
    const output = model.architecture?.output_modalities;
    if (Array.isArray(output)) return output.includes('text');
    if (typeof model.architecture?.modality === 'string') return /->.*text/.test(model.architecture.modality);
    return true;
}

function isExpired(model = {}, now = new Date()) {
    const expirationDate = model.expiration_date || model.expirationDate;
    if (!expirationDate) return false;
    const expiry = new Date(expirationDate);
    return !Number.isNaN(expiry.getTime()) && expiry <= now;
}

export function selectFreeOpenRouterModels(models = [], { now = new Date(), limit = 3 } = {}) {
    const usable = models
        .filter(model => model?.id && model.id !== OPENROUTER_FREE_MODEL_ID)
        .filter(model => isZeroCost(model.pricing?.prompt) && isZeroCost(model.pricing?.completion))
        .filter(model => isTextOutputModel(model))
        .filter(model => !isExpired(model, now));

    const usableIds = new Set(usable.map(model => model.id));
    return OPENROUTER_FREE_MODEL_IDS
        .filter(id => id === OPENROUTER_FREE_MODEL_ID || usableIds.has(id))
        .slice(0, limit);
}

function fallbackFreeModelEntries() {
    return FALLBACK_FREE_MODELS.map((id) => ({
        id,
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['temperature'],
    }));
}

async function getFreeModelsToTry() {
    return selectFreeOpenRouterModels(fallbackFreeModelEntries());
}

function createOpenRouterError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function shouldRetryOpenRouterError(error) {
    if (!error) return false;
    if (error.name === 'AbortError') return false;
    const status = error.status || error.response?.status;
    if ([401, 402, 403].includes(status)) return false;
    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    const message = String(error.message || error).toLocaleLowerCase('fr-FR');
    if (message.includes('clé openrouter') || message.includes('crédits insuffisants') || message.includes("n'est pas configurée")) return false;
    return message.includes('timeout')
        || message.includes('rate limit')
        || message.includes('limite de requêtes')
        || message.includes('indisponible')
        || message.includes('hors ligne')
        || message.includes('empty response')
        || message.includes('réponse vide')
        || message.includes('provider');
}

async function executeGenerateText({ modelId, messages, context, onChunk, signal, think = false, maxTokens }) {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) throw new Error("L'intégration IA n'est pas configurée dans ce build.");

    // Add context to system prompt if provided
    let finalMessages = [...messages];
    
    const systemMsgIndex = finalMessages.findIndex(m => m.role === 'system');
    let systemContent = systemMsgIndex !== -1 ? finalMessages[systemMsgIndex].content : "";

    if (context) {
        systemContent += `\n\nCONTEXTE DE RECHERCHE WEB:\n${context}`;
    }

    if (think) {
        systemContent += `\n\nDIRECTIVE DE RÉFLEXION:\nAvant de donner ta réponse finale, analyse en profondeur la demande de l'utilisateur. Enveloppe toute ta réflexion et ton cheminement intellectuel dans des balises <thought>...</thought>. Ne montre pas ces balises à l'utilisateur final si tu n'es pas explicitement interrogé sur ta réflexion, mais utilise-les systématiquement pour structurer ton "raisonnement interne".`;
    }

    if (systemMsgIndex !== -1) {
        finalMessages[systemMsgIndex].content = systemContent;
    } else if (systemContent) {
        finalMessages.unshift({ role: 'system', content: systemContent });
    }

    // Wrap onChunk to detect and throw on safety verdicts
    let wrappedOnChunk = onChunk;
    let released = false;
    
    if (onChunk) {
        wrappedOnChunk = (fullText, chunk, isFirstChunk) => {
            if (released) {
                onChunk(fullText, chunk, isFirstChunk);
                return;
            }
            
            // Check if the output is starting to look like a content safety verdict
            const lowerText = fullText.toLowerCase().trim();
            if ("user safety: safe".startsWith(lowerText) || "user safety: unsafe".startsWith(lowerText)) {
                // Keep buffering to see if it is a safety verdict
                if (/^user safety:/i.test(lowerText)) {
                    throw new Error("SafetyVerdictError");
                }
                return;
            }
            
            // Not a safety verdict, release the buffered text
            released = true;
            onChunk(fullText, fullText, true);
        };
    }

    const payload = {
        model: modelId,
        messages: finalMessages,
        temperature: think ? 0.9 : 0.7,
        max_tokens: maxTokens || (think ? 2200 : 1200),
        stream: !!onChunk
    };
    if (onChunk) {
        payload.stream_options = { include_usage: true };
    }

    const response = await window.fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://caltemp.app',
            'X-Title': 'Caltemp'
        },
        body: JSON.stringify(payload),
        signal
    });

    if (!response.ok) {
        let errorMsg = `Erreur ${response.status}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error?.message || errorMsg;
        } catch {
            // Keep generic message if JSON parsing fails
        }

        // Map standard status codes to user-friendly messages
        switch (response.status) {
            case 401: throw new Error("Clé OpenRouter invalide dans ce build.");
            case 402: throw createOpenRouterError(response.status, "Crédits insuffisants sur OpenRouter.");
            case 403: throw createOpenRouterError(response.status, "Accès refusé. Le contenu a peut-être été filtré ou votre limite est atteinte.");
            case 404: throw createOpenRouterError(response.status, "Modèle gratuit indisponible pour le moment.");
            case 429: throw createOpenRouterError(response.status, "Limite de requêtes atteinte. Réessayez dans un instant.");
            case 502: 
            case 503: throw createOpenRouterError(response.status, "Modèle gratuit actuellement hors ligne. Réessayez dans un instant.");
            default: throw createOpenRouterError(response.status, errorMsg);
        }
    }

    // --- NON-STREAMING MODE ---
    if (!onChunk) {
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || "Erreur API inconnue");
        const content = data.choices[0].message.content;
        if (!content?.trim()) throw createOpenRouterError(502, 'Réponse vide du fournisseur.');
        
        if (/^User Safety:/i.test(content.trim())) {
            throw new Error("SafetyVerdictError");
        }
        
        emitAiUsage({
            model: modelId,
            actualModel: data.model || modelId,
            usage: data.usage || null,
        });
        return content;
    }

    // --- STREAMING MODE ---
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let isFirstChunk = true;
    let streamBuffer = "";
    let streamedUsage = null;
    let streamedModel = modelId;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || ""; // Keep the incomplete line in the buffer

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                if (trimmedLine.startsWith('data: ')) {
                    const dataStr = trimmedLine.slice(6);
                    if (dataStr === '[DONE]') break;

                    try {
                        const json = JSON.parse(dataStr);
                        
                        // Check for mid-stream errors
                        if (json.error) {
                            throw new Error(json.error.message || "Erreur pendant le streaming");
                        }

                        if (json.model) streamedModel = json.model;
                        if (json.usage) streamedUsage = json.usage;

                        const choice = json.choices?.[0];
                        if (choice?.finish_reason === "error") {
                            throw new Error("Le flux a été interrompu par une erreur du fournisseur.");
                        }

                        const content = choice?.delta?.content || "";
                        if (content || isFirstChunk) {
                            fullText += content;
                            wrappedOnChunk(fullText, content, isFirstChunk);
                            isFirstChunk = false;
                        }
                    } catch (e) {
                        if (e.message === "SafetyVerdictError") throw e;
                        // Re-throw if it's our custom Error, otherwise ignore (partial chunks)
                        if (e instanceof Error && e.message !== "Unexpected end of JSON input" && !e.message.includes("JSON")) {
                            throw e;
                        }
                    }
                }
            }
        }
    } catch (e) {
        if (e.message === "SafetyVerdictError") throw e;
        throw e;
    }

    emitAiUsage({
        model: modelId,
        actualModel: streamedModel,
        usage: streamedUsage,
    });

    return fullText;
}

export async function generateText({ messages, context, onChunk, signal, think = false, maxTokens }) {
    if (!getOpenRouterApiKey()) throw new Error("L'intégration IA n'est pas configurée dans ce build.");

    const modelsToTry = await getFreeModelsToTry();

    let lastError = null;
    for (let i = 0; i < modelsToTry.length; i++) {
        const modelId = modelsToTry[i];
        try {
            return await executeGenerateText({
                modelId,
                messages,
                context,
                onChunk,
                signal,
                think,
                maxTokens
            });
        } catch (error) {
            // If the request was aborted by the user/signal, do not retry
            if (error.name === 'AbortError' || signal?.aborted) {
                throw error;
            }
            
            if (!shouldRetryOpenRouterError(error)) {
                throw error;
            }
            
            console.warn(`AI request failed with model ${modelId}. Error: ${error.message || error}. Retrying with next model...`);
            lastError = error;
        }
    }
    
    throw lastError || new Error("Échec de la génération de texte après avoir essayé tous les modèles disponibles.");
}
