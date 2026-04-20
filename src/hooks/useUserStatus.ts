import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";

export interface UserStatus {
  isOnline: boolean;
  lastSeen?: any;
}

export function useUserStatus(userId: string | undefined) {
  const [status, setStatus] = useState<UserStatus>({ isOnline: false });

  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setStatus({
          isOnline: data.isOnline || false,
          lastSeen: data.lastSeen
        });
      }
    });

    return () => unsubscribe();
  }, [userId]);

  return status;
}

export function useUsersStatus(userIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});

  useEffect(() => {
    if (!userIds || userIds.length === 0) return;

    const unsubscribes = userIds.map(uid => {
      const userRef = doc(db, "users", uid);
      return onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setStatuses(prev => ({
            ...prev,
            [uid]: {
              isOnline: data.isOnline || false,
              lastSeen: data.lastSeen
            }
          }));
        }
      });
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [JSON.stringify(userIds)]);

  return statuses;
}
