import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import { VideoCall } from "./VideoCall";
import { IncomingCallAlert } from "./IncomingCallAlert";
import { Conversation } from "@/src/types";
import { collection, addDoc, serverTimestamp, setDoc, doc, query, where, onSnapshot, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquarePlus, User as UserIcon, Settings, Plus, ShieldCheck, Zap } from "lucide-react";

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeCall, setActiveCall] = useState<{ conversation: Conversation; isInitiator: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; callerId: string; conversation: Conversation } | null>(null);

  useEffect(() => {
    if (!user) return;

    // Update user status to online
    const userRef = doc(db, "users", user.uid);
    updateDoc(userRef, {
      isOnline: true,
      lastSeen: serverTimestamp()
    }).catch(err => {
      // If document doesn't exist, we might need to set it, 
      // but usually the auth flow creates the profile. 
      // Let's use setDoc with merge if it's potentially missing.
      setDoc(userRef, {
        isOnline: true,
        lastSeen: serverTimestamp(),
        displayName: user.displayName || "Usuário Nexus",
        photoURL: user.photoURL || "",
        email: user.email || ""
      }, { merge: true });
    });

    const handleDisconnect = () => {
      updateDoc(userRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
    };

    window.addEventListener("beforeunload", handleDisconnect);

    return () => {
      window.removeEventListener("beforeunload", handleDisconnect);
      handleDisconnect();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Listen for calls where user is a participant
    const q = query(
      collection(db, "calls"),
      where("memberUids", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const callData = change.doc.data();
          if (callData.initiatorId !== user.uid && !activeCall && !incomingCall) {
            // Find the conversation
            const convDoc = await getDoc(doc(db, "conversations", callData.conversationId));
            if (convDoc.exists()) {
              setIncomingCall({
                callId: change.doc.id,
                callerId: callData.initiatorId,
                conversation: { id: convDoc.id, ...convDoc.data() } as Conversation
              });
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user, activeCall, incomingCall]);

  const handleStartCall = (conv: Conversation) => {
    setActiveCall({ conversation: conv, isInitiator: true });
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      setActiveCall({ conversation: incomingCall.conversation, isInitiator: false });
      setIncomingCall(null);
    }
  };

  const handleDeclineCall = () => {
    setIncomingCall(null);
  };

  const seedSampleChat = async () => {
    setIsSeeding(true);
    try {
      const convRef = await addDoc(collection(db, "conversations"), {
        type: "individual",
        name: "Nexus Support (AI)",
        photoURL: "https://api.dicebear.com/7.x/bottts/svg?seed=Nexus",
        memberUids: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: {
          content: "Bem-vindo ao Nexus! Digite 'nexus' para conversar comigo.",
          senderId: "nexus-ai",
          timestamp: serverTimestamp()
        }
      });
      await setDoc(doc(db, "conversations", convRef.id, "members", user.uid), {
        userId: user.uid,
        role: "admin",
        joinedAt: serverTimestamp()
      });
      await addDoc(collection(db, "conversations", convRef.id, "messages"), {
        senderId: "nexus-ai",
        content: "Olá! Eu sou o Nexus AI. Estou aqui para demonstrar o poder da comunicação inteligente. Como posso te ajudar hoje?",
        type: "text",
        timestamp: serverTimestamp(),
        readBy: []
      });
      toast.success("Conversa de boas-vindas criada!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao criar conversa de exemplo.");
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0A0A0B] text-zinc-100 font-sans overflow-hidden border-zinc-800">
      
      {/* 1. Left Mini Rail */}
      <nav className="hidden md:flex w-16 border-r border-zinc-800 flex-col items-center py-6 gap-8 bg-[#050505] shrink-0">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex flex-col gap-6 text-zinc-500">
          <div className="p-2 bg-zinc-800/50 rounded-lg text-blue-400 cursor-pointer">
            <MessageSquarePlus className="w-6 h-6" />
          </div>
          <div className="p-2 hover:bg-zinc-800/50 transition-colors cursor-pointer rounded-lg">
            <UserIcon className="w-6 h-6" />
          </div>
          <div className="p-2 hover:bg-zinc-800/50 transition-colors cursor-pointer rounded-lg">
            <Settings className="w-6 h-6" />
          </div>
        </div>
        <div className="mt-auto flex flex-col gap-6">
          <div className="relative">
            <div className="w-3 h-3 bg-green-500 rounded-full absolute -top-1 -right-1 border-2 border-[#050505]"></div>
            <img src={user.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"} className="w-10 h-10 rounded-xl bg-zinc-800" alt="Profile" />
          </div>
        </div>
      </nav>

      {/* 2. Sidebar (Contact List) */}
      <div className={`
        ${isMobileMenuOpen ? 'flex' : 'hidden'} 
        md:flex w-full md:w-72 border-r border-zinc-800 flex-col bg-[#0A0A0B] shrink-0 transition-all duration-300
      `}>
        <Sidebar 
          user={user} 
          activeId={activeConversation?.id} 
          onSelect={(conv) => {
            setActiveConversation(conv);
            setIsMobileMenuOpen(false);
          }} 
        />
      </div>

      {/* 3. Main Chat Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#050505]">
        {activeConversation ? (
          <ChatWindow 
            conversation={activeConversation} 
            currentUser={user} 
            onBack={() => {
              setActiveConversation(null);
              setIsMobileMenuOpen(true);
            }}
            onStartCall={() => handleStartCall(activeConversation)}
          />
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8 text-center text-zinc-500">
             <div className="w-20 h-20 bg-blue-600/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
                <Sparkles className="w-10 h-10 text-blue-500" />
             </div>
             <h2 className="text-3xl font-bold text-zinc-100 tracking-tight">Nexus Messenger</h2>
             <p className="max-w-sm mt-3 text-sm leading-relaxed text-zinc-400">
               Sua nova experiência de comunicação. Seguro, rápido e impulsionado por inteligência artificial de ponta.
             </p>
             
             <Button 
               onClick={seedSampleChat} 
               disabled={isSeeding}
               className="mt-8 bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl shadow-lg shadow-blue-900/20"
             >
               <Plus className="w-4 h-4" />
               {isSeeding ? "Iniciando..." : "Nova Conversa"}
             </Button>
          </div>
        )}
      </div>

      {/* 4. Intelligence Side Rail (Visible on LG screens when chat is active) */}
      {activeConversation && (
        <div className="hidden lg:flex w-72 border-l border-zinc-800 bg-[#0A0A0B] p-6 flex-col space-y-8 shrink-0 overflow-y-auto">
          <div>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Security Shield</h4>
            <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-100 italic">E2E Active</p>
                  <p className="text-[10px] text-zinc-500">Session is verified</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Anti-Screenshot</span>
                <span className="text-green-500 font-bold uppercase">Active</span>
              </div>
            </div>
          </div>

          <div>
             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">Continuity Hub</h4>
             <div className="space-y-3">
               <div className="flex items-center justify-between p-3 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
                 <div className="flex items-center gap-3 text-zinc-300">
                   <Zap className="w-4 h-4 text-blue-500" />
                   <span className="text-xs">Nexus Desktop</span>
                 </div>
                 <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
               </div>
               <div className="p-3 bg-blue-600/10 border border-blue-600/20 rounded-xl">
                  <p className="text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Independent sync</p>
                  <p className="text-[11px] text-zinc-400 leading-tight">Syncing across devices without phone dependency.</p>
               </div>
             </div>
          </div>

          <div className="mt-auto">
             <div className="p-4 bg-gradient-to-br from-blue-700 to-indigo-900 rounded-2xl relative overflow-hidden group cursor-pointer">
                <div className="relative z-10">
                   <p className="text-xs font-bold text-white mb-1">Upgrade To Premium</p>
                   <p className="text-[10px] text-white/70 leading-tight">Unlock AI filters, custom avatars and more.</p>
                </div>
                <div className="absolute -bottom-2 -right-2 opacity-20 transform group-hover:scale-110 transition-transform">
                   <Sparkles className="w-16 h-16 text-white" />
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Call UI */}
      <AnimatePresence>
        {incomingCall && (
          <IncomingCallAlert 
            callerName={incomingCall.conversation.name || "Desconhecido"}
            callerPhoto={incomingCall.conversation.photoURL}
            onAccept={handleAcceptCall}
            onDecline={handleDeclineCall}
          />
        )}
        {activeCall && (
          <VideoCall 
            conversationId={activeCall.conversation.id}
            conversation={activeCall.conversation}
            currentUser={user}
            onClose={() => setActiveCall(null)}
            isInitiator={activeCall.isInitiator}
          />
        )}
      </AnimatePresence>

      {/* Mobile background toggle overlay */}
      {!activeConversation && (
        <div className="md:hidden flex-1 flex flex-col items-center justify-center p-4 gap-6 relative">
           <div className="absolute inset-0 bg-blue-600 opacity-[0.03] pointer-events-none" />
           <h2 className="text-4xl font-bold tracking-tighter text-zinc-100">Nexus</h2>
           <Button onClick={() => setIsMobileMenuOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-10 py-6 text-lg font-bold shadow-2xl shadow-blue-600/20">
             Abrir Conversas
           </Button>
           <Button onClick={seedSampleChat} variant="ghost" className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">
             Iniciado: Nexus Support
           </Button>
        </div>
      )}
    </div>
  );
}
