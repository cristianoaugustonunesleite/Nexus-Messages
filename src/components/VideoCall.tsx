import React, { useState, useEffect, useRef } from "react";
import { User } from "firebase/auth";
import { 
  collection, doc, addDoc, onSnapshot, updateDoc, deleteDoc, 
  setDoc, getDoc, serverTimestamp, query, where 
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Monitor, X, Maximize2, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

import { Message, Conversation } from "@/src/types";

interface VideoCallProps {
  conversationId: string;
  conversation: Conversation;
  currentUser: User;
  onClose: () => void;
  isInitiator: boolean;
}

const servers = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

export function VideoCall({ conversationId, conversation, currentUser, onClose, isInitiator }: VideoCallProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  const pc = useRef<RTCPeerConnection>(new RTCPeerConnection(servers));
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        } catch (mediaErr: any) {
          console.warn("Retrying with audio only due to:", mediaErr.message);
          // Fallback to audio if video is missing
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          setIsVideoOff(true);
          toast.info("Câmera não encontrada. Iniciando apenas com áudio.");
        }
        
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        stream.getTracks().forEach((track) => {
          pc.current.addTrack(track, stream);
        });

        pc.current.ontrack = (event) => {
          if (!remoteStream) {
            const newRemoteStream = new MediaStream();
            event.streams[0].getTracks().forEach((track) => {
              newRemoteStream.addTrack(track);
            });
            setRemoteStream(newRemoteStream);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = newRemoteStream;
          }
        };

        const callDoc = doc(db, "calls", conversationId);
        const offerCandidates = collection(callDoc, "offerCandidates");
        const answerCandidates = collection(callDoc, "answerCandidates");

        pc.current.onicecandidate = (event) => {
          if (event.candidate) {
            const pool = isInitiator ? offerCandidates : answerCandidates;
            addDoc(pool, event.candidate.toJSON());
          }
        };

        if (isInitiator) {
          const offerDescription = await pc.current.createOffer();
          await pc.current.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
            initiatorId: currentUser.uid,
            createdAt: serverTimestamp(),
            memberUids: conversation.memberUids, // Assuming we pass conversation object
            conversationId: conversationId
          };

          await setDoc(callDoc, offer);

          onSnapshot(callDoc, (snapshot) => {
            const data = snapshot.data();
            if (!pc.current.currentRemoteDescription && data?.answer) {
              const answerDescription = new RTCSessionDescription(data.answer);
              pc.current.setRemoteDescription(answerDescription);
            }
          });

          onSnapshot(answerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added") {
                const data = change.doc.data();
                pc.current.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });
        } else {
          const callData = (await getDoc(callDoc)).data();
          if (!callData) {
            toast.error("Chamada não encontrada");
            onClose();
            return;
          }

          const offerDescription = callData.offer;
          await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

          const answerDescription = await pc.current.createAnswer();
          await pc.current.setLocalDescription(answerDescription);

          const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
          };

          await updateDoc(callDoc, { answer });

          onSnapshot(offerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === "added") {
                const data = change.doc.data();
                pc.current.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });
        }

        // Handle remote hangup
        onSnapshot(callDoc, (snapshot) => {
          if (!snapshot.exists()) {
            handleHangup(false);
          }
        });

      } catch (err) {
        console.error("WebRTC Error:", err);
        toast.error("Erro ao iniciar chamada de vídeo");
        onClose();
      }
    };

    init();

    return () => {
      handleHangup(true);
    };
  }, []);

  const handleHangup = async (locallyInitiated: boolean) => {
    localStream?.getTracks().forEach((track) => track.stop());
    pc.current.close();
    
    if (locallyInitiated) {
      try {
        await deleteDoc(doc(db, "calls", conversationId));
      } catch (err) {
        // Doc might be already deleted
      }
      onClose();
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        const videoSender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }
        
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        
        screenTrack.onended = () => {
          stopScreenShare();
        };
        
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const stopScreenShare = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      const videoSender = pc.current.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        videoSender.replaceTrack(videoTrack);
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
      setIsScreenSharing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: 0,
        width: isMinimized ? 300 : "100%",
        height: isMinimized ? 200 : "100%",
        bottom: isMinimized ? 24 : 0,
        right: isMinimized ? 24 : 0,
        top: isMinimized ? 'auto' : 0,
        left: isMinimized ? 'auto' : 0,
      }}
      className={`fixed z-[100] bg-[#050505] overflow-hidden ${isMinimized ? 'rounded-2xl shadow-2xl border border-zinc-800' : ''}`}
    >
      <div className="relative w-full h-full">
        {/* Remote Video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-zinc-900"
        />

        {/* Local Video - Floating */}
        <div className={`absolute ${isMinimized ? 'top-2 right-2 w-24 h-16' : 'top-8 right-8 w-48 h-32 md:w-64 md:h-44'} bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700 shadow-xl z-20`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
               <VideoOff className="w-8 h-8 text-zinc-600" />
            </div>
          )}
        </div>

        {/* Controls Overlay */}
        <div className={`absolute bottom-0 left-0 right-0 p-8 flex flex-col items-center gap-6 bg-gradient-to-t from-black/80 to-transparent transition-opacity ${isMinimized ? 'opacity-0' : 'opacity-100 uppercase font-black text-white'}`}>
          {!isMinimized && (
            <div className="flex items-center gap-4">
              <Button 
                onClick={toggleMute} 
                variant={isMuted ? "destructive" : "secondary"}
                size="icon"
                className="w-14 h-14 rounded-full"
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </Button>
              
              <Button 
                onClick={toggleVideo} 
                variant={isVideoOff ? "destructive" : "secondary"}
                size="icon"
                className="w-14 h-14 rounded-full"
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </Button>

              <Button 
                onClick={toggleScreenShare} 
                variant={isScreenSharing ? "default" : "secondary"}
                size="icon"
                className={`w-14 h-14 rounded-full ${isScreenSharing ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              >
                <Monitor className="w-6 h-6" />
              </Button>

              <Button 
                onClick={() => handleHangup(true)} 
                variant="destructive"
                size="icon"
                className="w-16 h-16 rounded-full"
              >
                <PhoneOff className="w-8 h-8" />
              </Button>
            </div>
          )}
        </div>

        {/* Top Header Actions */}
        <div className="absolute top-8 left-8 flex items-center gap-3 z-30">
           <div className="bg-red-500 w-3 h-3 rounded-full animate-pulse" />
           <span className="text-white text-xs font-bold tracking-widest uppercase">Nexus Encrypted Call</span>
        </div>

        <div className="absolute top-8 right-8 flex items-center gap-4 z-30">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-white/60 hover:text-white"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 /> : <Minimize2 />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
