import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Edit2, Download, Infinity } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { playBubbleSound } from '../utils/sound';

export default function AudioPlayer({ src, name, onRename }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newName, setNewName] = useState(name);
    const [isAutomix, setIsAutomix] = useState(false); // Automix state

    const audioRef = useRef(null);
    const animationRef = useRef(null);

    const updateProgress = () => {
        const audio = audioRef.current;
        if (audio) {
            setProgress(audio.currentTime);
            animationRef.current = requestAnimationFrame(updateProgress);
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateDuration = () => setDuration(audio.duration);
        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            cancelAnimationFrame(animationRef.current);
            // If Automix is on, we would loop or play next here in a real app
            if (isAutomix) {
                audio.currentTime = 0;
                audio.play();
                setIsPlaying(true);
                animationRef.current = requestAnimationFrame(updateProgress);
            }
        };

        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', onEnded);
            cancelAnimationFrame(animationRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAutomix]); // Re-bind if automix changes

    const togglePlay = () => {
        playBubbleSound();
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

    const handleSeek = (e) => {
        const audio = audioRef.current;
        const time = parseFloat(e.target.value);
        if (audio) {
            audio.currentTime = time;
            setProgress(time);
        }
    };

    const toggleMute = () => {
        playBubbleSound();
        const audio = audioRef.current;
        if (audio) {
            audio.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const toggleAutomix = () => {
        playBubbleSound();
        setIsAutomix(!isAutomix);
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
        playBubbleSound();
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
        <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-4 w-full shadow-2xl border border-white/10 group hover:border-white/20 transition-all duration-300">
            <audio ref={audioRef} src={src} />

            {/* Header: Name & Actions */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex-1 mr-4 min-w-0">
                    {isEditing ? (
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                            className="bg-white/10 text-white text-sm px-2 py-1 rounded w-full outline-none border border-blue-500/50 focus:border-blue-500 focus:bg-white/20 transition-all"
                            autoFocus
                        />
                    ) : (
                        <h4
                            className="text-sm font-semibold text-gray-200 truncate cursor-pointer hover:text-blue-400 transition-colors"
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
            <div className="flex items-center gap-4">
                <button
                    onClick={togglePlay}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg shadow-white/10"
                >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <div className="flex-1 flex flex-col gap-1.5">
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={progress}
                        onChange={handleSeek}
                        className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white hover:accent-gray-200 transition-all"
                    />
                    <div className="flex justify-between text-[10px] font-medium text-gray-400 font-mono">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleAutomix}
                        className={`p-2 rounded-lg transition-all ${isAutomix ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                        title="Automix (Boucle)"
                    >
                        <Infinity className="w-4 h-4" />
                    </button>

                    <button
                        onClick={toggleMute}
                        className="p-2 text-gray-400 hover:text-white transition-colors"
                    >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
