import { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { collection, query, where, onSnapshot, orderBy, collectionGroup } from "firebase/firestore";
import { db, logOut } from "@/src/lib/firebase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LogOut, Settings, MessageSquarePlus, Search, User as UserIcon, Moon, Sun, MoreHorizontal, Bot } from "lucide-react";
import { useTheme } from "next-themes";
import { Conversation } from "@/src/types";
import { format } from "date-fns";
import { useUsersStatus } from "@/src/hooks/useUserStatus";

interface SidebarProps {
  user: User;
  onSelect: (conv: Conversation) => void;
  activeId?: string;
}

export default function Sidebar({ user, onSelect, activeId }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const { theme, setTheme } = useTheme();

  const otherParticipantUids = conversations.map(c => 
    c.memberUids.find(uid => uid !== user.uid)
  ).filter(Boolean) as string[];

  const userStatuses = useUsersStatus(otherParticipantUids);

  useEffect(() => {
    const q = query(
      collection(db, "conversations"),
      where("memberUids", "array-contains", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const convs = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Conversation[];
      setConversations(convs);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const filteredConvs = conversations.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.lastMessage?.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#0A0A0B]">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">Messages</h2>
          <Button variant="ghost" size="icon" className="md:hidden text-zinc-400" onClick={() => logOut()}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input 
            placeholder="Search secure vault..." 
            className="w-full bg-zinc-900 border-none rounded-xl py-2 px-9 text-sm focus-visible:ring-1 focus-visible:ring-blue-500 placeholder-zinc-500 text-zinc-100"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="px-3 space-y-1">
          {/* AI Assistant Special Card Pattern from Design */}
          <div className="mb-4">
            <div className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl cursor-default group hover:bg-zinc-800/80 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex-shrink-0 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                <Bot className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-zinc-100 truncate">AI Assistant</span>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Live</span>
                </div>
                <p className="text-xs text-blue-400 truncate">Nexus AI is ready to summarize tasks.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-1 py-4">
            {filteredConvs.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={`
                  w-full flex items-center gap-3 p-1 transition-all duration-200 group text-left
                  ${activeId === conv.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'}
                `}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-12 w-12 rounded-xl bg-zinc-800 border border-zinc-700/50">
                    <AvatarImage src={conv.photoURL || ""} className="object-cover" />
                    <AvatarFallback className="bg-zinc-800 text-zinc-500 text-xs font-bold">
                      {conv.name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {/* Status dot from design */}
                  {(() => {
                    const otherUid = conv.memberUids.find(uid => uid !== user.uid);
                    const status = otherUid ? userStatuses[otherUid] : null;
                    const isOnline = status?.isOnline || false;
                    return (
                      <div className={`w-2.5 h-2.5 rounded-full absolute -bottom-0.5 -right-0.5 border-2 border-[#0A0A0B] shadow-sm ${isOnline ? 'bg-green-500 shadow-green-900/10' : 'bg-red-500 opacity-80'}`} />
                    );
                  })()}
                  
                  {/* Unread Indicator */}
                  {conv.lastMessage && conv.lastMessage.senderId !== user.uid && !conv.lastMessage.readBy?.includes(user.uid) && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center border-2 border-[#0A0A0B] z-10 animate-in zoom-in duration-300">
                      <div className="w-2 h-2 bg-white rounded-full transition-all" />
                    </div>
                  )}
                </div>
                <div className="flex-1 border-b border-zinc-800/50 pb-4 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className={`font-medium text-sm truncate ${activeId === conv.id ? 'text-blue-400' : 'text-zinc-100'}`}>
                      {conv.name || "Sem Nome"}
                    </span>
                    {conv.updatedAt && (
                      <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                        {format(conv.updatedAt.toDate(), "HH:mm")}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${activeId === conv.id ? 'text-zinc-300' : 'text-zinc-400 italic'} ${conv.lastMessage && conv.lastMessage.senderId !== user.uid && !conv.lastMessage.readBy?.includes(user.uid) ? 'font-bold text-zinc-100 not-italic' : ''}`}>
                    {conv.lastMessage?.content || "No secure messages yet"}
                  </p>
                </div>
              </button>
            ))}
          </div>
          
          {filteredConvs.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              <p className="text-sm">No vaults found.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
