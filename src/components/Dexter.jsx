import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, X, Trash2, Copy } from 'lucide-react';
import { generateText } from '../services/ai';

export default function Dexter({ isOpen, onClose, settings, onAddEvent }) {
    const [messages, setMessages] = useState([
        { id: 1, role: 'system', content: "Bonjour ! Je suis Dexter. Dites-moi simplement 'Rappel acheter du pain à 14h' pour créer un événement." }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    const parseCommand = (text) => {
        // Regex simple pour détecter un rappel : "Rappel [titre] à [heure]"
        // Ex: "Rappel RDV dentiste à 14h30"
        // Ex: "Rappel Sortir les poubelles à 19h"
        const regex = /(?:rappel|événement|event|rdv)\s+(?:pour|le)?\s*(.+?)\s+(?:à|@)\s*(\d{1,2})(?:h|:)(\d{2})?/i;
        const match = text.match(regex);

        if (match) {
            const title = match[1].trim();
            const hour = parseInt(match[2]);
            const minute = match[3] ? parseInt(match[3]) : 0;

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

                const systemPrompt = {
                    role: "system",
                    content: "Tu es Dexter, un assistant calendrier. Si l'utilisateur veut créer un événement mais que tu ne peux pas le faire directement, guide-le vers la syntaxe 'Rappel [titre] à [heure]'."
                };

                const response = await generateText({
                    apiKey: settings.aiApiKey,
                    model: settings.aiModel,
                    messages: [systemPrompt, ...history]
                });

                setMessages(prev => [...prev, { 
                    id: Date.now() + 1, 
                    role: 'assistant', 
                    content: response 
                }]);
            } catch (error) {
                setMessages(prev => [...prev, { 
                    id: Date.now() + 1, 
                    role: 'assistant', 
                    content: `❌ Erreur IA : ${error.message}` 
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
            handleSend();
        }
    };

    const clearHistory = () => {
        setMessages([{ id: 1, role: 'system', content: "Historique effacé." }]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-[#1e1e1e] shadow-2xl border-l border-white/10 z-40 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#252525]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Dexter</h3>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={clearHistory} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#1e1e1e]">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-white/10' : 'bg-blue-600/20'}`}>
                            {msg.role === 'user' ? <User className="w-4 h-4 text-gray-300" /> : <Bot className="w-4 h-4 text-blue-400" />}
                        </div>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-[#2a2a2a] text-gray-200 rounded-tl-none border border-white/5'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="bg-[#2a2a2a] rounded-2xl rounded-tl-none px-4 py-3 border border-white/5 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75"></span>
                            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#252525] border-t border-white/5">
                <div className="relative">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ex: Rappel Dentiste à 14h..."
                        className="w-full bg-black/20 text-white text-sm pl-4 pr-12 py-3 rounded-xl border border-white/10 outline-none focus:border-blue-500/50 focus:bg-black/30 transition-all resize-none custom-scrollbar"
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg transition-colors shadow-lg"
                    >
                        {isTyping ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
