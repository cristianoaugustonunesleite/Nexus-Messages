import { useState, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/src/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Sync user profile
        const userDoc = doc(db, "users", user.uid);
        const snap = await getDoc(userDoc);
        
        if (!snap.exists()) {
          await setDoc(userDoc, {
            userId: user.uid,
            displayName: user.displayName || "Nexus User",
            email: user.email,
            photoURL: user.photoURL,
            isOnline: true,
            lastSeen: serverTimestamp(),
            preferredLanguage: "pt-BR"
          });
        } else {
          await setDoc(userDoc, {
            isOnline: true,
            lastSeen: serverTimestamp()
          }, { merge: true });
        }
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground font-mono animate-pulse">Initializing Nexus...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem {...({ children: (
      <TooltipProvider>
        <div className="h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-300">
          {user ? <Dashboard user={user} /> : <AuthPage />}
          <Toaster position="top-right" richColors />
        </div>
      </TooltipProvider>
    ) } as any)}>
    </ThemeProvider>
  );
}
