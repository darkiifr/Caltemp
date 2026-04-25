import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Paperclip, Square, X, Mic, Globe, BrainCog, FolderCode, Play, Pause, Trash2, Check, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Utility function for className merging
const cn = (...classes) => classes.filter(Boolean).join(" ");

// Embedded CSS for minimal custom styles
const styles = `
  *:focus-visible {
    outline: none !important;
  }
  textarea::-webkit-scrollbar {
    width: 4px;
  }
  textarea::-webkit-scrollbar-track {
    background: transparent;
  }
  textarea::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  .glass-morphism {
    background: rgba(255, 255, 255, 0.02);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 4px 20px -1px rgba(0, 0, 0, 0.2);
  }
  .dark .glass-morphism {
    background: rgba(10, 10, 10, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.03);
  }
  .dark .glass-morphism {
    background: rgba(10, 10, 10, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.03);
  }
`;

// Inject styles into document
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-base text-gray-100 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] resize-none scrollbar-thin scrollbar-thumb-[#444444] scrollbar-track-transparent hover:scrollbar-thumb-[#555555]",
      className
    )}
    ref={ref}
    rows={1}
    spellCheck={false}
    {...props} />
));
Textarea.displayName = "Textarea";

// Tooltip Components
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-[#333333] bg-[#1F2023] px-3 py-1.5 text-sm text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props} />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Dialog Components
const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border border-[#333333] bg-[#1F2023] p-0 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl",
        className
      )}
      {...props}>
      {children}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 z-10 rounded-full bg-[#2E3033]/80 p-2 hover:bg-[#2E3033] transition-all">
        <X className="h-5 w-5 text-gray-200 hover:text-white" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-gray-100",
      className
    )}
    {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const Button = React.forwardRef(({ className, variant = "default", size = "default", ...props }, ref) => {
  const variantClasses = {
    default: "bg-white text-black hover:bg-white/90 font-semibold shadow-sm",
    outline: "border border-white/10 bg-white/5 hover:bg-white/10 text-white shadow-sm",
    ghost: "bg-transparent hover:bg-white/5 text-white/70 hover:text-white",
    destructive: "bg-red-500/90 hover:bg-red-500 text-white shadow-lg shadow-red-500/20",
    premium: "bg-blue-600 text-white font-bold hover:bg-blue-700",
  };
  const sizeClasses = {
    default: "h-10 px-4 py-2 rounded-xl",
    sm: "h-8 px-3 text-xs rounded-lg",
    lg: "h-12 px-6 text-base rounded-2xl",
    icon: "h-9 w-9 rounded-full aspect-[1/1]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      ref={ref}
      {...props} />
  );
});
Button.displayName = "Button";

// Removed AudioPreview, AudioVisualizer, and VoiceRecorder components for dictation-only mode

const VoiceRecordingOverlay = React.memo(({ duration }) => {
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="px-6 py-8 flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="h-16 w-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center relative">
        <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
        <Mic className="w-8 h-8" />
      </div>

      <div className="w-full text-center space-y-2">
        <p className="text-2xl font-bold text-white tracking-widest font-mono">
          {formatTime(duration)}
        </p>
        <span className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Enregistrement vocal...</span>
      </div>
    </div>
  );
});
VoiceRecordingOverlay.displayName = "VoiceRecordingOverlay";

const ProcessingOverlay = React.memo(() => (
  <div className="py-12 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-200">
     <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
        <Check className="w-6 h-6 text-white/50" />
     </div>
     <p className="text-sm text-white/50 font-medium">Traitement en cours...</p>
  </div>
));
ProcessingOverlay.displayName = "ProcessingOverlay";

const ImageViewDialog = React.memo(({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent
        className="p-0 border-none bg-transparent shadow-none max-w-[90vw] md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-[#1F2023] rounded-2xl overflow-hidden shadow-2xl">
          <img
            src={imageUrl}
            alt="Full preview"
            className="w-full max-h-[80vh] object-contain rounded-2xl" />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
});
ImageViewDialog.displayName = "ImageViewDialog";

const PromptInputContext = React.createContext({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
});
function usePromptInput() {
  const context = React.useContext(PromptInputContext);
  if (!context) throw new Error("usePromptInput must be used within a PromptInput");
  return context;
}

const PromptInput = React.forwardRef((
  {
    className,
    isLoading = false,
    maxHeight = 240,
    value,
    onValueChange,
    onSubmit,
    children,
    disabled = false,
    onDragOver,
    onDragLeave,
    onDrop,
  },
  ref
) => {
  const [internalValue, setInternalValue] = React.useState(value || "");
  const handleChange = (newValue) => {
    setInternalValue(newValue);
    // Use startTransition to update parent state without blocking typing
    React.startTransition(() => {
      onValueChange?.(newValue);
    });
  };
  const contextValue = React.useMemo(() => ({
    isLoading,
    value: value ?? internalValue,
    setValue: onValueChange ?? handleChange,
    maxHeight,
    onSubmit,
    disabled,
  }), [isLoading, value, internalValue, onValueChange, handleChange, maxHeight, onSubmit, disabled]);

  return (
    <TooltipProvider>
      <PromptInputContext.Provider value={contextValue}>
        <div
          className={cn(
            "rounded-2xl border border-white/10 bg-[#141414] transition-colors",
            (isLoading || (value ?? internalValue)?.length > 0) && "border-white/20"
          )}>
          <div
            ref={ref}
            className={cn(
              "p-2.5",
              isLoading && "bg-white/5 saturate-[1.2]",
              className
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}>
            {children}
          </div>
        </div>
      </PromptInputContext.Provider>
    </TooltipProvider>
  );
});
PromptInput.displayName = "PromptInput";

const PromptInputTextarea = ({
  className,
  onKeyDown,
  disableAutosize = false,
  placeholder,
  ...props
}) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput();
  const textareaRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (disableAutosize || !textarea) return;
    
    const rafId = requestAnimationFrame(() => {
      const currentHeight = textarea.style.height;
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      
      const nextHeight = typeof maxHeight === "number"
          ? `${Math.min(scrollHeight, maxHeight)}px`
          : `${scrollHeight}px`;
      
      if (currentHeight !== nextHeight) {
          textarea.style.height = nextHeight;
      } else {
          textarea.style.height = currentHeight;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [value, maxHeight, disableAutosize]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
    onKeyDown?.(e);
  };

  const handleLocalChange = (e) => {
    setValue(e.target.value);
  };

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={handleLocalChange}
      onKeyDown={handleKeyDown}
      className={cn("text-base bg-transparent border-none shadow-none focus-visible:ring-0", className)}
      disabled={disabled}
      placeholder={placeholder}
      {...props} />
  );
};

const PromptInputActions = ({ children, className, ...props }) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>
    {children}
  </div>
);

const PromptInputAction = ({
  tooltip,
  children,
  className,
  side = "top",
  disabled,
  ...props
}) => {
  const context = usePromptInput();
  const isDisabled = disabled ?? context.disabled;
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={isDisabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

// Simplified Divider
const CustomDivider = () => <div className="h-5 w-[1px] bg-white/5 mx-1" />;

export const PromptInputBox = React.forwardRef((
  { 
    onSend, 
    isLoading = false, 
    onAbort, 
    placeholder = "Posez une question à Dexter...", 
    className 
  }, 
  ref
) => {
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState([]);
  const [filePreviews, setFilePreviews] = React.useState({});
  const [selectedImage, setSelectedImage] = React.useState(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingDuration, setRecordingDuration] = React.useState(0);
  const [audioUrl, setAudioUrl] = React.useState(null);
  const [audioFile, setAudioFile] = React.useState(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const [showSearch, setShowSearch] = React.useState(false);
  const [showThink, setShowThink] = React.useState(false);
  const [showCanvas, setShowCanvas] = React.useState(false);

  const uploadInputRef = React.useRef(null);
  const promptBoxRef = React.useRef(null);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);
  const durationTimerRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleToggleChange = (value) => {
    if (value === "search") {
      setShowSearch((prev) => !prev);
      setShowThink(false);
    } else if (value === "think") {
      setShowThink((prev) => !prev);
      setShowSearch(false);
    }
  };

  const handleCanvasToggle = () => setShowCanvas((prev) => !prev);

  const isImageFile = React.useCallback((file) => file.type.startsWith("image/"), []);
  const isTextFile = React.useCallback((file) => 
    file.type.startsWith("text/") || 
    file.name.endsWith(".md") || 
    file.name.endsWith(".js") || 
    file.name.endsWith(".jsx") || 
    file.name.endsWith(".json") ||
    file.name.endsWith(".css")
  , []);

  const processFile = React.useCallback(async (file) => {
    if (isImageFile(file)) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Image trop volumineuse (max 10MB)");
        return;
      }
      setFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onload = (e) => setFilePreviews(prev => ({ ...prev, [file.name]: e.target?.result }));
      reader.readAsDataURL(file);
    } else if (isTextFile(file)) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Fichier texte trop volumineux (max 2MB)");
        return;
      }
      setFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onload = (e) => setFilePreviews(prev => ({ ...prev, [file.name]: e.target?.result })); // Storing content as preview for text
      reader.readAsText(file);
    } else {
      alert("Ce type de fichier n'est pas encore supporté.");
    }
  }, [isImageFile, isTextFile]);

  const handleDragOver = React.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = React.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = React.useCallback((e) => {
     e.preventDefault();
     e.stopPropagation();
     const files = Array.from(e.dataTransfer.files);
     const imageFiles = files.filter((file) => isImageFile(file));
     if (imageFiles.length > 0) processFile(imageFiles[0]);
   }, [isImageFile, processFile]);

  const handleRemoveFile = (index) => {
    const fileToRemove = files[index];
    if (fileToRemove && filePreviews[fileToRemove.name]) setFilePreviews({});
    setFiles([]);
  };

  const openImageModal = (imageUrl) => setSelectedImage(imageUrl);

  const handlePaste = React.useCallback((e) => {
     const items = e.clipboardData?.items;
     if (!items) return;
     for (let i = 0; i < items.length; i++) {
       if (items[i].type.indexOf("image") !== -1) {
         const file = items[i].getAsFile();
         if (file) {
           e.preventDefault();
           processFile(file);
           break;
         }
       }
     }
   }, [processFile]);

  React.useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleSubmit = (finalInput = input, finalFiles = files) => {
    if (finalInput.trim() || finalFiles.length > 0) {
      setIsProcessing(true);
      
      let messagePrefix = "";
      if (showSearch) messagePrefix = "[Search: ";
      else if (showThink) messagePrefix = "[Think: ";
      else if (showCanvas) messagePrefix = "[Canvas: ";
      const formattedInput = messagePrefix ? `${messagePrefix}${finalInput}]` : finalInput;
      
      const sendingFiles = [...finalFiles];
      if (audioFile) sendingFiles.push(audioFile);
      
      // Inject text file content into the message if present
      let enrichedInput = formattedInput;
      const textFiles = finalFiles.filter(f => isTextFile(f));
      if (textFiles.length > 0) {
        enrichedInput += "\n\n--- CONTENU DES FICHIERS JOINTS ---\n";
        textFiles.forEach(f => {
          const content = filePreviews[f.name];
          if (content) {
            enrichedInput += `\n[Fichier: ${f.name}]\n${content}\n`;
          }
        });
      }

      onSend(enrichedInput, sendingFiles);
      
      setInput("");
      setFiles([]);
      setFilePreviews({});
      setAudioFile(null);
      setAudioUrl(null);
      setShowCanvas(false);
      setIsProcessing(false);
    }
  };

  const getSupportedMimeType = () => {
    const types = ["audio/mp4", "audio/webm", "audio/ogg", "audio/wav"];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Extension varies based on mime type
        let ext = 'webm';
        if (mimeType.includes('mp4')) ext = 'mp4';
        else if (mimeType.includes('ogg')) ext = 'ogg';
        else if (mimeType.includes('wav')) ext = 'wav';
        
        const file = new File([audioBlob], `voice_message_${Date.now()}.${ext}`, { type: mimeType || 'audio/webm' });
        setAudioFile(file);
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      durationTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Microphone error:", err);
      alert("Accès au microphone refusé.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    clearInterval(durationTimerRef.current);
  };

  const discardAudio = () => {
    setAudioUrl(null);
    setAudioFile(null);
  };

  const hasContent = input.trim() !== "" || files.length > 0 || audioFile !== null;

  return (
    <>
      <PromptInput
        value={input}
        onValueChange={setInput}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className={cn(
          "w-full transition-all duration-200",
          isRecording && "ring-1 ring-white/20",
          className
        )}
        disabled={isLoading}
        ref={ref || promptBoxRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}>
        
        {audioUrl && !isRecording && (
          <div className="flex items-center gap-3 p-3 m-2 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in zoom-in-95">
            <button onClick={discardAudio} className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex-1">
              <audio src={audioUrl} controls className="w-full h-8 [&::-webkit-media-controls-panel]:bg-white/5 [&::-webkit-media-controls-current-time-display]:text-white [&::-webkit-media-controls-time-remaining-display]:text-white" />
            </div>
          </div>
        )}

        {files.length > 0 && !isRecording && !audioUrl && (
          <div className="flex flex-wrap gap-3 p-2 pb-3 transition-all duration-300">
            {files.map((file, index) => (
              <div key={index} className="relative group animate-in zoom-in fade-in">
                {isImageFile(file) ? (
                  <div
                    className="w-16 h-16 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border border-white/10 ring-0 ring-blue-500/50 hover:ring-2"
                    onClick={() => openImageModal(filePreviews[file.name])}>
                    <img
                      src={filePreviews[file.name]}
                      alt={file.name}
                      className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="h-16 px-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 min-w-[120px]">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <FolderCode className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-white truncate max-w-[100px]">{file.name}</span>
                      <span className="text-[10px] text-white/40 uppercase">Fichier</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(index);
                  }}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all shadow-lg scale-90 hover:scale-100">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            "transition-all duration-300",
            isRecording ? "h-0 overflow-hidden opacity-0" : "opacity-100"
          )}>
          <PromptInputTextarea
            placeholder={
              showSearch
                ? "Recherche web..."
                : showThink
                ? "Réflexion profonde..."
                : showCanvas
                ? "Création canvas..."
                : placeholder
            }
            className="text-base" />
        </div>

        {isRecording && <VoiceRecordingOverlay duration={recordingDuration} />}
        {isProcessing && <ProcessingOverlay />}

        <PromptInputActions className="flex items-center justify-between gap-2 p-0 pt-2">
          <div
            className={cn(
              "flex items-center gap-1 transition-all duration-300",
              (isRecording || isProcessing) ? "opacity-0 invisible h-0" : "opacity-100 visible h-auto"
            )}>
            <PromptInputAction tooltip="Joindre fichiers (Images, PDF, Texte)">
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="flex h-8 w-8 text-[#9CA3AF] cursor-pointer items-center justify-center rounded-full transition-all hover:bg-white/10 hover:text-white"
                disabled={isRecording}>
                <Paperclip className="h-5 w-5 transition-transform hover:rotate-12" />
                <input
                  ref={uploadInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      Array.from(e.target.files).forEach(file => processFile(file));
                    }
                    if (e.target) e.target.value = "";
                  }}
                  multiple />
              </button>
            </PromptInputAction>

            <div className="flex items-center">
              <button
                type="button"
                onClick={() => handleToggleChange("search")}
                className={cn(
                  "rounded-full transition-all flex items-center gap-1 px-2 py-1 border h-8",
                  showSearch
                    ? "bg-[#1EAEDB]/15 border-[#1EAEDB] text-[#1EAEDB]"
                    : "bg-transparent border-transparent text-[#9CA3AF] hover:text-[#D1D5DB]"
                )}>
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <motion.div
                    animate={{ rotate: showSearch ? 360 : 0, scale: showSearch ? 1.1 : 1 }}
                    whileHover={{ rotate: showSearch ? 360 : 15, scale: 1.1, transition: { type: "spring", stiffness: 300, damping: 10 } }}
                    transition={{ type: "spring", stiffness: 260, damping: 25 }}>
                    <Globe className={cn("w-4 h-4", showSearch ? "text-[#1EAEDB]" : "text-inherit")} />
                  </motion.div>
                </div>
                <AnimatePresence>
                  {showSearch && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs overflow-hidden whitespace-nowrap text-blue-400 flex-shrink-0">
                      Search
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              <CustomDivider />

              <button
                type="button"
                onClick={() => handleToggleChange("think")}
                className={cn(
                  "rounded-full transition-all flex items-center gap-1 px-2 py-1 border h-8",
                  showThink
                    ? "bg-[#8B5CF6]/15 border-[#8B5CF6] text-[#8B5CF6]"
                    : "bg-transparent border-transparent text-[#9CA3AF] hover:text-[#D1D5DB]"
                )}>
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <motion.div
                    animate={{ rotate: showThink ? 360 : 0, scale: showThink ? 1.1 : 1 }}
                    whileHover={{ rotate: showThink ? 360 : 15, scale: 1.1, transition: { type: "spring", stiffness: 300, damping: 10 } }}
                    transition={{ type: "spring", stiffness: 260, damping: 25 }}>
                    <BrainCog className={cn("w-4 h-4", showThink ? "text-[#8B5CF6]" : "text-inherit")} />
                  </motion.div>
                </div>
                <AnimatePresence>
                  {showThink && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs overflow-hidden whitespace-nowrap text-[#8B5CF6] flex-shrink-0">
                      Think
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              <CustomDivider />

              <button
                type="button"
                onClick={handleCanvasToggle}
                className={cn(
                  "rounded-full transition-all flex items-center gap-1 px-2 py-1 border h-8",
                  showCanvas
                    ? "bg-[#F97316]/15 border-[#F97316] text-[#F97316]"
                    : "bg-transparent border-transparent text-[#9CA3AF] hover:text-[#D1D5DB]"
                )}>
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <motion.div
                    animate={{ rotate: showCanvas ? 360 : 0, scale: showCanvas ? 1.1 : 1 }}
                    whileHover={{ rotate: showCanvas ? 360 : 15, scale: 1.1, transition: { type: "spring", stiffness: 300, damping: 10 } }}
                    transition={{ type: "spring", stiffness: 260, damping: 25 }}>
                    <FolderCode className={cn("w-4 h-4", showCanvas ? "text-[#F97316]" : "text-inherit")} />
                  </motion.div>
                </div>
                <AnimatePresence>
                  {showCanvas && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs overflow-hidden whitespace-nowrap text-orange-400 flex-shrink-0">
                      Canvas
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isLoading && (
              <Button variant="destructive" size="icon" onClick={onAbort} className="h-9 w-9 shadow-red-500/20 animate-in fade-in slide-in-from-right-3">
                <Square className="h-4 w-4 fill-current" />
              </Button>
            )}
            
            {!isLoading && !isProcessing && (
              <PromptInputAction 
                tooltip={isRecording ? "Terminer l'enregistrement" : hasContent ? "Envoyer" : "Message vocal"}
                disabled={false}
              >
                <Button 
                  variant={isRecording ? "default" : hasContent ? "default" : "ghost"}
                  size="icon"
                  className={cn("h-9 w-9 transition-all duration-500", isRecording && "ring-4 ring-red-500/30 scale-110 bg-red-500 text-white hover:bg-red-600")}
                  onClick={() => {
                    if (isRecording) {
                      stopVoiceRecording();
                    }
                    else if (hasContent) handleSubmit();
                    else startVoiceRecording();
                  }}>
                  {isRecording ? <Square className="h-4 w-4" /> : hasContent ? <ArrowUp className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              </PromptInputAction>
            )}
          </div>
        </PromptInputActions>
      </PromptInput>
      <ImageViewDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
});
PromptInputBox.displayName = "PromptInputBox";