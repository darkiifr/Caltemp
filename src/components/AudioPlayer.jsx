import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, MoreVertical, Edit2, Download } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';

export default function AudioPlayer({ src, name, onRename }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(name);
    
    const audioRef = useRef(null);
    const animationRef = useRef(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateDuration = () => setDuration(audio.duration);
        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            cancelAnimationFrame(animationRef.current);
        };

        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', onEnded);
            cancelAnimationFrame(animationRef.current);
        };
    }, []);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            cancelAnimationFrame(animationRef.current);
        } else {
            audio.play();
            animationRef.current = requestAnimationFrame(updateProgress);
        }
        setIsPlaying(!isPlaying);
    };

    const updateProgress = () => {
        const audio = audioRef.current;
        if (audio) {
            setProgress(audio.currentTime);
            animationRef.current = requestAnimationFrame(updateProgress);
        }
    };

    const handleSeek = (e) => {
        const audio = audioRef.current;
        const time = parseFloat(e.target.value);
        if (audio) {
            audio.currentTime = time;
            setProgress(time);
        }
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (audio) {
            audio.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleRename = () => {
        if (newName.trim()) {
            onRename(newName);
            setIsEditing(false);
        }
    };

    const handleDownload = async () => {
        try {
            // Convert base64 to Uint8Array
            const base64Data = src.split(',')[1];
            const binaryString = window.atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const filePath = await save({
                defaultPath: `${name}.webm`,
                filters: [{
                    name: 'Audio',
                    extensions: ['webm', 'mp3', 'wav']
                }]
            });

            if (filePath) {
                await writeFile(filePath, bytes);
                alert('Fichier sauvegardé avec succès !');
            }
        } catch (err) {
            console.error('Download error:', err);
            alert('Erreur lors du téléchargement : ' + err.message);
        }
    };

    return (
        <div className="bg-[#252525] rounded-xl p-4 w-full shadow-lg border border-white/5 group hover:border-white/10 transition-all duration-300">
            <audio ref={audioRef} src={src} />
            
            {/* Header: Name & Actions */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex-1 mr-4">
                    {isEditing ? (
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                            className="bg-black/20 text-white text-sm px-2 py-1 rounded w-full outline-none border border-blue-500/50 focus:border-blue-500"
                            autoFocus
                        />
                    ) : (
                        <h4 
                            className="text-sm font-medium text-gray-200 truncate cursor-pointer hover:text-blue-400 transition-colors"
                            onDoubleClick={() => setIsEditing(true)}
                            title="Double-cliquer pour renommer"
                        >
                            {name}
                        </h4>
                    )}
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button 
                        onClick={() => setIsEditing(!isEditing)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Renommer"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                        onClick={handleDownload}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Télécharger"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Controls & Waveform Placeholder */}
            <div className="flex items-center gap-3">
                <button
                    onClick={togglePlay}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all duration-200 active:scale-95"
                >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>

                <div className="flex-1 flex flex-col gap-1">
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={progress}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-gray-500">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                <button 
                    onClick={toggleMute}
                    className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
