export type MessageType = "text" | "audio" | "video" | "image" | "system" | "file";

export interface UserProfile {
  userId: string;
  displayName: string;
  photoURL?: string;
  email: string;
  bio?: string;
  status?: string;
  lastSeen?: Date | string;
  isOnline: boolean;
  preferredLanguage?: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  type: MessageType;
  timestamp: any; // Firestore Timestamp
  translations?: Record<string, string>;
  readBy: string[];
  reactions?: Record<string, string[]>;
  fileName?: string;
  fileSize?: number;
}

export interface Conversation {
  id: string;
  type: "individual" | "group";
  lastMessage?: {
    content: string;
    senderId: string;
    timestamp: any;
    readBy?: string[];
  };
  name?: string;
  photoURL?: string;
  memberUids: string[];
  updatedAt: any;
  createdAt: any;
}

export interface Member {
  userId: string;
  role: "admin" | "member";
  joinedAt: any;
}
