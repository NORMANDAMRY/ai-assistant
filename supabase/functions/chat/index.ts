import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchImageAsBase64(url: string): Promise<{ mime: string; data: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const mime = blob.type || "image/png";
    const buf = await blob.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { mime, data: b64 };
  } catch {
    return null;
  }
}

function buildGeminiContent(messages: any[]) {
  const contents: any[] = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    const parts: any[] = [];
    if (typeof msg.content === "string") {
      if (msg.content) parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url") {
          parts.push({ inlineData: { mimeType: "image/png", data: part.image_url.url } });
        }
      }
    }
    if (parts.length > 0) {
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
    }
  }
  return contents;
}

async function callOpenAICompatible(
  baseUrl: string,
  model: string,
  messages: any[],
  apiKey: string,
  label: string
) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${label} API error: ${errorText}`);
  }
  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

async function callGroq(model: string, messages: any[], apiKey: string) {
  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
    }),
  });
  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    throw new Error(`Groq API error: ${errorText}`);
  }
  const data = await groqResponse.json();
  return data.choices[0]?.message?.content || "";
}

async function callGemini(model: string, messages: any[], apiKey: string) {
  const systemMsg = messages.find((m: any) => m.role === "system");
  const geminiMessages = messages.filter((m: any) => m.role !== "system");

  const body: any = {
    contents: buildGeminiContent(geminiMessages),
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const parts = geminiMessages.length > 0
    ? geminiMessages[geminiMessages.length - 1].content
    : [];

  if (Array.isArray(parts)) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.type === "image_url" && part.image_url.url.startsWith("http")) {
        const img = await fetchImageAsBase64(part.image_url.url);
        if (img) {
          const contentArr = body.contents;
          const lastContent = contentArr[contentArr.length - 1];
          const idx = lastContent.parts.findIndex(
            (p: any) => p.inlineData?.data === part.image_url.url
          );
          if (idx !== -1) {
            lastContent.parts[idx] = { inlineData: { mimeType: img.mime, data: img.data } };
          }
        }
      }
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

const NEEDS_SEARCH_PATTERNS = [
  "latest", "news", "current", "today", "recent", "updated", "breaking",
  "what happened", "what's new", "announced", "released", "launched",
  "weather", "stock", "price", "election", "score", "results",
  "who won", "who is", "how to", "tutorial", "guide",
];

function getLastUserMessage(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return typeof messages[i].content === "string"
        ? messages[i].content
        : messages[i].content.find((p: any) => p.type === "text")?.text || "";
    }
  }
  return "";
}

function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase();
  return NEEDS_SEARCH_PATTERNS.some(p => lower.includes(p));
}

function formatSearchResults(results: any[]): string {
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`
  ).join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, chat_id, model } = await req.json();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const opencodeApiKey = Deno.env.get("OPENCODE_API_KEY");
    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    const usedModel = model || "llama-3.3-70b-versatile";

    const lastUserMsg = getLastUserMessage(messages);
    const today = new Date().toISOString().split("T")[0];

    let systemContent = `You are KrakenAi, a deliberate AI coding assistant that follows a structured workflow. You are NOT omniscient — always ask clarifying questions before assuming intent.

Workflow:
1. **Plan** — When given a task, first analyze what's needed. If requirements are ambiguous, list your assumptions and ask the user to confirm before proceeding.
2. **Build** — Only implement after the plan is confirmed. Show the key files/steps before writing code.
3. **Verify** — After building, suggest how to test or verify the result.

Guidelines:
- Acknowledge uncertainty. Say "I'm not sure" instead of guessing.
- If a task is large, break it into steps and confirm each step with the user.
- Ask for context before making assumptions about the codebase or environment.
- Be concise but thorough. Prioritize correctness over speed.
- Use markdown for code blocks with proper syntax highlighting.
- You can analyze images when provided.

Today's date: ${today}`;

    if (needsWebSearch(lastUserMsg) && Deno.env.get("TAVILY_API_KEY")) {
      try {
        const searchRes = await fetch(
          `${supabaseUrl}/functions/v1/search`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: lastUserMsg }),
          }
        );
        const searchData = await searchRes.json();
        if (searchData.results?.length > 0) {
          systemContent += `\n\n--- Current web search results ---\n${formatSearchResults(searchData.results)}\n---`;
        }
      } catch {
        // Search failed, proceed without it
      }
    }

    const systemMessage = { role: "system", content: systemContent };
    const groqMessages = [systemMessage, ...messages];
    const isGemini = usedModel.startsWith("gemini");
    const isOpencode = usedModel.startsWith("opencode/");
    const isMinimax = usedModel.startsWith("minimax/");

    let assistantMessage: string;

    if (isGemini) {
      if (!geminiApiKey) {
        return new Response(JSON.stringify({ error: "Gemini API key not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      assistantMessage = await callGemini(usedModel, groqMessages, geminiApiKey);
    } else if (isOpencode) {
      if (!opencodeApiKey) {
        return new Response(JSON.stringify({ error: "OpenCode API key not configured. Get one at https://opencode.ai/auth" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      assistantMessage = await callOpenAICompatible(
        "https://opencode.ai/zen/v1",
        "big-pickle",
        groqMessages,
        opencodeApiKey,
        "OpenCode Zen"
      );
    } else if (isMinimax) {
      if (!openrouterApiKey) {
        return new Response(JSON.stringify({ error: "OpenRouter API key not configured. Get one at https://openrouter.ai/keys" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const orModel = usedModel === "minimax/m2.5-free"
        ? "minimax/minimax-m2.5-free"
        : usedModel;
      assistantMessage = await callOpenAICompatible(
        "https://openrouter.ai/api/v1",
        orModel,
        groqMessages,
        openrouterApiKey,
        "OpenRouter"
      );
    } else {
      if (!groqApiKey) {
        return new Response(JSON.stringify({ error: "Groq API key not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      assistantMessage = await callGroq(usedModel, groqMessages, groqApiKey);
    }

    if (chat_id) {
      const userMessage = messages.filter((m: any) => m.role === "user").pop();
      if (userMessage) {
        await supabase.from("messages").insert({
          chat_id,
          role: "user",
          content: typeof userMessage.content === "string"
            ? userMessage.content
            : JSON.stringify(userMessage.content),
        });
      }

      await supabase.from("messages").insert({
        chat_id,
        role: "assistant",
        content: assistantMessage,
      });

      await supabase.from("chats").update({
        updated_at: new Date().toISOString(),
      }).eq("id", chat_id);
    }

    return new Response(JSON.stringify({
      message: assistantMessage,
      model: usedModel,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
