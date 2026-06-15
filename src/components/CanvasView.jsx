import { X, Copy, Check, FileCode, FileText, Download } from 'lucide-react';
import { motion } from 'framer-motion';

export default function CanvasView({ content, onClose, onUpdate, title = "Canvas" }) {
    const [localContent, setLocalContent] = React.useState(content);
    const [copied, setCopied] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);

    React.useEffect(() => {
        setLocalContent(content);
    }, [content]);

    const handleCopy = () => {
        navigator.clipboard.writeText(localContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const element = document.createElement("a");
        const file = new Blob([localContent], { type: 'text/markdown' });
        element.href = URL.createObjectURL(file);
        element.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.md`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleSave = () => {
        onUpdate?.(localContent);
        setIsEditing(false);
    };

    if (!content) return null;

    const isCode = localContent.includes('```');

    return (
        <motion.div 
            initial={{ x: 450, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 450, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-[450px] bg-[#111111] border-l border-[#333] flex flex-col h-full z-20 shadow-2xl relative overflow-hidden"
        >
            <div className="h-16 border-b border-[#333] px-6 flex items-center justify-between bg-[#111111]">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-md border border-white/5">
                        {isCode ? <FileCode className="w-4 h-4 text-blue-400" /> : <FileText className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <div>
                        <h2 className="font-medium text-white tracking-tight leading-tight">{title}</h2>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={() => setIsEditing(!isEditing)}
                        className={`h-8 px-3 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${
                            isEditing 
                            ? 'bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/20' 
                            : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {isEditing ? 'Aperçu' : 'Éditer'}
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button 
                        onClick={handleDownload}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
                        title="Télécharger"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={handleCopy}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
                        title="Copier"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={onClose}
                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all ml-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                {isEditing ? (
                    <textarea
                        value={localContent}
                        onChange={(e) => setLocalContent(e.target.value)}
                        className="w-full h-full p-10 bg-transparent text-white/90 font-mono text-[14px] leading-relaxed outline-none resize-none selection:bg-blue-500/30"
                        placeholder="Modifiez le contenu du canvas ici..."
                        autoFocus
                    />
                ) : (
                    <div className="p-10 prose prose-invert max-w-none text-white/80 leading-relaxed font-sans">
                        {localContent.split('```').map((block, i) => {
                            if (i % 2 === 1) {
                                const lines = block.split('\n');
                                const lang = lines[0].trim();
                                const code = lines.slice(1).join('\n');
                                return (
                                    <div key={i} className="my-8 relative group">
                                        <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            <div className="text-[9px] text-white/50 font-black uppercase bg-white/10 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md">
                                                {lang || 'code'}
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <pre className="bg-white/[0.03] p-6 rounded-[20px] border border-white/10 overflow-x-auto font-mono text-[13px] shadow-2xl leading-relaxed backdrop-blur-xl">
                                                <code>{code}</code>
                                            </pre>
                                        </div>
                                    </div>
                                );
                            }
                            return <p key={i} className="whitespace-pre-wrap mb-8 text-[16px] font-medium leading-relaxed opacity-90">{block}</p>;
                        })}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-[#333] bg-[#0a0a0a] flex justify-end">
                <div className="text-[10px] text-gray-500 font-mono uppercase">
                    Dexter Canvas
                </div>
            </div>
        </motion.div>
    );
}
