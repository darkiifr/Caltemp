import { fetch } from '@tauri-apps/plugin-http';

export async function searchWeb(query) {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const response = await fetch(url, {
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

export async function generateText({ apiKey, model, messages, context, onChunk, signal, think = false }) {
    if (!apiKey) throw new Error("Clé API manquante");

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

    try {
        const payload = {
            model: model || 'mistralai/mistral-7b-instruct',
            messages: finalMessages,
            temperature: think ? 0.9 : 0.7,
            max_tokens: 4000,
            stream: !!onChunk
        };

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
            } catch (e) {
                // Keep generic message if JSON parsing fails
            }

            // Map standard status codes to user-friendly messages
            switch (response.status) {
                case 401: throw new Error("Clé API invalide. Veuillez vérifier vos paramètres.");
                case 402: throw new Error("Crédits insuffisants sur OpenRouter.");
                case 403: throw new Error("Accès refusé. Le contenu a peut-être été filtré ou votre limite est atteinte.");
                case 404: throw new Error("Modèle non trouvé ou indisponible pour le moment.");
                case 429: throw new Error("Limite de requêtes atteinte. Réessayez dans un instant.");
                case 502: 
                case 503: throw new Error("Le fournisseur du modèle est actuellement hors ligne. Essayez un autre modèle.");
                default: throw new Error(errorMsg);
            }
        }

        // --- NON-STREAMING MODE ---
        if (!onChunk) {
            const data = await response.json();
            if (data.error) throw new Error(data.error.message || "Erreur API inconnue");
            return data.choices[0].message.content;
        }

        // --- STREAMING MODE ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let isFirstChunk = true;
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // Keep the incomplete line in the buffer

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

                        const choice = json.choices?.[0];
                        if (choice?.finish_reason === "error") {
                            throw new Error("Le flux a été interrompu par une erreur du fournisseur.");
                        }

                        const content = choice?.delta?.content || "";
                        if (content || isFirstChunk) {
                            fullText += content;
                            onChunk(fullText, content, isFirstChunk);
                            isFirstChunk = false;
                        }
                    } catch (e) {
                        // Re-throw if it's our custom Error, otherwise ignore (partial chunks)
                        if (e instanceof Error && e.message !== "Unexpected end of JSON input" && !e.message.includes("JSON")) {
                            throw e;
                        }
                    }
                }
            }
        }

        return fullText;

    } catch (error) {
        if (error.name === 'AbortError') {
            throw error;
        }
        console.error("AI Service Error:", error);
        throw error;
    }
}
