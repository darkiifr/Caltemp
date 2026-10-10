import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { chatCompletion, isAiConfigured, searchWeb } from '../services/ai';
import { ensureLocalServer } from '../services/localAi';
import { playBubbleSound } from '../utils/sound';
import { PromptInputBox } from './ui/ai-prompt-box';
import { motion, AnimatePresence } from 'framer-motion';
import CanvasView from './CanvasView';
import LocalModelSetup, { useLocalAiStatus } from './LocalModelSetup';
import { Search, Loader2, MessageSquare, CornerDownLeft, Plus, Trash2, HardDrive } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { handleLocalDexterCommand } from '../domain/dexterLocal';
import { sanitizeDexterReply } from '../domain/dexterActions';
import { getNextOccurrence } from '../domain/events';
import { executeDexterTool, toLocalIso } from '../domain/dexterTools';
import { buildDexterSystemPrompt, runDexterAgent } from '../services/dexterAgent';
import { normalizeUnclearDexterReply, shouldUseLocalDexterCommand } from '../domain/dexterRouting';

const STREAM_RENDER_INTERVAL_MS = 60;
const TOOL_STATUS_LABELS = {
    list_events: 'Consultation de l’agenda…',
    create_event: 'Création de l’événement…',
    update_event: 'Modification de l’événement…',
    delete_event: 'Préparation de la suppression…',
    find_free_slots: 'Recherche de créneaux libres…',
    week_summary: 'Analyse de la semaine…',
    show_calendar: 'Ouverture de l’agenda…',
    open_panel: 'Ouverture de l’écran…',
    update_settings: 'Mise à jour des réglages…',
    export_view: 'Export de la vue…',
    sync_subscriptions: 'Actualisation des abonnements…',
    search_web: 'Recherche sur le web…',
};

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

const ConfirmationCard = ({ confirmation, onResolve }) => {
    const pending = confirmation.status === 'pending';
    return (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-sm text-white/85">
            <div>{confirmation.label}</div>
            {pending ? (
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        onClick={() => onResolve(true)}
                        className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                    >
                        {confirmation.confirmLabel || 'Confirmer'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onResolve(false)}
                        className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                    >
                        Annuler
                    </button>
                </div>
            ) : (
                <div className="mt-2 text-xs text-white/50">
                    {confirmation.status === 'done' ? 'Fait.' : confirmation.status === 'error' ? 'Échec de l’action.' : 'Annulé.'}
                </div>
            )}
        </div>
    );
};

const MessageItem = React.memo(({ msg, onResolveConfirmation }) => {
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
                                {msg.confirmations?.map((confirmation, index) => (
                                    <ConfirmationCard
                                        key={`${msg.id}-${index}`}
                                        confirmation={confirmation}
                                        onResolve={(accepted) => onResolveConfirmation?.(msg.id, index, accepted)}
                                    />
                                ))}
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

function upcomingForPrompt(events = [], now = new Date(), limit = 8) {
    return events
        .map(event => ({ event, date: getNextOccurrence(event, now) }))
        .filter(item => item.date && item.date >= now)
        .sort((a, b) => a.date - b.date)
        .slice(0, limit)
        .map(({ event, date }) => ({ id: event.id, title: event.title || 'Sans titre', date: toLocalIso(date) }));
}

function historyForModel(messages = []) {
    return messages
        .filter(message => (message.role === 'user' || message.role === 'assistant') && message.type !== 'error' && message.content?.trim())
        .slice(-8)
        .map(message => ({
            role: message.role,
            content: message.content.replace(/<thought>[\s\S]*?<\/thought>/g, '').slice(0, 2000),
        }));
}

export default function Dexter({ onClose, settings, events = [], onAddEvent, onOpenSettingsTab, onExportPng, onExportPdf, toolHost, onLocalAiChange }) {
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
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const toolHostRef = useRef(toolHost);
    toolHostRef.current = toolHost;
    const localAiStatus = useLocalAiStatus();
    const aiReady = isAiConfigured(settings?.localAi);
    const [showSetup, setShowSetup] = useState(false);
    const [toolStatus, setToolStatus] = useState('');
    const isStreaming = messages.some(message => message.isStreaming);
    const quickPrompts = [
        'Résume ma semaine',
        'Qu’ai-je demain ?',
        'Trouve-moi un créneau d’une heure demain',
        'Affiche la vue semaine',
    ];

    useEffect(() => {
        try {
            window.localStorage.removeItem('caltemp.dexter.selectedModel.v1');
        } catch {
            // Ignore storage quota/privacy errors. Dexter no longer stores a model preference.
        }
    }, []);

    useEffect(() => {
        // Streaming updates arrive many times per second: persist once the answer is complete.
        if (isStreaming) return;
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
    }, [activeConversationId, messages, isStreaming]);

    useEffect(() => {
        // Nothing to follow in an empty conversation (keeps the setup panel in view).
        if (!messages.length && !isTyping) return;
        // Smooth scrolling on every streamed chunk keeps the compositor busy: jump while streaming.
        messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    }, [messages, isTyping, isStreaming]);

    useEffect(() => {
        eventsRef.current = events;
    }, [events]);

    // Load the model as soon as Dexter is opened, so the first answer does not
    // wait for it. The native watchdog unloads it again after inactivity.
    const warmUpKey = aiReady && settings?.aiEnabled !== false ? JSON.stringify(settings?.localAi || {}) : '';
    useEffect(() => {
        if (!warmUpKey) return;
        ensureLocalServer(JSON.parse(warmUpKey)).catch((error) => console.warn('Dexter warm-up failed:', error));
    }, [warmUpKey]);



    const resolveConfirmation = React.useCallback(async (messageId, index, accepted) => {
        const setStatus = (status) => setMessages(prev => prev.map(message => {
            if (message.id !== messageId || !message.confirmations?.[index]) return message;
            const confirmations = message.confirmations.map((item, itemIndex) => (itemIndex === index ? { ...item, status } : item));
            return { ...message, confirmations };
        }));
        const message = messages.find(item => item.id === messageId);
        const confirmation = message?.confirmations?.[index];
        if (!confirmation || confirmation.status !== 'pending') return;
        if (!accepted) {
            setStatus('cancelled');
            return;
        }
        try {
            if (confirmation.kind === 'delete_event') {
                const updated = await toolHostRef.current?.deleteEvent?.(confirmation.eventId);
                eventsRef.current = Array.isArray(updated)
                    ? updated
                    : eventsRef.current.filter(event => event.id !== confirmation.eventId);
            }
            setStatus('done');
        } catch (error) {
            console.error('Dexter confirmation failed:', error);
            setStatus('error');
        }
    }, [messages]);

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

        const aiAvailable = settings?.aiEnabled !== false && isAiConfigured(settings?.localAi);
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

        if (!aiAvailable) {
            setShowSetup(true);
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                role: 'assistant',
                type: 'error',
                content: "Je sais déjà gérer les commandes simples (créer, modifier, résumer…), mais pour le reste il me faut mon modèle local. Installez-le ci-dessous : il fonctionne hors ligne, sur cet ordinateur.",
            }]);
            setIsTyping(false);
            setIsSearching(false);
            abortControllerRef.current = null;
            return;
        }

        const signal = abortControllerRef.current?.signal;
        const assistantMsgId = Date.now() + 2;
        const deferred = [];
        let pendingText = '';
        let flushTimer = null;
        const flush = () => {
            flushTimer = null;
            const visible = sanitizeDexterReply(pendingText, settings) || pendingText;
            setMessages(prev => prev.map(msg => (msg.id === assistantMsgId ? { ...msg, content: visible } : msg)));
        };
        // Coalesce streamed tokens: one render every STREAM_RENDER_INTERVAL_MS instead of one per token.
        const scheduleFlush = (text) => {
            pendingText = text;
            if (!flushTimer) flushTimer = setTimeout(flush, STREAM_RENDER_INTERVAL_MS);
        };

        try {
            const now = new Date();
            let system = buildDexterSystemPrompt({ now, settings, upcoming: upcomingForPrompt(eventsRef.current, now) });
            if (isThink) {
                system += "\n\nRéfléchis d’abord étape par étape dans des balises <thought>...</thought>, puis donne ta réponse.";
            }
            if (isCanvas) {
                system += "\n\nL’utilisateur veut une réponse détaillée et structurée en Markdown.";
            }

            let userText = cleanValue;
            if (files.length > 0) {
                userText += `\n\n(Pièces jointes ignorées : le modèle local ne lit que le texte. Fichiers : ${files.map(file => file.name).join(', ')})`;
            }
            if (isSearch) {
                const results = await searchWeb(cleanValue);
                if (results) {
                    userText += `\n\nRésultats web :\n${results.slice(0, 5).map(result => `- ${result.title} : ${result.snippet}`).join('\n')}`;
                }
                setIsSearching(false);
            }

            setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true }]);

            // Actions that replace Dexter on screen run once the answer is saved,
            // otherwise Dexter would unmount in the middle of the conversation.
            const host = {
                ...(toolHostRef.current || {}),
                navigate: (request) => deferred.push(() => toolHostRef.current?.navigate?.(request)),
                exportView: async (format) => {
                    deferred.push(() => toolHostRef.current?.exportView?.(format));
                },
                openPanel: (panel, options) => {
                    if (panel === 'new_event') deferred.push(() => toolHostRef.current?.openPanel?.(panel, options));
                    else toolHostRef.current?.openPanel?.(panel, options);
                },
                getEvents: () => eventsRef.current,
                getSettings: () => settingsRef.current,
                saveEvent: async (event) => {
                    const updated = await onAddEvent(event);
                    if (Array.isArray(updated)) eventsRef.current = updated;
                    referencedEventIdRef.current = event.id;
                    return updated;
                },
                searchWeb,
            };

            const result = await runDexterAgent({
                messages: [
                    { role: 'system', content: system },
                    ...historyForModel(messages),
                    { role: 'user', content: userText },
                ],
                signal,
                complete: ({ messages: requestMessages, tools, onDelta }) => chatCompletion({
                    messages: requestMessages,
                    tools,
                    settings: settings?.localAi,
                    signal,
                    maxTokens: isCanvas || isThink ? 1600 : 700,
                    temperature: isThink ? 0.6 : 0.3,
                    onDelta: (fullText) => {
                        setIsTyping(false);
                        onDelta(fullText);
                    },
                }),
                onText: scheduleFlush,
                onToolStart: (name) => setToolStatus(TOOL_STATUS_LABELS[name] || 'Action en cours…'),
                executeTool: (name, args) => executeDexterTool(name, args, host),
            });

            clearTimeout(flushTimer);
            const displays = result.actions.map(action => action.display).filter(Boolean);
            let text = sanitizeDexterReply(result.text || '', settings);
            text = normalizeUnclearDexterReply({ userText: cleanValue, assistantText: text });
            const content = [...displays, text].filter(Boolean).join('\n\n')
                || (result.confirmations.length ? 'Confirmez l’action ci-dessous.' : 'C’est fait.');

            setMessages(prev => prev.map(msg => (msg.id === assistantMsgId
                ? {
                    ...msg,
                    content,
                    isStreaming: false,
                    confirmations: result.confirmations.map(item => ({ ...item, status: 'pending' })),
                }
                : msg)));

            if (deferred.length) {
                setTimeout(() => deferred.forEach(run => run()), 200);
            } else if (isCanvas || content.length > 1500 || (content.match(/```/g) || []).length >= 2) {
                setCanvasContent(content);
            }
        } catch (error) {
            clearTimeout(flushTimer);
            if (error?.name === 'AbortError' || signal?.aborted) {
                setMessages(prev => prev.map(msg => (msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg)));
                return;
            }
            const message = String(error?.message || error);
            setMessages(prev => [
                ...prev.filter(msg => msg.id !== assistantMsgId || msg.content),
                { id: Date.now(), role: 'assistant', type: 'error', content: message },
            ].map(msg => (msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg)));
        } finally {
            setToolStatus('');
            setIsTyping(false);
            setIsSearching(false);
            abortControllerRef.current = null;
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
                        <button
                            type="button"
                            onClick={() => setShowSetup(value => !value)}
                            className={`ml-1 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${aiReady ? 'border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-100/80' : 'border-white/10 bg-white/5 text-white/50'}`}
                            title="Modèle local de Dexter"
                        >
                            <HardDrive className="h-3 w-3" />
                            {aiReady
                                ? `Local · ${localAiStatus?.models?.find(model => model.id === (settings?.localAi?.modelId))?.label || 'modèle installé'}`
                                : 'Modèle local à installer'}
                        </button>
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
                        {(showSetup || (!aiReady && messages.length === 0)) && settings?.aiEnabled !== false && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h2 className="text-base font-semibold text-white">Modèle local de Dexter</h2>
                                    {showSetup && (
                                        <button type="button" onClick={() => setShowSetup(false)} className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white" title="Masquer">
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <LocalModelSetup localAi={settings?.localAi} onChange={onLocalAiChange} />
                            </div>
                        )}
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="p-5 bg-white/5 rounded-full border border-white/5 shadow-2xl">
                                    <MessageSquare className="w-10 h-10 text-white/40" />
                                </div>
                                <div className="mt-4">
                                    <h2 className="text-xl font-medium text-white">Comment puis-je vous aider ?</h2>
                                    <p className="text-sm text-white/40 mt-1 max-w-sm">Créez, déplacez ou supprimez des événements, trouvez un créneau, changez de vue ou de réglage : Dexter agit directement dans Caltemp, hors ligne.</p>
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
                                <MessageItem key={msg.id} msg={msg} onResolveConfirmation={resolveConfirmation} />
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

                        {toolStatus && (
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {toolStatus}
                            </div>
                        )}

                        {isTyping && !isSearching && !toolStatus && !messages.some(m => m.isStreaming && m.content) && (
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
                                    <span className="text-sm font-medium text-white/60">Dexter réfléchit…</span>
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
