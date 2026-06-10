import { streamText } from "ai";
import { getModel } from "@/lib/ai-model";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a helpful AI assistant specialized in analyzing meeting transcripts and conversations. You help users find information, summarize discussions, identify action items, and answer questions based on the transcript content provided.

Guidelines:
- Always respond in the same language as the user's message
- Answer questions based on the transcript context provided
- If the answer is not in the transcripts, clearly state that
- When referencing specific parts of conversations, mention the speaker's name when available
- Be concise but thorough
- Format responses with markdown for readability
- When asked to summarize, focus on key points, decisions, and action items

Available transcript context:
`;

interface UIMessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: UIMessagePart[];
}

interface ChatRequest {
  messages: UIMessage[];
  context: string;
}

// Convert UI messages (with parts) to model messages (with content)
function convertMessages(messages: UIMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => {
      let content = "";

      // If message has parts array (UI message format)
      if (m.parts && Array.isArray(m.parts)) {
        content = m.parts
          .filter(part => part.type === "text" && part.text)
          .map(part => part.text!)
          .join("");
      }
      // If message has content string (model message format)
      else if (m.content) {
        content = m.content;
      }

      return {
        role: m.role as "user" | "assistant",
        content,
      };
    })
    .filter(m => m.content.length > 0);
}

export async function POST(request: Request) {
  try {
    // Check if AI is configured
    if (!process.env.AI_MODEL) {
      return new Response(JSON.stringify({ error: "AI is not configured on this instance" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: ChatRequest = await request.json();
    const { messages, context } = body;

    // Build the full system prompt with context
    const systemPrompt = context
      ? `${SYSTEM_PROMPT}\n\n${context}`
      : SYSTEM_PROMPT + "\n\nNo transcript context available. You can still help with general questions.";

    const model = getModel();

    // Convert UI messages to model messages
    const modelMessages = convertMessages(messages);

    if (modelMessages.length === 0) {
      return new Response(JSON.stringify({ error: "No valid messages to process" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      onError({ error }) {
        console.error("AI streaming error:", error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Agent API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
