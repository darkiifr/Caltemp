import React, { useState, useRef, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { generateText, searchWeb } from '../services/ai';
import { playBubbleSound } from '../utils/sound';
import { PromptInputBox } from './ui/ai-prompt-box';
import { motion, AnimatePresence } from 'framer-motion';
import CanvasView from './CanvasView';
import { Search, Loader2, Sparkles, MessageSquare, CornerDownLeft, Command, Eraser } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Brain, FileText as FileIcon } from 'lucide-react';
import { handleLocalDexterCommand } from '../domain/dexterLocal';

const ThoughtBlock = React.memo(({ content }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    if (!content) return null;

    return (
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg shadow-purple-500/5">
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-5 py-3 text-purple-200 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-white/10 rounded-lg">
                        <Brain className="w-4 h-4 text-white/70" />
                    </div>
                    <span className="text-[11px] font-bold tracking-widest uppercase text-white/50">Réflexion interne</span>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
            </button>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-5 pb-5 pt-1"
                    >
                        <div className="text-[14px] text-white/60 italic leading-relaxed whitespace-pre-wrap border-l border-white/10 pl-4 py-1">
                            {content}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});
ThoughtBlock.displayName = "ThoughtBlock";

const MessageItem = React.memo(({ msg }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group mb-6`}
        >
            <div className={`max-w-[85%] lg:max-w-[75%] px-5 py-4 rounded-2xl relative ${
                msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-br-sm' 
                : 'bg-white/5 border border-white/5 text-white rounded-bl-sm'
            }`}>
                <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0">
                    {msg.role === 'user' ? (
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {msg.content.includes('<thought>') && (
                                <ThoughtBlock 
                                    content={msg.content.match(/<thought>([\s\S]*?)<\/thought>/)?.[1] || msg.content.match(/<thought>([\s\S]*)/)?.[1]} 
                                />
                            )}
                            <div className="relative">
                                <ReactMarkdown 
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        p: ({children}) => <p className="mb-4 last:mb-0 leading-relaxed text-[15px]">{children}</p>,
                                        strong: ({children}) => <strong className="text-white font-bold">{children}</strong>,
                                        ul: ({children}) => <ul className="list-disc pl-5 mb-4 space-y-2">{children}</ul>,
                                        ol: ({children}) => <ol className="list-decimal pl-5 mb-4 space-y-2">{children}</ol>,
                                        li: ({children}) => <li className="text-[15px]">{children}</li>,
                                        code: ({inline, className, children, ...props}) => {
                                            const match = /language-(\w+)/.exec(className || '');
                                            return !inline ? (
                                                <div className="relative my-4 rounded-xl overflow-hidden border border-white/10 bg-black/30">
                                                    <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{match ? match[1] : 'code'}</span>
                                                    </div>
                                                    <code className="block p-4 overflow-x-auto text-[13px] font-mono leading-relaxed" {...props}>{children}</code>
                                                </div>
                                            ) : (
                                                <code className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 font-mono text-xs" {...props}>{children}</code>
                                            );
                                        }
                                    }}
                                >
                                    {msg.content.replace(/<thought>[\s\S]*?<\/thought>/g, '')}
                                </ReactMarkdown>
                                {msg.isStreaming && (
                                    <motion.span 
                                        animate={{ opacity: [0, 1, 0] }}
                                        transition={{ repeat: Infinity, duration: 1 }}
                                        className="inline-block w-2.5 h-4 bg-white/30 ml-1 translate-y-0.5 rounded-full"
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>
                {msg.files?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-white/5">
                        {msg.files.map(f => (
                            <div key={f} className="text-[10px] px-2.5 py-1 bg-black/40 rounded-lg border border-white/10 text-blue-300 flex items-center gap-1.5">
                                <CornerDownLeft className="w-2.5 h-2.5" />
                                <span className="truncate max-w-[120px]">{f}</span>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className={`absolute bottom-[-20px] ${msg.role === 'user' ? 'right-2' : 'left-2'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                    <span className="text-[10px] text-white/20 font-medium">Envoyé</span>
                </div>
            </div>
        </motion.div>
    );
});
MessageItem.displayName = "MessageItem";

export default function Dexter({ onClose, settings, events = [], onAddEvent }) {
    const [messages, setMessages] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [canvasContent, setCanvasContent] = useState(null);
    const messagesEndRef = useRef(null);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);



    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const handleAbort = React.useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsTyping(false);
            setIsSearching(false);
        }
    }, []);

    const handleSend = async (inputValue, files = []) => {
        if (!inputValue.trim() && files.length === 0) return;

        // Cancel any existing request
        if (abortControllerRef.current) handleAbort();
        abortControllerRef.current = new AbortController();

        const isSearch = inputValue.startsWith('[Search: ');
        const isThink = inputValue.startsWith('[Think: ');
        const isCanvas = inputValue.startsWith('[Canvas: ');

        const cleanValue = inputValue.replace(/^\[(Search|Think|Canvas): (.*)\]$/, '$2');

        const userMsg = { 
            id: Date.now(), 
            role: 'user', 
            content: cleanValue,
            files: files.map(f => f.name)
        };

        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);
        if (isSearch) setIsSearching(true);

        const localCommand = handleLocalDexterCommand(cleanValue, { events, now: new Date() });
        if (localCommand.handled) {
            if (localCommand.type === 'create-event' && localCommand.event) {
                await onAddEvent(localCommand.event);
            }
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                content: localCommand.message,
            }]);
            setIsTyping(false);
            setIsSearching(false);
            abortControllerRef.current = null;
            return;
        }



        if (settings?.aiApiKey) {
            try {
                let aiMessages = [];
                let userContent = [{ type: "text", text: userMsg.content || "Veuillez analyser ce document ou cet audio." }];
                if (files.length > 0) {
                    for (const file of files) {
                        const base64 = await fileToBase64(file);
                        if (file.type.startsWith('image/')) {
                            userContent.push({
                                type: "image_url",
                                image_url: { url: base64 }
                            });
                        } else if (file.type.startsWith('audio/')) {
                            const rawBase64 = base64.split(',')[1];
                            let format = file.type.split('/')[1].split(';')[0];
                            if (format.includes('webm')) format = 'wav'; // OpenRouter/Gemini usually expects wav, mp3, ogg. WebM might be unsupported by some APIs, but we will pass wav to let the API handle it, or pass the actual type. Let's pass the raw format just in case, openrouter can usually handle it.
                            if (format === 'webm') format = 'mp3'; // safe fallback
                            
                            userContent.push({
                                type: "input_audio",
                                input_audio: {
                                    data: rawBase64,
                                    format: format
                                }
                            });
                        }
                    }
                }

                const history = messages.slice(-10).map(m => ({
                    role: m.role === 'system' ? 'assistant' : m.role,
                    content: m.content
                }));

                const now = new Date();
                let systemInstruction = `Tu es Dexter, l'assistant intelligent de Caltemp. Nous sommes le ${now.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Ton objectif est d'aider l'utilisateur à gérer ses événements et ses notes de manière efficace et conviviale.`;
                
                if (isSearch) systemInstruction += "\n\nINFORMATIONS TROUVÉES SUR LE WEB :\nTu dois baser ta réponse sur ces informations contextuelles. NE GÉNÈRE AUCUN JSON NI REQUÊTE DE RECHERCHE, réponds directement à l'utilisateur en langage naturel.";
                if (isCanvas) systemInstruction += "\nL'utilisateur souhaite utiliser le Canvas pour une réponse détaillée.";

                const systemPrompt = {
                    role: "system",
                    content: `${systemInstruction}\n\nDIRECTIVES IMPORTANTES:\n1. Si l'utilisateur te demande de créer un événement ou un rappel, réponds TOUJOURS avec un bloc JSON entouré de balises de code: \`\`\`json\n{"action": "create_event", "data": {"title": "...", "date": "ISO8601 complète", "description": "...", "recurrence": "none|daily|weekly|monthly|yearly", "reminder": true}}\n\`\`\`\n2. Fais très attention aux dates. Si c'est un anniversaire, mets "recurrence": "yearly".\n3. Utilise le Markdown pour formater tes réponses (gras, listes, etc.) pour le reste de la discussion.`
                };

                // --- SEARCH PHASE ---
                let searchContext = "";
                if (isSearch) {
                    const searchQuery = await generateText({
                        apiKey: settings.aiApiKey,
                        model: settings.aiModel,
                        messages: [...history, { role: 'user', content: `Génère uniquement 1 ou 2 mots-clés de recherche très courts pour : "${userMsg.content}"` }],
                        signal: abortControllerRef.current?.signal
                    });
                    
                    const searchResults = await searchWeb(searchQuery);
                    if (searchResults) {
                        searchContext = searchResults.map(r => `[Source: ${r.title}] ${r.snippet}`).join('\n');
                    }
                }

                aiMessages = [systemPrompt, ...history, { role: 'user', content: userContent.length > 1 ? userContent : userMsg.content }];

                // --- FINAL RESPONSE (STREAMING) ---
                const assistantMsgId = Date.now() + 2;
                // Add the empty assistant message immediately
                setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true }]);
                
                const response = await generateText({
                    apiKey: settings.aiApiKey,
                    model: settings.aiModel,
                    messages: aiMessages,
                    context: searchContext,
                    think: isThink,
                    signal: abortControllerRef.current?.signal,
                    onChunk: (fullText, chunk, isFirstChunk) => {
                        if (isFirstChunk) {
                            setIsTyping(false);
                            setIsSearching(false);
                        }
                        
                        let displayContent = fullText;
                        
                        // Hide create_event JSON
                        if (displayContent.includes('```json') || displayContent.includes('"action": "create_event"')) {
                            displayContent = "⏳ Création de l'événement en cours...";
                        }
                        
                        // Hide leaked search tool JSON
                        displayContent = displayContent.replace(/Search web\.\{.*?\}/g, '');
                        displayContent = displayContent.replace(/^\{"query":.*?"source":.*?"\}\s*/g, '');
                        displayContent = displayContent.replace(/^\{"query":.*?\}\s*/g, '');

                        setMessages(prev => prev.map(msg => 
                            msg.id === assistantMsgId ? { ...msg, content: displayContent, isStreaming: true } : msg
                        ));
                    }
                });




                // Check for JSON in response (more robust parsing)
                const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```|(\{[\s\S]*"action":\s*"create_event"[\s\S]*?\})/;
                const jsonMatch = response.match(jsonRegex);

                if (jsonMatch) {
                    try {
                        const jsonStr = jsonMatch[1] || jsonMatch[2];
                        const jsonData = JSON.parse(jsonStr);
                        if (jsonData.action === 'create_event') {
                            const eventData = jsonData.data || jsonData;
                            
                            const finalEvent = {
                                ...eventData,
                                id: Date.now().toString()
                            };

                            onAddEvent(finalEvent);
                            
                            let dateStr = "Date non spécifiée";
                            try {
                                const d = new Date(finalEvent.date);
                                if (!isNaN(d.getTime())) {
                                    dateStr = d.toLocaleString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                                } else {
                                    dateStr = finalEvent.date;
                                }
                            } catch (e) {
                                dateStr = finalEvent.date;
                            }

                            setMessages(prev => prev.map(msg => 
                                msg.id === assistantMsgId ? { ...msg, content: `✅ **C'est noté !**\n\n**Titre :** ${finalEvent.title}\n**Date :** ${dateStr}`, isStreaming: false } : msg
                            ));
                            
                            if (isSearch) setIsSearching(false);
                            return; // Stop here, event is created
                        }
                    } catch (e) {
                        console.error("Failed to parse AI JSON command:", e);
                    }
                }

                // If not an event, display cleaned response
                let cleanResponse = response
                    .replace(/```json\s*(\{[\s\S]*?\})\s*```/g, '')
                    .replace(/Search web\.\{.*?\}/g, '')
                    .replace(/^\{"query":.*?"source":.*?"\}\s*/g, '')
                    .replace(/^\{"query":.*?\}\s*/g, '')
                    .trim();
                    
                if (!cleanResponse) {
                    cleanResponse = "Opération terminée.";
                }

                setMessages(prev => prev.map(msg => 
                    msg.id === assistantMsgId ? { ...msg, content: cleanResponse, isStreaming: false } : msg
                ));

                if (isSearch) setIsSearching(false);

                // Move to Canvas if response is long or contains complex content
                if (isCanvas || response.length > 1500 || (response.match(/```/g) || []).length >= 2) {
                    setCanvasContent(response);
                }

            } catch (error) {
                if (error.name === 'AbortError') return;
                setMessages(prev => [...prev, { 
                    id: Date.now(), 
                    role: 'assistant', 
                    type: 'error',
                    content: error.message 
                }]);
            } finally {
                setIsTyping(false);
                setIsSearching(false);
                abortControllerRef.current = null;
            }
        } else {
            setMessages(prev => [...prev, { 
                id: Date.now(), 
                role: 'assistant', 
                type: 'error',
                content: "Veuillez configurer votre clé OpenRouter dans les paramètres." 
            }]);
            setIsTyping(false);
        }
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-[#0a0a0a] relative">
            {/* Split Screen Logic */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-6 shrink-0 border-b border-white/5 bg-[#0a0a0a]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 text-white rounded-lg">
                             <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight text-white">Dexter</h1>
                        </div>
                        {isSearching && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 text-white/50 border border-white/5 rounded-md text-[10px] font-medium uppercase tracking-wider animate-pulse ml-2">
                                <Search className="w-3 h-3" />
                                <span>Recherche en cours...</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => { playBubbleSound(); setMessages([]); setCanvasContent(null); }}
                            className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all group"
                            title="Nouvelle conversation"
                        >
                            <Eraser className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-2" />
                        <button 
                            onClick={onClose}
                            className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar scroll-smooth">
                    <div className="max-w-3xl mx-auto space-y-10">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-50">
                                <div className="p-5 bg-white/5 rounded-full border border-white/5 shadow-2xl">
                                    <MessageSquare className="w-10 h-10 text-white/40" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-medium text-white">Comment puis-je vous aider ?</h2>
                                    <p className="text-sm text-white/40 mt-1 max-w-sm">Demandez-moi de créer un événement, de chercher quelque chose ou simplement de discuter.</p>
                                </div>
                            </div>
                        )}

                        <AnimatePresence mode="popLayout">
                            {messages.filter(m => m.role === 'user' || m.content.length > 0).map((msg) => (
                                <MessageItem key={msg.id} msg={msg} />
                            ))}
                        </AnimatePresence>

                        {isSearching && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }} 
                                animate={{ opacity: 1, y: 0 }}
                                className="flex justify-start mb-6"
                            >
                                <div className="bg-white/5 border border-white/5 rounded-xl px-5 py-3 flex items-center gap-3">
                                     <Loader2 className="w-4 h-4 text-white/50 animate-spin" />
                                    <span className="text-sm font-medium text-white/60">Dexter explore le web...</span>
                                </div>
                            </motion.div>
                        )}

                        {isTyping && !isSearching && !messages.some(m => m.isStreaming) && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }} 
                                animate={{ opacity: 1, y: 0 }}
                                className="flex justify-start mb-6"
                            >
                                <div className="bg-white/5 border border-white/5 rounded-xl px-5 py-3 flex items-center gap-3">
                                    <div className="flex gap-1 item-center">
                                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                                    </div>
                                    <span className="text-sm font-medium text-white/60">Dexter rédige...</span>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} className="h-10" />
                    </div>
                </div>

                {/* Input Area */}
                <div className="p-6 pt-0 shrink-0 relative z-20">
                    <div className="max-w-3xl mx-auto relative">
                        <div className="relative">
                            <PromptInputBox 
                                onSend={handleSend} 
                                isLoading={isTyping} 
                                onAbort={handleAbort}
                                placeholder="Posez vos questions à Dexter..." 
                            />
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-4 opacity-30">
                            <div className="flex items-center gap-1.5 text-[10px] text-white font-medium uppercase tracking-widest">
                                <Command className="w-3 h-3" />
                                <span>Entrée pour envoyer</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Canvas Panel */}
            <AnimatePresence>
                {canvasContent && (
                    <CanvasView 
                        content={canvasContent} 
                        onClose={() => setCanvasContent(null)} 
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
