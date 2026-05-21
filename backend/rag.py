import chromadb
from sentence_transformers import SentenceTransformer
import os
from typing import List

class CodeRAG:
    def __init__(self):
        self.client = chromadb.PersistentClient(path="./chroma_db")
        self.collection = self.client.get_or_create_collection("code_context")
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')

    def index_files(self, paths: List[str]):
        documents = []
        ids = []
        metadatas = []

        for path in paths:
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    documents.append(content)
                    ids.append(path)
                    metadatas.append({"path": path})
            except Exception as e:
                print(f"Error reading {path}: {e}")

        if documents:
            embeddings = self.embedder.encode(documents).tolist()
            self.collection.add(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas
            )
        return len(documents)

    def search(self, query: str, n_results: int = 3):
        query_embedding = self.embedder.encode([query]).tolist()
        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=n_results
        )
        return results

rag = CodeRAG()

def index_codebase(paths: List[str]):
    return rag.index_files(paths)

def search_code(query: str, n_results: int = 3):
    return rag.search(query, n_results)