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

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "GET" && action === "list") {
      const { data: chats, error } = await supabase
        .from("chats")
        .select("id, title, model, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return new Response(JSON.stringify({ chats }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET" && action === "messages") {
      const chatId = url.searchParams.get("chat_id");
      if (!chatId) {
        return new Response(JSON.stringify({ error: "chat_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: messages, error } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { title, model } = body;

      const { data: chat, error } = await supabase
        .from("chats")
        .insert({
          user_id: user.id,
          title: title || "New Chat",
          model: model || "llama-3.1-70b-versatile",
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ chat }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      const chatId = url.searchParams.get("chat_id");
      if (!chatId) {
        return new Response(JSON.stringify({ error: "chat_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("chats")
        .delete()
        .eq("id", chatId)
        .eq("user_id", user.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});