import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, Timestamp, limit } from "firebase/firestore";
import { db, storage } from "@/src/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, ArrowLeft, MoreVertical, Paperclip, Smile, ShieldCheck, Languages, Sparkles, Bot, Video, Monitor, CheckCheck, Plus, Mic, X, Trash2, Check, Clock, File, FileText, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Message, Conversation } from "@/src/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTheme } from "next-themes";
import { translateMessage, getAiAssistantResponse } from "@/src/services/geminiService";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import { useVoiceRecorder } from "@/src/hooks/useVoiceRecorder";
import { useUserStatus } from "@/src/hooks/useUserStatus";
import { AudioPlayer } from "./AudioPlayer";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ChatWindowProps {
  conversation: Conversation;
  currentUser: User;
  onBack: () => void;
  onStartCall: () => void;
}

export default function ChatWindow({ conversation, currentUser, onBack, onStartCall }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState("English");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isMediaUploading, setIsMediaUploading] = useState(false);
  const [activeUploads, setActiveUploads] = useState<Record<string, { name: string, progress: number }>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionMenu, setReactionMenu] = useState<{ msgId: string; x: number; y: number } | null>(null);
  const { theme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    isRecording, 
    recordingDuration, 
    audioUrl, 
    isUploading, 
    startRecording, 
    stopRecording, 
    cancelRecording, 
    uploadVoiceMessage 
  } = useVoiceRecorder();

  const otherMemberUid = conversation.memberUids.find(uid => uid !== currentUser.uid);
  const otherUserStatus = useUserStatus(otherMemberUid);

  useEffect(() => {
    const q = query(
      collection(db, "conversations", conversation.id, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs);
      setTimeout(() => scrollToBottom(), 50);
    });

    return () => unsubscribe();
  }, [conversation.id]);

  useEffect(() => {
    const markAsRead = async () => {
      const unreadMessages = messages.filter(
        (m) => m.senderId !== currentUser.uid && !m.readBy.includes(currentUser.uid)
      );

      if (unreadMessages.length === 0) return;

      const lastMessageUpdated = unreadMessages.find(m => 
        m.senderId === conversation.lastMessage?.senderId && 
        m.content === conversation.lastMessage?.content
      );

      const promises = unreadMessages.map(m => 
        updateDoc(doc(db, "conversations", conversation.id, "messages", m.id), {
          readBy: [...m.readBy, currentUser.uid]
        })
      );

      if (lastMessageUpdated) {
        promises.push(
          updateDoc(doc(db, "conversations", conversation.id), {
            "lastMessage.readBy": [...(conversation.lastMessage?.readBy || []), currentUser.uid]
          })
        );
      }

      try {
        await Promise.all(promises);
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    };

    markAsRead();
  }, [messages, currentUser.uid, conversation.id]);

  const handleReaction = async (msgId: string, emoji: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    const currentReactions = msg.reactions || {};
    const users = currentReactions[emoji] || [];
    
    let newUsers;
    if (users.includes(currentUser.uid)) {
      newUsers = users.filter(uid => uid !== currentUser.uid);
    } else {
      newUsers = [...users, currentUser.uid];
    }

    const newReactions = { ...currentReactions, [emoji]: newUsers };
    
    // Remove emoji key if no users left
    if (newUsers.length === 0) {
      delete newReactions[emoji];
    }

    try {
      await updateDoc(doc(db, "conversations", conversation.id, "messages", msgId), {
        reactions: newReactions
      });
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
    setReactionMenu(null);
  };

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const onMessageContextMenu = (e: React.MouseEvent | React.TouchEvent, msgId: string) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setReactionMenu({ msgId, x: clientX, y: clientY });
  };

  const handleTouchStart = (e: React.TouchEvent, msgId: string) => {
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    longPressTimer.current = setTimeout(() => {
      setReactionMenu({ msgId, x: clientX, y: clientY });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText("");

    setShowEmojiPicker(false);
    try {
      const messageData = {
        senderId: currentUser.uid,
        content: textToSend,
        type: "text",
        timestamp: serverTimestamp(),
        readBy: [currentUser.uid]
      };

      await addDoc(collection(db, "conversations", conversation.id, "messages"), messageData);
      
      // Update last message in conversation
      await updateDoc(doc(db, "conversations", conversation.id), {
        lastMessage: {
          content: textToSend,
          senderId: currentUser.uid,
          timestamp: serverTimestamp(),
          readBy: [currentUser.uid]
        },
        updatedAt: serverTimestamp()
      });

      // AI Assistant integration
      if (textToSend.toLowerCase().startsWith("/ai ") || textToSend.toLowerCase().startsWith("nexus ")) {
        handleAiAssistant(textToSend);
      }

    } catch (err) {
      console.error(err);
      toast.error("Erro ao enviar mensagem");
    }
  };

  const handleSendVoice = async () => {
    try {
      const downloadUrl = await uploadVoiceMessage(currentUser.uid);
      if (!downloadUrl) return;

      const messageData = {
        senderId: currentUser.uid,
        content: downloadUrl,
        type: "audio" as const,
        timestamp: serverTimestamp(),
        readBy: [currentUser.uid]
      };

      await addDoc(collection(db, "conversations", conversation.id, "messages"), messageData);
      
      await updateDoc(doc(db, "conversations", conversation.id), {
        lastMessage: {
          content: "🎤 Mensagem de voz",
          senderId: currentUser.uid,
          timestamp: serverTimestamp(),
          readBy: [currentUser.uid]
        },
        updatedAt: serverTimestamp()
      });
      
      toast.success("Mensagem de voz enviada!");
    } catch (err) {
      console.error("Error sending voice message:", err);
      toast.error("Erro ao enviar áudio");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsMediaUploading(true);
    const fileList = Array.from(files) as File[];
    
    // Process all files in parallel
    const uploadPromises = fileList.map(async (file: File) => {
      const uploadId = uuidv4();
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");

      setActiveUploads(prev => ({
        ...prev,
        [uploadId]: { name: file.name, progress: 0 }
      }));

      try {
        const fileName = `media/${currentUser.uid}/${uuidv4()}_${file.name}`;
        const storageRef = ref(storage, fileName);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setActiveUploads(prev => ({
                ...prev,
                [uploadId]: { ...prev[uploadId], progress: Math.round(progress) }
              }));
            },
            (error) => {
              reject(error);
            },
            () => {
              resolve();
            }
          );
        });

        const downloadUrl = await getDownloadURL(storageRef);

        let messageType: "image" | "video" | "audio" | "file" = "file";
        if (isImage) messageType = "image";
        else if (isVideo) messageType = "video";
        else if (isAudio) messageType = "audio";

        const messageData = {
          senderId: currentUser.uid,
          content: downloadUrl,
          type: messageType,
          timestamp: serverTimestamp(),
          readBy: [currentUser.uid],
          fileName: file.name,
          fileSize: file.size
        };

        await addDoc(collection(db, "conversations", conversation.id, "messages"), messageData);
        
        let lastMsgContent = "📎 Arquivo";
        if (isImage) lastMsgContent = "📷 Imagem";
        else if (isVideo) lastMsgContent = "🎥 Vídeo";
        else if (isAudio) lastMsgContent = "🎵 Áudio";

        await updateDoc(doc(db, "conversations", conversation.id), {
          lastMessage: {
            content: lastMsgContent,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            readBy: [currentUser.uid]
          },
          updatedAt: serverTimestamp()
        });

        // Clean up active upload
        setActiveUploads(prev => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });

      } catch (err) {
        console.error("Error uploading file:", err);
        toast.error(`Falha no upload de ${file.name}`);
        // Clean up on error too
        setActiveUploads(prev => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });
      }
    });

    try {
      await Promise.all(uploadPromises);
      toast.success(fileList.length > 1 ? "Todos os arquivos foram enviados!" : "Arquivo enviado!");
    } catch (err) {
      console.error("Some uploads failed:", err);
    } finally {
      setIsMediaUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAiAssistant = async (query: string) => {
    setIsAiProcessing(true);
    try {
      const context = messages.slice(-5).map(m => `${m.senderId === currentUser.uid ? 'Eu' : 'Outro'}: ${m.content}`);
      const aiResponse = await getAiAssistantResponse(query, context);
      
      const aiMsgData = {
        senderId: "nexus-ai",
        content: aiResponse,
        type: "text",
        timestamp: serverTimestamp(),
        readBy: [currentUser.uid],
        isAiResponse: true
      };

      await addDoc(collection(db, "conversations", conversation.id, "messages"), aiMsgData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const isOnlyEmojis = (text: string) => {
    if (!text) return false;
    const emojiRegex = /^(\u2702|\u2705|\u2708|\u2709|\u270A-\u270D|\u270F|\u2712|\u2714|\u2716|\u271D|\u2721|\u2728|\u2733|\u2734|\u2744|\u2747|\u274C|\u274E|\u2753-\u2755|\u2757|\u2763|\u2764|\u2795-\u2797|\u27A1|\u27B0|\u27BF|\u2934|\u2935|\u2B05-\u2B07|\u2B1B|\u2B1C|\u2B50|\u2B55|\u3030|\u303D|\u3297|\u3299|\uD83C[\uDC04\uDCCF\uDD70\uDD71\uDD7E\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96-\uDF9B\uDF9E-\uDFF0\uDFF4\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95\uDD96\uDDA5\uDDA8\uDDB1\uDDB2\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDEE0-\uDEE5\uDEE9\uDEEB\uDEEC\uDEF0\uDEF3-\uDEF6]|\uD83E[\uDD10-\uDD1E\uDD20-\uDD27\uDD30\uDD33-\uDD3A\uDD3C-\uDD3E\uDD40-\uDD45\uDD47-\uDD4B\uDD50-\uDD5E\uDD60-\uDD6B\uDD80-\uDD91\uDDA0-\uDDA2\uDDB0-\uDDB9\uDDC0]|\s)+$/u;
    return emojiRegex.test(text.trim());
  };

  const getEmojiCount = (text: string) => {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text.trim())).length;
  };

  const handleEmojiClick = (emojiData: any) => {
    setInputText(prev => prev + emojiData.emoji);
  };

  const handleTranslate = async (msg: Message) => {
    setIsTranslating(true);
    try {
      const translation = await translateMessage(msg.content, targetLang);
      
      // We could store it in DB, but for now just update locally for UI or toast
      toast.success(`Tradução (${targetLang}): ${translation}`, {
        duration: 5000,
        position: "bottom-center"
      });
    } catch (err) {
      toast.error("Falha na tradução");
    } finally {
      setIsTranslating(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileName?: string) => {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-red-500" />;
    if (['doc', 'docx'].includes(ext || '')) return <FileText className="w-8 h-8 text-blue-500" />;
    if (['xls', 'xlsx'].includes(ext || '')) return <FileText className="w-8 h-8 text-green-500" />;
    if (['zip', 'rar', '7z'].includes(ext || '')) return <File className="w-8 h-8 text-yellow-500" />;
    return <File className="w-8 h-8 text-zinc-400" />;
  };

  return (
    <div className="flex-1 flex flex-col bg-[#050505]">
      <header className="h-20 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0 bg-[#050505] z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="md:hidden text-zinc-400" onClick={onBack}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="relative">
            <Avatar className="h-10 w-10 rounded-full bg-zinc-800 border-none">
              <AvatarImage src={conversation.photoURL || ""} className="object-cover" />
              <AvatarFallback className="bg-zinc-800 text-zinc-500 font-bold">{conversation.name?.[0]}</AvatarFallback>
            </Avatar>
            <div className={`w-3 h-3 rounded-full absolute bottom-0 right-0 border-2 border-[#050505] shadow-lg ${otherUserStatus.isOnline ? 'bg-green-500 shadow-green-900/20' : 'bg-red-500 shadow-red-900/20 animate-pulse-slow'}`}></div>
          </div>
          <div>
            <h3 className="font-bold text-zinc-100 leading-none">{conversation.name}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              {otherUserStatus.isOnline ? (
                <span className="text-[9px] text-green-500 font-bold uppercase tracking-widest flex items-center gap-1">
                  Online
                </span>
              ) : (
                <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-1">
                  Offline
                </span>
              )}
              <span className="text-zinc-500 text-[8px]">•</span>
              <p className="text-[8px] text-zinc-500 flex items-center gap-1 font-bold uppercase tracking-tight">
                <ShieldCheck className="w-2.5 h-2.5" />
                Secure
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
            onClick={onStartCall}
          >
            <Video className="w-5 h-5" />
          </Button>
          <Button 
            className="hidden sm:inline-flex px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
            onClick={onStartCall}
          >
            Share Screen
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 px-8 py-6">
        {/* Reaction Context Menu */}
        <AnimatePresence>
          {reactionMenu && (
            <>
              <div 
                className="fixed inset-0 z-50 bg-black/5" 
                onClick={() => setReactionMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setReactionMenu(null); }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                style={{ 
                  left: Math.min(reactionMenu.x, window.innerWidth - 220), 
                  top: Math.min(reactionMenu.y, window.innerHeight - 60),
                  position: 'fixed'
                }}
                className="z-[60] bg-zinc-900 border border-zinc-800 p-2 rounded-2xl shadow-2xl flex gap-1 backdrop-blur-xl"
              >
                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(reactionMenu.msgId, emoji)}
                    className="p-2 hover:bg-zinc-800 rounded-xl transition-all hover:scale-125 active:scale-95"
                  >
                    <span className="text-xl">{emoji}</span>
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
          <div className="flex justify-center mb-4">
            <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-500 px-3 py-1 rounded-full uppercase font-bold tracking-[0.2em]">
              Secured Connection : {format(new Date(), "PP")}
            </span>
          </div>
          
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isMine = msg.senderId === currentUser.uid;
              const isAi = msg.senderId === "nexus-ai";
              
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  layout
                  className={`flex ${isMine ? "justify-end" : "justify-start"} group`}
                >
                  <div 
                    onContextMenu={(e) => onMessageContextMenu(e, msg.id)}
                    onTouchStart={(e) => handleTouchStart(e, msg.id)}
                    onTouchEnd={handleTouchEnd}
                    className={`
                      max-w-[75%] p-4 rounded-2xl relative shadow-sm
                      ${isMine 
                        ? "bg-blue-600 text-white rounded-tr-none shadow-blue-900/10" 
                        : isAi 
                          ? "bg-zinc-900/80 text-zinc-100 border border-blue-500/20 rounded-tl-none backdrop-blur-md"
                          : "bg-zinc-900 text-zinc-100 rounded-tl-none border border-zinc-800/50"
                      }
                    `}
                  >
                    {isAi && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="bg-blue-500/20 p-1 rounded-lg">
                          <Bot className="w-4 h-4 text-blue-400" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Intelligence Agent</span>
                      </div>
                    )}
                    
                    <div className={`leading-relaxed antialiased ${msg.type === 'text' && isOnlyEmojis(msg.content) ? (getEmojiCount(msg.content) <= 3 ? "text-5xl py-2" : "text-2xl py-1") : "text-sm"}`}>
                      {msg.type === "audio" ? (
                        <AudioPlayer url={msg.content} isMine={isMine} />
                      ) : msg.type === "image" ? (
                        <div className="relative group/img overflow-hidden rounded-lg border border-white/10 bg-black/20">
                          <img 
                            src={msg.content} 
                            alt="Sent media" 
                            className="max-h-[300px] w-full object-cover transition-transform group-hover/img:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          <a 
                            href={msg.content} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                          >
                             <Monitor className="w-8 h-8 text-white opacity-60" />
                          </a>
                        </div>
                      ) : msg.type === "video" ? (
                        <video 
                          src={msg.content} 
                          controls 
                          className="max-h-[300px] rounded-lg border border-white/10 bg-black/20" 
                        />
                      ) : msg.type === "file" ? (
                        <div className={`flex items-center gap-4 p-3 rounded-xl border ${isMine ? 'bg-blue-700/30 border-blue-500/30' : 'bg-zinc-800/50 border-zinc-700'} min-w-[240px]`}>
                          <div className="shrink-0">
                            {getFileIcon(msg.fileName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate text-zinc-100">{msg.fileName || 'Arquivo sem nome'}</p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">{formatFileSize(msg.fileSize)}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            asChild
                            className="shrink-0 h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-full"
                          >
                            <a href={msg.content} target="_blank" rel="noopener noreferrer" download={msg.fileName}>
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-2 ${isMine ? "justify-end" : "justify-start"}`}>
                        {Object.entries(msg.reactions).map(([emoji, uids]) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(msg.id, emoji)}
                            className={`
                              flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors
                              ${(uids as string[]).includes(currentUser.uid) 
                                ? "bg-blue-500/20 border-blue-500/50 text-blue-100" 
                                : "bg-black/20 border-zinc-800 text-zinc-400 hover:border-zinc-600"
                              }
                            `}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px] font-bold">{(uids as string[]).length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {msg.translatedContent && (
                      <div className={`mt-3 pt-3 border-t text-[11px] font-medium italic ${isMine ? "border-white/20 text-white/70" : "border-zinc-800/50 text-blue-400"}`}>
                        <div className="flex items-center gap-1.5 mb-1 opacity-60">
                           <Languages className="w-3 h-3" />
                           <span className="text-[8px] uppercase font-bold tracking-tighter">Auto-Translated:</span>
                        </div>
                        {msg.translatedContent}
                      </div>
                    )}

                    <div className={`flex items-center gap-2 mt-3 justify-end ${isMine ? "text-blue-100/60" : "text-zinc-500"}`}>
                      <span className="text-[9px] font-mono font-medium">
                        {msg.timestamp ? format(msg.timestamp.toDate(), "HH:mm") : ""}
                      </span>
                      {isMine && (
                        <div className="flex items-center">
                          {!msg.timestamp ? (
                            <Clock className="w-3 h-3 text-blue-200/50 animate-pulse" />
                          ) : msg.readBy.length > 1 ? (
                            <CheckCheck className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-blue-200/40" />
                          )}
                        </div>
                      )}
                      {!isMine && !isAi && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleTranslate(msg)}
                          className="h-4 w-4 text-zinc-500 hover:text-blue-400 p-0 hover:bg-transparent"
                        >
                          <Languages className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <footer className="p-6 shrink-0">
        <div className="max-w-4xl mx-auto space-y-4">
          {showEmojiPicker && (
            <div className="absolute bottom-24 right-6 z-50 animate-in slide-in-from-bottom-4 duration-300">
               <EmojiPicker 
                 onEmojiClick={handleEmojiClick}
                 theme={theme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                 lazyLoadEmojis={true}
                 searchDisabled={false}
                 skinTonesDisabled={true}
                 previewConfig={{ showPreview: false }}
               />
            </div>
          )}

          {/* Individual Upload Progressies */}
          <div className="flex flex-col gap-2">
            {Object.entries(activeUploads).map(([id, info]) => (
              <motion.div 
                key={id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-900/80 border border-zinc-800 p-3 rounded-xl backdrop-blur-md flex items-center gap-4"
              >
                <div className="bg-blue-500/10 p-2 rounded-lg shrink-0">
                  <File className="w-4 h-4 text-blue-400 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-zinc-100 truncate pr-4">{(info as any).name}</span>
                    <span className="text-[10px] font-mono text-blue-400">{(info as any).progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(info as any).progress}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {isAiProcessing && (
             <div className="flex justify-start">
               <div className="bg-zinc-900/50 px-4 py-2 rounded-xl border border-blue-500/10 flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-[0.2em] animate-pulse">Nexus AI responding</span>
               </div>
             </div>
          )}
          
          <form onSubmit={handleSend} className="bg-zinc-900 rounded-2xl p-2 flex items-center gap-3 border border-zinc-800 shadow-xl focus-within:border-zinc-700 transition-all relative overflow-hidden">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileSelect}
                multiple
              />
            {isRecording ? (
              <div className="flex-1 flex items-center justify-between px-4 bg-zinc-900 z-20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-mono text-zinc-100">{formatDuration(recordingDuration)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={cancelRecording} variant="ghost" size="icon" className="text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-5 h-5" />
                  </Button>
                  <Button type="button" onClick={stopRecording} variant="ghost" size="icon" className="text-blue-400 hover:text-blue-300">
                     <CheckCheck className="w-6 h-6" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl"
                  disabled={isMediaUploading}
                >
                  <Plus className="w-6 h-6" />
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2 rounded-xl transition-colors ${showEmojiPicker ? 'text-blue-500 bg-blue-500/10' : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800'}`}
                >
                  <Smile className="w-6 h-6" />
                </Button>
                {audioUrl ? (
                  <div className="flex-1 flex items-center gap-3 px-2">
                    <AudioPlayer url={audioUrl} />
                    <Button type="button" onClick={() => cancelRecording()} variant="ghost" size="icon" className="h-8 w-8 text-zinc-500">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Input 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type a secure message..." 
                    className="flex-1 bg-transparent border-none focus-visible:ring-0 text-sm py-2 px-0 text-zinc-100 placeholder:text-zinc-600"
                    disabled={isAiProcessing}
                  />
                )}
                
                {!inputText.trim() && !audioUrl && (
                  <Button 
                    type="button" 
                    onClick={startRecording}
                    variant="ghost" 
                    size="icon" 
                    className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-background rounded-xl hidden sm:flex"
                  >
                    <Mic className="w-6 h-6" />
                  </Button>
                )}
                
                {(inputText.trim() || audioUrl) && (
                  <Button 
                      type="button"
                      onClick={audioUrl ? handleSendVoice : () => handleSend()}
                      disabled={isAiProcessing || isUploading} 
                      className="w-11 h-11 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-900/30 transition-transform active:scale-95"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                )}
              </>
            )}
          </form>
          
          <div className="flex justify-center gap-6 opacity-30">
             <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest font-bold text-zinc-400">
                <ShieldCheck className="w-2 h-2" /> Quantum Secure
             </div>
             <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-widest font-bold text-zinc-400">
                <Sparkles className="w-2 h-2" /> AI Active
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
