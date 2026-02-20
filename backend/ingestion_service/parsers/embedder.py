"""
Vertex AI Embedder — generates semantic embeddings for code nodes.
Uses textembedding-gecko@003 for high-quality code+text embeddings.
"""

import asyncio
import os
from typing import List, Optional
from loguru import logger

import vertexai
from vertexai.language_models import TextEmbeddingModel

from .ast_parser import CodeNode


class VertexEmbedder:
    def __init__(self):
        project = os.getenv("GCP_PROJECT_ID", "gemini-live-api-hackathon")
        location = os.getenv("GCP_LOCATION", "us-central1")
        vertexai.init(project=project, location=location)
        self.model = TextEmbeddingModel.from_pretrained("textembedding-gecko@003")
        logger.info("VertexEmbedder initialized with textembedding-gecko@003")

    async def embed_nodes(self, nodes: List[CodeNode], batch_size: int = 25) -> List[CodeNode]:
        """Generate embeddings for all code nodes in batches."""
        total = len(nodes)
        logger.info(f"Generating embeddings for {total} nodes…")

        for i in range(0, total, batch_size):
            batch = nodes[i : i + batch_size]
            texts = [self._node_to_text(n) for n in batch]

            try:
                embeddings = await asyncio.get_event_loop().run_in_executor(
                    None, self._embed_batch, texts
                )
                for node, emb in zip(batch, embeddings):
                    node.embedding = emb
            except Exception as e:
                logger.error(f"Embedding batch {i//batch_size} error: {e}")
                # Set None embeddings for failed batch
                for node in batch:
                    node.embedding = None

            logger.debug(f"Embedded {min(i + batch_size, total)}/{total} nodes")

        return nodes

    def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Synchronous wrapper for Vertex AI embedding API."""
        response = self.model.get_embeddings(texts)
        return [r.values for r in response]

    def _node_to_text(self, node: CodeNode) -> str:
        """Create a text representation of a node for embedding."""
        parts = []
        if node.node_type:
            parts.append(f"Type: {node.node_type}")
        if node.language:
            parts.append(f"Language: {node.language}")
        if node.name:
            parts.append(f"Name: {node.name}")
        if node.path:
            parts.append(f"Path: {node.path}")
        if node.doc_summary:
            parts.append(f"Summary: {node.doc_summary}")
        if node.content:
            # Include first 500 chars of content for semantic richness
            parts.append(f"Code:\n{node.content[:500]}")
        return "\n".join(parts)
