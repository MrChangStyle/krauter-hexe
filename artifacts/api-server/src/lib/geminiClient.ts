import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY must be set. Did you forget to provide your Gemini API key?",
  );
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
