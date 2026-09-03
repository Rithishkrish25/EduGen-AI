import "dotenv/config";

export type AiProviderMode = "gemini" | "ollama" | "auto";

interface EnvConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  databaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  cookieName: string;
  uploadDir: string;
  maxFileSizeMb: number;
  ollamaEmbedModel: string;
  ragTopK: number;
  ragMinSimilarity: number;
  aiProvider: AiProviderMode;
  geminiApiKey: string;
  geminiModel: string;
  geminiTimeoutMs: number;
}

function parseAiProviderMode(value: string | undefined): AiProviderMode {
  if (value === "gemini" || value === "ollama" || value === "auto") {
    return value;
  }
  return "auto";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env: EnvConfig = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  frontendUrl: requireEnv("FRONTEND_URL"),
  databaseUrl: requireEnv("DATABASE_URL"),
  ollamaBaseUrl: requireEnv("OLLAMA_BASE_URL"),
  ollamaModel: requireEnv("OLLAMA_MODEL"),
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  cookieName: process.env.COOKIE_NAME ?? "edugen_token",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB ?? 20),
  ollamaEmbedModel: requireEnv("OLLAMA_EMBED_MODEL"),
  ragTopK: Number(process.env.RAG_TOP_K ?? 5),
  ragMinSimilarity: Number(process.env.RAG_MIN_SIMILARITY ?? 0.25),
  aiProvider: parseAiProviderMode(process.env.AI_PROVIDER),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 30000),
};
