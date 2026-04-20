import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function translateMessage(text: string, targetLang: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following message to ${targetLang}. Only return the translation, no extra text: "${text}"`,
      config: {
        temperature: 0.1,
      }
    });

    return response.text || text;
  } catch (error) {
    console.error("Translation error:", error);
    return text;
  }
}

export async function getAiAssistantResponse(message: string, context: string[]): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: message,
      config: {
        systemInstruction: `Você é o Nexus AI, um assistente inteligente integrado ao Nexus Messenger. 
        Seu objetivo é ajudar o usuário a organizar conversas, criar lembretes, sugerir respostas e tirar dúvidas de forma concisa e útil.
        Contexto recente da conversa: ${context.join("\n")}`,
        temperature: 0.7,
      }
    });

    return response.text || "Desculpe, não consegui processar sua solicitação no momento.";
  } catch (error) {
    console.error("AI Assistant error:", error);
    return "Houve um erro ao contatar o assistente.";
  }
}

export async function suggestReplies(messages: string[]): Promise<string[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest 3 brief and natural one-line replies to the following conversation context: \n${messages.join("\n")}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const suggestions = JSON.parse(response.text || "[]");
    return suggestions;
  } catch (error) {
    console.error("Reply suggestion error:", error);
    return [];
  }
}
