import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    if (!groqApiKey) {
      return new Response(JSON.stringify({ error: "Groq API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemMessage = {
      role: "system",
      content: "You are KrakenAi, a helpful AI coding assistant. Provide clear, accurate, and concise responses. Use markdown for code blocks with proper syntax highlighting."
    };

    const groqMessages = [systemMessage, ...messages];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "llama-3.3-70b-versatile",
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      return new Response(JSON.stringify({ error: `Groq API error: ${errorText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groqData = await groqResponse.json();
    const assistantMessage = groqData.choices[0]?.message?.content || "";

    if (chat_id) {
      const userMessage = messages.filter((m: any) => m.role === "user").pop();
      if (userMessage) {
        await supabase.from("messages").insert({
          chat_id,
          role: "user",
          content: userMessage.content,
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
      model: model || "llama-3.1-70b-versatile"
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