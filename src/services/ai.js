import { fetch } from '@tauri-apps/plugin-http';

export async function generateText({ apiKey, model, messages, context }) {
    if (!apiKey) throw new Error("Clé API manquante");

    // Add context to system prompt if provided
    let finalMessages = [...messages];
    if (context) {
        const systemMsgIndex = finalMessages.findIndex(m => m.role === 'system');
        if (systemMsgIndex !== -1) {
            finalMessages[systemMsgIndex].content += `\n\nContexte actuel : ${context}`;
        } else {
            finalMessages.unshift({ role: 'system', content: `Contexte actuel : ${context}` });
        }
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://caltemp.app', // Required by OpenRouter
                'X-Title': 'Caltemp'
            },
            body: JSON.stringify({
                model: model || 'mistralai/mistral-7b-instruct',
                messages: finalMessages,
                temperature: 0.7,
                max_tokens: 2000,
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `Erreur ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;

    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
}
