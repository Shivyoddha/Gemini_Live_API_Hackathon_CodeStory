"""
Spanner Graph Hydrator — writes parsed code nodes and edges into Spanner Graph.
Uses the CodeStory property graph schema.
"""

import asyncio
import os
from typing import List, Dict, Any
from loguru import logger
from google.cloud import spanner
from google.cloud.spanner_v1 import param_types

from .ast_parser import CodeNode


class SpannerHydrator:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.project_id = os.getenv("GCP_PROJECT_ID", "gemini-live-api-hackathon")
        self.instance_id = os.getenv("SPANNER_INSTANCE_ID", "cloud-codestory")
        self.database_id = os.getenv("SPANNER_DATABASE_ID", "cymbal")

        client = spanner.Client(project=self.project_id)
        instance = client.instance(self.instance_id)
        self.database = instance.database(self.database_id)
        logger.info(f"SpannerHydrator connected to {self.instance_id}/{self.database_id}")

    async def hydrate(self, nodes: List[CodeNode]) -> None:
        """Write all code nodes as graph vertices."""
        loop = asyncio.get_event_loop()
        source_files = [n for n in nodes if n.node_type == "SourceFile"]
        class_objects = [n for n in nodes if n.node_type == "ClassObject"]
        method_objects = [n for n in nodes if n.node_type == "MethodObject"]

        if source_files:
            await loop.run_in_executor(None, self._upsert_source_files, source_files)
        if class_objects:
            await loop.run_in_executor(None, self._upsert_class_objects, class_objects)
        if method_objects:
            await loop.run_in_executor(None, self._upsert_method_objects, method_objects)

        logger.info(f"Hydrated {len(nodes)} nodes into Spanner Graph for session {self.session_id}")

    def _upsert_source_files(self, nodes: List[CodeNode]) -> None:
        with self.database.batch() as batch:
            for node in nodes:
                batch.insert_or_update(
                    table="SourceFile",
                    columns=["id", "session_id", "name", "path", "language", "doc_summary", "embedding"],
                    values=[[
                        node.id,
                        self.session_id,
                        node.name,
                        node.path,
                        node.language,
                        node.doc_summary,
                        node.embedding,
                    ]],
                )

    def _upsert_class_objects(self, nodes: List[CodeNode]) -> None:
        with self.database.batch() as batch:
            for node in nodes:
                batch.insert_or_update(
                    table="ClassObject",
                    columns=["id", "session_id", "name", "path", "language", "content", "parent_id", "complexity", "embedding"],
                    values=[[
                        node.id,
                        self.session_id,
                        node.name,
                        node.path,
                        node.language,
                        node.content[:2000],
                        node.parent_id,
                        node.complexity,
                        node.embedding,
                    ]],
                )

    def _upsert_method_objects(self, nodes: List[CodeNode]) -> None:
        with self.database.batch() as batch:
            for node in nodes:
                batch.insert_or_update(
                    table="MethodObject",
                    columns=["id", "session_id", "name", "path", "language", "content", "parent_id", "complexity", "embedding"],
                    values=[[
                        node.id,
                        self.session_id,
                        node.name,
                        node.path,
                        node.language,
                        node.content[:1500],
                        node.parent_id,
                        node.complexity,
                        node.embedding,
                    ]],
                )

    async def build_edges(self, nodes: List[CodeNode]) -> None:
        """Build relationship edges: IMPORTS, CALLS, DECLARES, EXTENDS."""
        loop = asyncio.get_event_loop()
        edges = self._extract_edges(nodes)
        if edges:
            await loop.run_in_executor(None, self._upsert_edges, edges)
        logger.info(f"Built {len(edges)} graph edges for session {self.session_id}")

    def _extract_edges(self, nodes: List[CodeNode]) -> List[Dict]:
        """Extract edge relationships from parsed nodes."""
        edges = []
        node_by_name = {n.name: n for n in nodes}

        for node in nodes:
            # DECLARES edges (class → methods)
            if node.node_type == "MethodObject" and node.parent_id:
                edges.append({
                    "edge_type": "DECLARES",
                    "from_id": node.parent_id,
                    "to_id": node.id,
                    "session_id": self.session_id,
                })

            # IMPORTS edges (heuristic from content)
            if node.node_type == "SourceFile":
                for line in node.content.splitlines()[:20]:
                    stripped = line.strip()
                    if stripped.startswith(("import ", "from ")):
                        imported = stripped.split(" ")[1].split(".")[0]
                        target = node_by_name.get(imported)
                        if target:
                            edges.append({
                                "edge_type": "IMPORTS",
                                "from_id": node.id,
                                "to_id": target.id,
                                "session_id": self.session_id,
                            })
        return edges

    def _upsert_edges(self, edges: List[Dict]) -> None:
        import uuid
        with self.database.batch() as batch:
            for edge in edges:
                batch.insert_or_update(
                    table="CodeEdge",
                    columns=["id", "session_id", "edge_type", "from_id", "to_id"],
                    values=[[
                        str(uuid.uuid4()),
                        edge["session_id"],
                        edge["edge_type"],
                        edge["from_id"],
                        edge["to_id"],
                    ]],
                )
