import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Video } from "lucide-react";
import { motion } from "motion/react";

interface IncomingCallAlertProps {
  callerName: string;
  callerPhoto?: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallAlert({ callerName, callerPhoto, onAccept, onDecline }: IncomingCallAlertProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      className="fixed top-8 left-1/2 -translate-x-1/2 z-[110] w-[350px] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-4 backdrop-blur-xl"
    >
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <Avatar className="h-12 w-12 rounded-xl bg-zinc-800">
            <AvatarImage src={callerPhoto} className="object-cover" />
            <AvatarFallback>{callerName[0]}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 bg-green-500 w-3 h-3 rounded-full border-2 border-zinc-900" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-zinc-100 truncate">{callerName}</h4>
          <p className="text-[10px] text-blue-400 uppercase tracking-widest font-black animate-pulse">Incoming Video Call</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button 
          onClick={onDecline} 
          variant="destructive" 
          className="flex-1 rounded-xl h-12 gap-2"
        >
          <PhoneOff className="w-4 h-4" />
          Decline
        </Button>
        <Button 
          onClick={onAccept} 
          className="flex-1 rounded-xl h-12 bg-green-600 hover:bg-green-700 text-white gap-2"
        >
          <Video className="w-4 h-4" />
          Accept
        </Button>
      </div>
    </motion.div>
  );
}
