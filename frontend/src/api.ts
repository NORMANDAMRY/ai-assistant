const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function* streamChat(messages: Message[]): AsyncGenerator<string> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`Error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield data.response;
          }
        } catch {}
      }
    }
  }
}

export async function readFiles(paths: string[]) {
  const response = await fetch(`${API_URL}/files/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  });
  return response.json();
}

export async function indexFiles(paths: string[]) {
  const response = await fetch(`${API_URL}/rag/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths })
  });
  return response.json();
}

export async function searchCode(query: string, n: number = 3) {
  const response = await fetch(`${API_URL}/rag/search?q=${encodeURIComponent(query)}&n=${n}`);
  return response.json();
}