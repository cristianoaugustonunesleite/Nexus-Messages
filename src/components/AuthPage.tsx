import React, { useState } from "react";
import { signIn } from "@/src/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "motion/react";
import { Shield, Sparkles, Lock, Cpu } from "lucide-react";

export default function AuthPage() {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signIn();
    } catch (err: any) {
      if (err.code !== 'auth/cancelled-popup-request') {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#2563EB10_0%,_transparent_50%)]" />
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-lg z-10"
      >
        <Card className="bg-zinc-900 border-zinc-800 shadow-2xl overflow-hidden rounded-[2.5rem]">
          <div className="p-10 flex flex-col items-center">
            {/* Logo */}
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-blue-900/30">
               <Sparkles className="w-10 h-10 text-white" />
            </div>

            <h1 className="text-4xl font-bold text-zinc-100 tracking-tight mb-2">Nexus Messenger</h1>
            <p className="text-blue-400 text-sm font-bold uppercase tracking-[0.3em] mb-12">Next Evolution Bio-OS</p>

            <div className="w-full space-y-6">
               <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-4 p-4 bg-zinc-800/40 rounded-2xl border border-zinc-800/50 group hover:border-blue-500/30 transition-colors">
                     <div className="w-10 h-10 bg-blue-600/10 text-blue-500 rounded-xl flex items-center justify-center">
                        <Lock className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-sm font-bold text-zinc-100">Quantum Encryption</p>
                        <p className="text-xs text-zinc-500">End-to-End secure layer by default.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-zinc-800/40 rounded-2xl border border-zinc-800/50 group hover:border-blue-500/30 transition-colors">
                     <div className="w-10 h-10 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center">
                        <Cpu className="w-5 h-5" />
                     </div>
                     <div>
                        <p className="text-sm font-bold text-zinc-100">AI Intelligence Core</p>
                        <p className="text-xs text-zinc-500">Omni-translation and smart assistance.</p>
                     </div>
                  </div>
               </div>

               <Button 
                 onClick={handleSignIn} 
                 disabled={loading}
                 className="w-full h-14 bg-white hover:bg-zinc-100 text-black rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-70"
               >
                 {loading ? (
                   <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                 ) : (
                   <>
                     <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                     Continue with Google
                   </>
                 )}
               </Button>
               
               <p className="text-center text-xs text-zinc-600 mt-8">
                 0.4.2 ALPHA • Encrypted • Secure Vault
               </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
