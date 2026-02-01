import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, X, Trash2 } from 'lucide-react';
import { generateText } from '../services/ai';
import { playBubbleSound } from '../utils/sound';

export default function Dexter({ isOpen, onClose, settings, onAddEvent }) {
    const [messages, setMessages] = useState([
        { id: 1, role: 'system', content: "Bonjour ! Je suis Dexter. Dites-moi simplement 'Rappel acheter du pain à 14h' pour créer un événement." }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Dragging state
    const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragOffset.current.x,
                    y: e.clientY - dragOffset.current.y
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    const parseCommand = (text) => {
        // Regex améliorée pour détecter un rappel
        const regex = /(?:rappel|événement|event|rdv)\s+(?:pour|le)?\s*(.*?)(?:\s+(?:à|@)\s*|\s+)(\d{1,2})(?:h|:)?(\d{2})?(?:\s+(.*))?/i;
        const match = text.match(regex);

        if (match) {
            const titlePart1 = match[1] ? match[1].trim() : '';
            const hour = parseInt(match[2]);
            const minute = match[3] ? parseInt(match[3]) : 0;
            const titlePart2 = match[4] ? match[4].trim() : '';

            // Combine parts for title, prioritizing the text content
            let title = titlePart1;
            if (titlePart2) {
                title = title ? `${title} ${titlePart2}` : titlePart2;
            }

            // If title is empty (e.g. "Rappel 14h"), use a default
            if (!title) title = "Rappel";

            // Validation basique de l'heure
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

            const date = new Date();
            date.setHours(hour, minute, 0, 0);

            // Si l'heure est passée, c'est pour demain
            if (date < new Date()) {
                date.setDate(date.getDate() + 1);
            }

            return {
                type: 'create_event',
                data: {
                    title,
                    date: date.toISOString(),
                    description: `Créé par Dexter depuis: "${text}"`,
                    reminder: true
                }
            };
        }
        return null;
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = { id: Date.now(), role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        // 1. Check for local commands
        const command = parseCommand(userMsg.content);

        if (command && command.type === 'create_event') {
            setTimeout(() => {
                onAddEvent(command.data);
                const dateStr = new Date(command.data.date).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: `✅ C'est noté ! J'ai ajouté "${command.data.title}" pour ${dateStr}.`
                }]);
                setIsTyping(false);
            }, 600);
            return;
        }

        // 2. Fallback to AI if API key exists
        if (settings?.aiApiKey) {
            try {
                const history = messages.slice(-10).map(m => ({
                    role: m.role === 'system' ? 'assistant' : m.role,
                    content: m.content
                }));
                history.push({ role: 'user', content: userMsg.content });

                const now = new Date();
                const systemPrompt = {
                    role: "system",
                    content: `Tu es Dexter, un assistant calendrier intelligent et efficace. Nous sommes le ${now.toLocaleString('fr-FR')}.
                    
                    Tes capacités :
                    1. Créer des événements et rappels.
                    2. Répondre aux questions générales.

                    IMPORTANT : Si l'utilisateur demande de créer un événement, un rappel ou un rendez-vous, tu DOIS répondre UNIQUEMENT avec un bloc JSON strict au format suivant (sans texte avant ni après) :
                    \`\`\`json
                    {
                        "action": "create_event",
                        "data": {
                            "title": "Titre de l'événement",
                            "date": "Date ISO 8601 complète (ex: 2023-12-25T14:00:00.000Z)",
                            "description": "Description contextuelle",
                            "reminder": true
                        }
                    }
                    \`\`\`
                    
                    Pour tout autre message, réponds normalement en texte de manière concise et amicale.`
                };

                const response = await generateText({
                    apiKey: settings.aiApiKey,
                    model: settings.aiModel,
                    messages: [systemPrompt, ...history]
                });

                // Check for JSON action
                const jsonMatch = response.match(/```json\s*({[\s\S]*?})\s*```/) || response.match(/{[\s\S]*?}/);

                if (jsonMatch) {
                    try {
                        const action = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                        if (action.action === 'create_event' && action.data) {
                            onAddEvent(action.data);
                            const dateStr = new Date(action.data.date).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
                            setMessages(prev => [...prev, {
                                id: Date.now() + 1,
                                role: 'assistant',
                                content: `✅ C'est fait ! J'ai ajouté "${action.data.title}" pour ${dateStr}.`
                            }]);
                            setIsTyping(false);
                            return;
                        }
                    } catch (e) {
                        console.error("Failed to parse AI JSON:", e);
                    }
                }

                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: response
                }]);
            } catch (error) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: `❌ Erreur IA : ${error.message || String(error)}`
                }]);
            }
        } else {
            // No API key and no local command matched
            setTimeout(() => {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: "Je ne peux pas répondre à cela. Configurez une clé API OpenRouter dans les paramètres pour activer l'intelligence artificielle, ou utilisez la commande 'Rappel [titre] à [heure]'."
                }]);
            }, 600);
        }

        setIsTyping(false);
    };


    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            playBubbleSound();
            handleSend();
        }
    };

    const clearHistory = () => {
        setMessages([{ id: 1, role: 'system', content: "Historique effacé." }]);
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                left: position.x,
                top: position.y,
                height: '600px'
            }}
            className="fixed w-full sm:w-[380px] bg-black/40 backdrop-blur-xl shadow-2xl border border-white/10 rounded-3xl z-40 flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden ring-1 ring-white/10"
        >
            {/* Header with Gradient */}
            <div
                className="h-14 border-b border-white/5 flex items-center justify-between px-5 bg-gradient-to-r from-blue-600/20 to-purple-600/20 cursor-move select-none"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-linear-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white leading-tight">Dexter</span>
                        <span className="text-[10px] text-blue-200/70 font-medium">Assistant AI</span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={clearHistory} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors" title="Effacer l'historique">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Fermer">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        {msg.role !== 'user' && (
                            <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500/20 to-purple-500/20 border border-white/5 flex items-center justify-center shrink-0 mt-1">
                                <Bot className="w-3 h-3 text-blue-400" />
                            </div>
                        )}

                        <div className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed shadow-lg backdrop-blur-sm ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-blue-500/10'
                                : 'bg-[#2a2a2a]/60 text-gray-100 rounded-2xl rounded-tl-sm border border-white/5'
                            }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex gap-3 animate-in fade-in duration-300">
                        <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-500/20 to-purple-500/20 border border-white/5 flex items-center justify-center shrink-0 mt-1">
                            <Bot className="w-3 h-3 text-blue-400" />
                        </div>
                        <div className="bg-[#2a2a2a]/60 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 border border-white/5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-75"></span>
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/5 border-t border-white/5 backdrop-blur-md">
                <div className="relative group">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ex: Rappel Dentiste à 14h..."
                        className="w-full bg-black/40 text-white text-sm pl-4 pr-12 py-3.5 rounded-2xl border border-white/10 outline-none focus:border-blue-500/50 focus:bg-black/60 transition-all resize-none custom-scrollbar placeholder:text-white/20 font-medium shadow-inner"
                        rows={1}
                    />
                    <button
                        onClick={() => { playBubbleSound(); handleSend(); }}
                        disabled={!input.trim() || isTyping}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95"
                    >
                        {isTyping ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
