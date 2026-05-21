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
    const { prompt, type } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const genType = type || "image";
    let resultUrl = "";

    if (genType === "image") {
      const encoded = encodeURIComponent(prompt);
      resultUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
    } else if (genType === "video") {
      const hfKey = Deno.env.get("HUGGINGFACE_API_KEY");
      if (!hfKey) {
        return new Response(JSON.stringify({
          error: "Video generation needs a free Hugging Face token. Get one at https://huggingface.co/settings/tokens",
          type: "error"
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hfResponse = await fetch(
        "https://api-inference.huggingface.co/models/tencent/HunyuanVideo",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${hfKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt }),
        }
      );

      if (!hfResponse.ok) {
        const err = await hfResponse.text();
        return new Response(JSON.stringify({ error: `Video gen error: ${err}`, type: "error" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const blob = await hfResponse.blob();
      const buffer = await blob.arrayBuffer();
      const fileName = `generated/${user.id}/${Date.now()}.mp4`;
      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(fileName, new Uint8Array(buffer), { contentType: "video/mp4" });

      if (uploadError) {
        return new Response(JSON.stringify({ error: `Upload error: ${uploadError.message}`, type: "error" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: { publicUrl } } = supabase.storage.from("chat-images").getPublicUrl(fileName);
      resultUrl = publicUrl;
    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use 'image' or 'video'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: resultUrl, type: genType, prompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
