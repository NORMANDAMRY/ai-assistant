import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: "Query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tavilyKey = Deno.env.get("TAVILY_API_KEY");
    if (!tavilyKey) {
      return new Response(JSON.stringify({
        error: "Web search is not configured. Set TAVILY_API_KEY secret.",
        results: []
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tavilyKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `Search failed: ${err}`, results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const results = (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));

    return new Response(JSON.stringify({ results, query }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, results: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
