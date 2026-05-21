from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os

try:
    from rag import index_codebase, search_code
    RAG_AVAILABLE = True
except:
    RAG_AVAILABLE = False
    index_codebase = None
    search_code = None

app = FastAPI(title="AI Coding Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL_NAME = "qwen2.5-coder:14b"

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    stream: bool = True

class IndexRequest(BaseModel):
    paths: List[str]

class FileReadRequest(BaseModel):
    paths: List[str]

async def get_ollama_response(prompt: str, system_prompt: str = "You are a helpful coding assistant."):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "system": system_prompt,
                "stream": False
            },
            timeout=120.0
        )
        if response.status_code != 200:
            raise HTTPException(f"Ollama error: {response.text}")
        return response.json()["response"]

async def get_ollama_stream(prompt: str, system_prompt: str = "You are a helpful coding assistant."):
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "system": system_prompt,
                "stream": True
            },
            timeout=120.0
        ) as response:
            async for line in response.aiter_lines():
                if line:
                    try:
                        data = eval(line)
                        if "response" in data:
                            yield data["response"]
                    except:
                        pass

@app.get("/")
async def root():
    return {"status": "ok", "model": MODEL_NAME}

@app.get("/models")
async def list_models():
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        return response.json()

@app.post("/chat")
async def chat(request: ChatRequest):
    if request.stream:
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            get_ollama_stream(format_messages(request.messages)),
            media_type="text/event-stream"
        )
    else:
        response = await get_ollama_response(format_messages(request.messages))
        return {"response": response}

def format_messages(messages: List[ChatMessage]) -> str:
    formatted = []
    for msg in messages:
        role = msg.role.capitalize()
        formatted.append(f"{role}: {msg.content}")
    return "\n\n".join(formatted)

@app.post("/files/read")
async def read_files(request: FileReadRequest):
    contents = []
    for path in request.paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                contents.append({"path": path, "content": f.read()})
        except Exception as e:
            contents.append({"path": path, "error": str(e)})
    return {"files": contents}

@app.post("/rag/index")
async def rag_index(request: IndexRequest):
    if not RAG_AVAILABLE:
        raise HTTPException("RAG not available. Install chromadb and sentence-transformers.")
    count = index_codebase(request.paths)
    return {"indexed": count}

@app.get("/rag/search")
async def rag_search(q: str, n: int = 3):
    if not RAG_AVAILABLE:
        raise HTTPException("RAG not available.")
    results = search_code(q, n)
    return {"results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)