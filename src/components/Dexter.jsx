import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { generateText, isAiConfigured, searchWeb } from '../services/ai';
import { playBubbleSound } from '../utils/sound';
import { PromptInputBox } from './ui/ai-prompt-box';
import { motion, AnimatePresence } from 'framer-motion';
import CanvasView from './CanvasView';
import { Search, Loader2, MessageSquare, CornerDownLeft, Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { handleLocalDexterCommand } from '../domain/dexterLocal';
import { parseDexterAction, removeDexterActionJson, sanitizeDexterReply } from '../domain/dexterActions';
import { getNextOccurrence } from '../domain/events';
import { normalizeUnclearDexterReply, shouldUseLocalDexterCommand } from '../domain/dexterRouting';

const DEXTER_HISTORY_STORAGE_KEY = 'caltemp.dexter.conversations.v1';

function safeReadStorage(key, fallback = null) {
    if (typeof window === 'undefined') return fallback;
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function safeWriteStorage(key, value) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore storage quota/privacy errors. Dexter stays usable in memory.
    }
}

function conversationTitle(messages = []) {
    const firstUser = messages.find(message => message.role === 'user' && message.content?.trim());
    return firstUser?.content?.trim().slice(0, 52) || 'Nouvelle discussion';
}

function createConversation(messages = []) {
    const now = Date.now();
    return {
        id: `dexter-${now}-${Math.random().toString(36).slice(2, 8)}`,
        title: conversationTitle(messages),
        messages,
        createdAt: now,
        updatedAt: now,
    };
}

function loadDexterHistoryState() {
    const empty = createConversation([]);
    const raw = safeReadStorage(DEXTER_HISTORY_STORAGE_KEY);
    if (!raw) return { conversations: [empty], activeId: empty.id };
    try {
        const parsed = JSON.parse(raw);
        const conversations = Array.isArray(parsed?.conversations)
            ? parsed.conversations
                .filter(item => item?.id)
                .map(item => ({
                    ...item,
                    title: item.title || conversationTitle(item.messages || []),
                    messages: Array.isArray(item.messages) ? item.messages : [],
                    updatedAt: item.updatedAt || item.createdAt || Date.now(),
                }))
            : [];
        if (!conversations.length) return { conversations: [empty], activeId: empty.id };
        const activeId = conversations.some(item => item.id === parsed?.activeId) ? parsed.activeId : conversations[0].id;
        return { conversations, activeId };
    } catch {
        return { conversations: [empty], activeId: empty.id };
    }
}

function saveDexterHistoryState(conversations, activeId) {
    safeWriteStorage(DEXTER_HISTORY_STORAGE_KEY, JSON.stringify({
        conversations: conversations.slice(0, 30),
        activeId,
    }));
}

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
    const isUser = msg.role === 'user';

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'} group mb-5`}
        >
            <div className={`flex max-w-[92%] ${isUser ? 'flex-row-reverse lg:max-w-[72%]' : 'w-full lg:max-w-[82%]'}`}>
                <div className={`relative min-w-0 px-4 py-3 text-[15px] leading-7 ${
                    isUser
                        ? 'rounded-[22px] bg-[#2f2f2f] text-white shadow-[0_8px_28px_rgba(0,0,0,0.22)]'
                        : 'text-white'
                }`}>
                <div className="prose prose-invert max-w-none prose-p:leading-7 prose-pre:p-0 prose-p:mb-3 prose-p:last:mb-0">
                    {isUser ? (
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <p className="whitespace-pre-wrap">{msg.content}</p>
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
                                        p: ({children}) => <p className="mb-3 last:mb-0 leading-7 text-[15px] text-white/92">{children}</p>,
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
                </div>
            </div>
        </motion.div>
    );
});
MessageItem.displayName = "MessageItem";

function getDexterEventDate(event) {
    const value = event?.date || event?.start || event?.startDate;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function buildDexterCalendarContext(events = [], settings = {}) {
    const now = new Date();
    const categoryLegend = settings?.categoryLegend || {};
    const upcoming = events
        .map(event => ({ event, date: getNextOccurrence(event, now) || getDexterEventDate(event) }))
        .filter(item => item.date && item.date >= now)
        .sort((a, b) => a.date - b.date)
        .slice(0, 40);

    if (!upcoming.length) {
        return 'Rappels à venir dans Caltemp : aucun événement futur enregistré.';
    }

    const lines = upcoming.map(({ event, date }) => {
        const category = event.category || 'sans-categorie';
        const categoryLabel = categoryLegend[category]?.label || category;
        const tags = Array.isArray(event.tags) && event.tags.length ? `, tags=${event.tags.join('|')}` : '';
        return `- id=${event.id} | ${date.toISOString()} | ${event.title || 'Sans titre'} | catégorie=${categoryLabel} | alerte=${event.reminder ? 'oui' : 'non'}${tags}`;
    });

    return `Rappels à venir dans Caltemp (${upcoming.length}/${events.length} affichés, triés par date) :\n${lines.join('\n')}`;
}

function getDexterContextTerms(input = '') {
    return input
        .toLocaleLowerCase('fr-FR')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
        .split(/\s+/)
        .map(term => term.trim())
        .filter(term => term.length >= 3);
}

function filterDexterContextEvents(events = [], input = '') {
    const terms = getDexterContextTerms(input);
    if (!terms.length) return events;
    const normalizedEvents = events.map(event => ({
        event,
        text: [
            event?.title,
            event?.description,
            event?.category,
            ...(Array.isArray(event?.tags) ? event.tags : []),
        ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('fr-FR')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, ''),
    }));
    const matching = normalizedEvents
        .filter(item => terms.some(term => item.text.includes(term)))
        .map(item => item.event);
    return matching.length ? matching : events;
}

export default function Dexter({ onClose, settings, events = [], onAddEvent, onOpenSettingsTab, onExportPng, onExportPdf }) {
    const initialHistoryRef = useRef(null);
    if (!initialHistoryRef.current) initialHistoryRef.current = loadDexterHistoryState();
    const [conversationHistory, setConversationHistory] = useState(initialHistoryRef.current.conversations);
    const [activeConversationId, setActiveConversationId] = useState(initialHistoryRef.current.activeId);
    const [messages, setMessages] = useState(() => (
        initialHistoryRef.current.conversations.find(item => item.id === initialHistoryRef.current.activeId)?.messages || []
    ));
    const [isTyping, setIsTyping] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [canvasContent, setCanvasContent] = useState(null);
    const messagesEndRef = useRef(null);
    const abortControllerRef = useRef(null);
    const referencedEventIdRef = useRef(null);
    const eventsRef = useRef(events);
    const quickPrompts = [
        'Résume ma semaine',
        'Montre les catégories',
        'Explique mes alertes',
        'Ouvre les paramètres IA',
    ];

    useEffect(() => {
        try {
            window.localStorage.removeItem('caltemp.dexter.selectedModel.v1');
        } catch {
            // Ignore storage quota/privacy errors. Dexter no longer stores a model preference.
        }
    }, []);

    useEffect(() => {
        setConversationHistory(prev => {
            const exists = prev.some(item => item.id === activeConversationId);
            const base = exists ? prev : [createConversation([]), ...prev];
            const updated = base.map(item => {
                if (item.id !== activeConversationId) return item;
                return {
                    ...item,
                    title: conversationTitle(messages),
                    messages,
                    updatedAt: Date.now(),
                };
            }).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
            saveDexterHistoryState(updated, activeConversationId);
            return updated;
        });
    }, [activeConversationId, messages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isTyping]);

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);



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

    const startNewConversation = React.useCallback(() => {
        handleAbort();
        const conversation = createConversation([]);
        referencedEventIdRef.current = null;
        setCanvasContent(null);
        setConversationHistory(prev => {
            const next = [conversation, ...prev].slice(0, 30);
            saveDexterHistoryState(next, conversation.id);
            return next;
        });
        setActiveConversationId(conversation.id);
        setMessages([]);
    }, [handleAbort]);

    const selectConversation = React.useCallback((conversationId) => {
        const conversation = conversationHistory.find(item => item.id === conversationId);
        if (!conversation) return;
        handleAbort();
        referencedEventIdRef.current = null;
        setCanvasContent(null);
        setActiveConversationId(conversation.id);
        setMessages(conversation.messages || []);
        saveDexterHistoryState(conversationHistory, conversation.id);
    }, [conversationHistory, handleAbort]);

    const deleteConversation = React.useCallback((conversationId) => {
        setConversationHistory(prev => {
            const remaining = prev.filter(item => item.id !== conversationId);
            const next = remaining.length ? remaining : [createConversation([])];
            const nextActiveId = activeConversationId === conversationId ? next[0].id : activeConversationId;
            saveDexterHistoryState(next, nextActiveId);
            if (activeConversationId === conversationId) {
                setActiveConversationId(nextActiveId);
                setMessages(next[0].messages || []);
                referencedEventIdRef.current = null;
            }
            return next;
        });
    }, [activeConversationId]);

    const handleSend = async (inputValue, files = [], options = {}) => {
        if (!inputValue.trim() && files.length === 0) return;

        // Cancel any existing request
        if (abortControllerRef.current) handleAbort();
        abortControllerRef.current = new AbortController();

        let isSearch = inputValue.startsWith('[Search: ');
        const isThink = inputValue.startsWith('[Think: ');
        const isCanvas = inputValue.startsWith('[Canvas: ');

        const cleanValue = inputValue.replace(/^\[(Search|Think|Canvas): (.*)\]$/, '$2');

        // Detect if web search should be automatically triggered based on intent
        if (!isSearch) {
            const normalized = cleanValue.trim().toLocaleLowerCase('fr-FR');
            if (
                /\b(cherche|recherche|trouve)\b.*\b(internet|web|net|ligne|google)\b/i.test(normalized) ||
                /\b(météo|actualité|actualités|news|infos|recette|définition|traduis)\b/i.test(normalized) ||
                /^(qui est|c'est quoi|qu'est-ce que|qu'est ce que|comment faire|pourquoi)\b/i.test(normalized)
            ) {
                isSearch = true;
            }
        }

        const userMsg = { 
            id: Date.now(), 
            role: 'user', 
            content: cleanValue,
            files: files.map(f => f.name)
        };

        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);
        if (isSearch) setIsSearching(true);

        const aiAvailable = settings?.aiEnabled !== false && isAiConfigured();
        const useLocalCommand = shouldUseLocalDexterCommand({
            source: options.source || 'typed',
            text: cleanValue,
            aiEnabled: settings?.aiEnabled !== false,
            aiConfigured: aiAvailable,
        });

        const localCommand = useLocalCommand
            ? handleLocalDexterCommand(cleanValue, {
                events: eventsRef.current,
                settings,
                now: new Date(),
                referencedEventId: referencedEventIdRef.current,
            })
            : { handled: false };

        if (localCommand.handled) {
            if (localCommand.type === 'create-event' && localCommand.event) {
                const updatedEvents = await onAddEvent(localCommand.event);
                if (Array.isArray(updatedEvents)) eventsRef.current = updatedEvents;
            }
            if (localCommand.type === 'update-event' && localCommand.event) {
                const updatedEvents = await onAddEvent(localCommand.event);
                if (Array.isArray(updatedEvents)) eventsRef.current = updatedEvents;
            }
            const referencedEvent = localCommand.event || (Array.isArray(localCommand.data) ? localCommand.data[0] : localCommand.data);
            if (referencedEvent?.id) {
                referencedEventIdRef.current = referencedEvent.id;
            }
            if (localCommand.type === 'open-settings') {
                onOpenSettingsTab?.(localCommand.tab || 'general');
            }
            if (localCommand.type === 'export-png') {
                await onExportPng?.();
            }
            if (localCommand.type === 'export-pdf') {
                await onExportPdf?.();
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

        if (settings?.aiEnabled === false) {
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                type: 'error',
                content: "Dexter est désactivé dans les paramètres. Demande-moi d’ouvrir les paramètres IA pour le réactiver.",
            }]);
            setIsTyping(false);
            setIsSearching(false);
            abortControllerRef.current = null;
            return;
        }


        if (isAiConfigured()) {
            try {
                let aiMessages = [];
                let userContent = [{ type: "text", text: userMsg.content || "Veuillez analyser ce document." }];
                if (files.length > 0) {
                    for (const file of files) {
                        const base64 = await fileToBase64(file);
                        if (file.type.startsWith('image/')) {
                            userContent.push({
                                type: "image_url",
                                image_url: { url: base64 }
                            });
                        }
                    }
                }

                const history = messages.slice(-10).map(m => ({
                    role: m.role === 'system' ? 'assistant' : m.role,
                    content: m.content
                }));

                const now = new Date();
                const legendLines = Object.entries(settings?.categoryLegend || {})
                    .map(([key, meta]) => `${key}=${meta?.label || key}`)
                    .join(', ');
                const relevantEvents = filterDexterContextEvents(eventsRef.current, userMsg.content).slice(0, 12);
                const calendarContext = buildDexterCalendarContext(relevantEvents, settings);
                let systemInstruction = `Tu es Dexter, l'assistant intelligent de Caltemp. Nous sommes le ${now.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Tu aides à gérer un calendrier local, des notes, des catégories, des rappels et des imports ICS. Catégories disponibles : ${legendLines || 'cours, devoir, examen, perso, dev'}.\n\n${calendarContext}`;
                
                if (isSearch) systemInstruction += "\n\nINFORMATIONS TROUVÉES SUR LE WEB :\nTu dois baser ta réponse sur ces informations contextuelles. NE GÉNÈRE AUCUN JSON NI REQUÊTE DE RECHERCHE, réponds directement à l'utilisateur en langage naturel.";
                if (isCanvas) systemInstruction += "\nL'utilisateur souhaite utiliser le Canvas pour une réponse détaillée.";

                const systemPrompt = {
                    role: "system",
                    content: `${systemInstruction}\n\nDIRECTIVES IMPORTANTES:\n1. Si l'utilisateur demande une information déjà présente dans les rappels à venir ci-dessus, réponds avec ces données locales et ne dis jamais que tu n'as pas accès au calendrier.\n2. Pour créer un rappel, tu DOIS ABSOLUMENT inclure un bloc \`\`\`json avec cette structure exacte : {"action": "create_event", "data": {"title": "Titre", "date": "2026-06-06T12:00:00Z", "category": "perso", "reminder": true}}.\n3. Pour modifier un rappel, tu DOIS inclure les champs demandés, par exemple : {"action": "update_event", "data": {"id": "ID_ici", "title": "Nouveau", "date": "2026-06-06T12:00:00Z", "category": "sport"}}. Utilise uniquement les clés de catégories disponibles.\n4. Si la demande de l'utilisateur nécessite de chercher des informations actualisées ou générales sur internet (météo, actualités, connaissances), tu PEUX et DOIS inclure : {"action": "search_web", "data": {"query": "mots clés de recherche courts"}}. Tu recevras ensuite les résultats dans un nouveau message pour formuler ta réponse finale.\n5. N'explique jamais les champs techniques à l'utilisateur, et ne montre pas de clés internes ou JSON dans le texte visible.\n6. Après une création ou modification, le texte visible doit être un résumé naturel avec titre, date, catégorie et statut d'alerte.\n7. N'invente pas d'action dangereuse.`
                };

                // --- SEARCH PHASE ---
                let searchContext = "";
                if (isSearch) {
                    const searchQuery = await generateText({
                        messages: [...history, { role: 'user', content: `Génère uniquement 1 ou 2 mots-clés de recherche très courts pour : "${userMsg.content}"` }],
                        maxTokens: 80,
                        signal: abortControllerRef.current?.signal
                    });
                    
                    const searchResults = await searchWeb(searchQuery);
                    if (searchResults) {
                        searchContext = searchResults.map(r => `[Source: ${r.title}] ${r.snippet}`).join('\n');
                    }
                }

                aiMessages = [systemPrompt, ...history, { role: 'user', content: userContent.length > 1 ? userContent : userMsg.content }];

                let currentIteration = 0;
                const MAX_ITERATIONS = 3;
                let finalResponse = "";
                let actionResult = null;
                let hadActionJson = false;
                let assistantMsgId = Date.now() + 2;

                // Loop for handling multi-step AI actions like search_web
                while (currentIteration < MAX_ITERATIONS) {
                    currentIteration++;
                    let iterationResponse = "";
                    
                    // --- FINAL RESPONSE (STREAMING) ---
                    assistantMsgId = Date.now() + 2 + currentIteration;
                    // Add the empty assistant message immediately
                    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true }]);
                    
                    await generateText({
                        messages: aiMessages,
                        context: searchContext,
                        think: isThink,
                        maxTokens: isCanvas || isThink ? 2200 : 1200,
                        signal: abortControllerRef.current?.signal,
                        onChunk: (fullText, chunk, isFirstChunk) => {
                            if (isFirstChunk) {
                                setIsTyping(false);
                                setIsSearching(false);
                            }
                            iterationResponse = fullText;
                            
                            let displayContent = fullText;
                            
                            // Hide create_event JSON
                            if (displayContent.includes('```json') || displayContent.includes('"action": "create_event"')) {
                                displayContent = "⏳ Création de l'événement en cours...";
                            }
                            
                            if (displayContent.includes('"action": "search_web"')) {
                                displayContent = "⏳ Recherche sur le web en cours...";
                            }
                            
                            // Hide leaked search tool JSON
                            displayContent = displayContent.replace(/Search web\.\{.*?\}/g, '');
                            displayContent = displayContent.replace(/^\{"query":.*?"source":.*?"\}\s*/g, '');
                            displayContent = displayContent.replace(/^\{"query":.*?\}\s*/g, '');
                            displayContent = sanitizeDexterReply(displayContent, settings) || displayContent;

                            setMessages(prev => prev.map(msg => 
                                msg.id === assistantMsgId ? { ...msg, content: displayContent, isStreaming: true } : msg
                            ));
                        }
                    });

                    actionResult = parseDexterAction(iterationResponse);
                    hadActionJson = iterationResponse.includes('"action"') || iterationResponse.includes('```json');
                    finalResponse = iterationResponse;

                    // AI decided to search the web during the stream
                    if (actionResult.ok && actionResult.action === 'search_web') {
                        setIsSearching(true);
                        setMessages(prev => prev.map(msg => 
                            msg.id === assistantMsgId ? { ...msg, content: "🔍 Recherche sur le web en cours...", isStreaming: false } : msg
                        ));

                        const query = actionResult.data.query;
                        const searchResults = await searchWeb(query);
                        const resultsText = searchResults ? searchResults.map(r => `[Source: ${r.title}] ${r.snippet}`).join('\n') : "Aucun résultat trouvé.";
                        
                        // Append AI's intent and the search results to messages
                        aiMessages.push({ role: 'assistant', content: iterationResponse });
                        aiMessages.push({ role: 'user', content: `Résultats de la recherche pour "${query}":\n${resultsText}\n\nFormule ta réponse finale à partir de ces informations.` });
                        searchContext = ""; // Clear context to avoid duplication
                        
                        continue;
                    }

                    // No further actions required by AI loop, break
                    break;
                }

                if (actionResult.ok && actionResult.action === 'create_event') {
                    const finalEvent = {
                        ...actionResult.data,
                        id: Date.now().toString(),
                    };

                    const updatedEvents = await onAddEvent(finalEvent);
                    if (Array.isArray(updatedEvents)) eventsRef.current = updatedEvents;

                    let dateStr = "Date non spécifiée";
                    try {
                        const d = new Date(finalEvent.date);
                        if (!isNaN(d.getTime())) {
                            dateStr = d.toLocaleString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        } else {
                            dateStr = finalEvent.date;
                        }
                    } catch {
                        dateStr = finalEvent.date;
                    }

                    const categoryLabel = settings?.categoryLegend?.[finalEvent.category]?.label || finalEvent.category || 'Sans catégorie';
                    setMessages(prev => prev.map(msg =>
                        msg.id === assistantMsgId ? { ...msg, content: `✅ **C'est noté !**\n\n**Titre :** ${finalEvent.title}\n**Date :** ${dateStr}\n**Catégorie :** ${categoryLabel}\n**Alerte :** ${finalEvent.reminder ? 'activée' : 'désactivée'}`, isStreaming: false } : msg
                    ));

                    if (isSearch) setIsSearching(false);
                    return;
                } else if (actionResult.ok && actionResult.action === 'update_event') {
                    const existingEvent = eventsRef.current.find(event => event.id === actionResult.data.id);
                    if (!existingEvent) {
                        setMessages(prev => prev.map(msg =>
                            msg.id === assistantMsgId ? { ...msg, content: "Je n’ai pas trouvé ce rappel dans Caltemp. Réessaie avec un mot du titre du rappel.", isStreaming: false } : msg
                        ));
                        if (isSearch) setIsSearching(false);
                        return;
                    }

                    const finalEvent = {
                        ...existingEvent,
                        ...actionResult.data,
                        id: existingEvent.id,
                    };

                    const updatedEvents = await onAddEvent(finalEvent);
                    if (Array.isArray(updatedEvents)) eventsRef.current = updatedEvents;

                    let dateStr = "Date inchangée";
                    try {
                        const d = new Date(finalEvent.date);
                        if (!isNaN(d.getTime())) {
                            dateStr = d.toLocaleString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        }
                    } catch {
                        dateStr = finalEvent.date || dateStr;
                    }

                    const categoryLabel = settings?.categoryLegend?.[finalEvent.category]?.label || finalEvent.category || 'Sans catégorie';
                    setMessages(prev => prev.map(msg =>
                        msg.id === assistantMsgId ? { ...msg, content: `✅ **Rappel modifié.**\n\n**Titre :** ${finalEvent.title}\n**Date :** ${dateStr}\n**Catégorie :** ${categoryLabel}\n**Alerte :** ${finalEvent.reminder ? 'activée' : 'désactivée'}`, isStreaming: false } : msg
                    ));

                    if (isSearch) setIsSearching(false);
                    return;
                } else if (hadActionJson) {
                    console.warn("Dexter action ignored:", actionResult.error);
                }

                // If not an event, display cleaned response
                let cleanResponse = removeDexterActionJson(finalResponse)
                    .replace(/Search web\.\{.*?\}/g, '')
                    .replace(/^\{"query":.*?"source":.*?"\}\s*/g, '')
                    .replace(/^\{"query":.*?\}\s*/g, '')
                    .trim();
                cleanResponse = sanitizeDexterReply(cleanResponse, settings);
                cleanResponse = normalizeUnclearDexterReply({
                    userText: cleanValue,
                    assistantText: cleanResponse,
                });
                    
                if (!cleanResponse && hadActionJson && !actionResult.ok) {
                    cleanResponse = `Je n’ai pas pu exécuter l’action demandée : ${actionResult.error}`;
                } else if (!cleanResponse) {
                    cleanResponse = "Opération terminée.";
                }

                // Make sure we update the correct assistantMsgId
                setMessages(prev => {
                    // Update the last message or create a new one if somehow lost
                    const msgExists = prev.some(m => m.id === assistantMsgId);
                    if (msgExists) {
                        return prev.map(msg => 
                            msg.id === assistantMsgId ? { ...msg, content: cleanResponse, isStreaming: false } : msg
                        );
                    }
                    return [...prev, { id: assistantMsgId, role: 'assistant', content: cleanResponse, isStreaming: false }];
                });

                if (isSearch) setIsSearching(false);

                // Move to Canvas if response is long or contains complex content
                if (isCanvas || finalResponse.length > 1500 || (finalResponse.match(/```/g) || []).length >= 2) {
                    setCanvasContent(finalResponse);
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
                    content: "Dexter peut déjà répondre aux commandes locales, mais l’intégration IA n’est pas configurée dans ce build."
            }]);
            setIsTyping(false);
        }
    };

    return (
        <div className="flex h-full w-full overflow-hidden bg-[#0a0a0a] relative">
            <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[#111111] p-3 lg:flex lg:flex-col">
                <button
                    type="button"
                    onClick={startNewConversation}
                    className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
                >
                    <Plus className="h-4 w-4" />
                    Nouvelle discussion
                </button>
                <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">Historique</div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                    {conversationHistory.map((conversation) => {
                        const selected = conversation.id === activeConversationId;
                        return (
                            <div key={conversation.id} className={`group flex items-center gap-1 rounded-xl ${selected ? 'bg-white/10' : 'hover:bg-white/[0.06]'}`}>
                                <button
                                    type="button"
                                    onClick={() => selectConversation(conversation.id)}
                                    className="min-w-0 flex-1 px-3 py-2.5 text-left"
                                    title={conversation.title}
                                >
                                    <div className={`truncate text-sm ${selected ? 'text-white' : 'text-white/72'}`}>{conversation.title}</div>
                                    <div className="mt-0.5 text-[11px] text-white/28">
                                        {conversation.messages?.length || 0} message{(conversation.messages?.length || 0) > 1 ? 's' : ''}
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteConversation(conversation.id)}
                                    className="mr-1 rounded-lg p-1.5 text-white/0 transition-colors hover:bg-red-400/10 hover:text-red-200 group-hover:text-white/35"
                                    title="Supprimer la discussion"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </aside>
            {/* Split Screen Logic */}
            <div className="flex-1 flex flex-col min-w-0 relative z-10">
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-6 shrink-0 border-b border-white/5 bg-[#0a0a0a]">
                    <div className="flex items-center gap-3">
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
                            onClick={() => { playBubbleSound(); startNewConversation(); }}
                            className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all group"
                            title="Nouvelle conversation"
                        >
                            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
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
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="p-5 bg-white/5 rounded-full border border-white/5 shadow-2xl">
                                    <MessageSquare className="w-10 h-10 text-white/40" />
                                </div>
                                <div className="mt-4">
                                    <h2 className="text-xl font-medium text-white">Comment puis-je vous aider ?</h2>
                                    <p className="text-sm text-white/40 mt-1 max-w-sm">Créez un événement, analysez vos rappels ou ouvrez un flux de réglage sans quitter Caltemp.</p>
                                </div>
                                <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                                    {quickPrompts.map((prompt) => (
                                        <button
                                            key={prompt}
                                            type="button"
                                            onClick={() => handleSend(prompt, [], { source: 'quick-prompt' })}
                                            className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
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
