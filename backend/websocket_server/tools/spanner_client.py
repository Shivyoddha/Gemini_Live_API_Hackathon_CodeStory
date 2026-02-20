"""
Spanner Graph client for querying the CodeStory knowledge graph.
Uses ISO Graph Query Language (GQL) for multi-hop traversals.
"""

import os
from typing import List, Dict, Any
from google.cloud import spanner
from loguru import logger


class SpannerGraphClient:
    def __init__(self):
        self.project_id = os.getenv("GCP_PROJECT_ID", "gemini-live-api-hackathon")
        self.instance_id = os.getenv("SPANNER_INSTANCE_ID", "cloud-codestory")
        self.database_id = os.getenv("SPANNER_DATABASE_ID", "cymbal")

        self.client = spanner.Client(project=self.project_id)
        self.instance = self.client.instance(self.instance_id)
        self.database = self.instance.database(self.database_id)
        logger.info(f"SpannerGraphClient connected to {self.instance_id}/{self.database_id}")

    async def find_dependencies(
        self,
        session_id: str,
        entity_name: str,
        relationship: str = "CALLS",
        depth: int = 1,
    ) -> List[Dict[str, Any]]:
        """
        Multi-hop GQL traversal to find code relationships.

        Example GQL:
            GRAPH CodeGraph
            MATCH (n {name: $entity_name})-[:CALLS*1..3]->(m)
            RETURN n.name, m.name, m.path, m.language
            LIMIT 20
        """
        gql = f"""
            GRAPH CodeGraph
            MATCH (n)-[r:{relationship}*1..{depth}]->(m)
            WHERE n.name = @entity_name OR n.path LIKE '%' || @entity_name || '%'
            RETURN n.name AS source_name,
                   n.path AS source_path,
                   r.relationship_type AS rel_type,
                   m.name AS target_name,
                   m.path AS target_path,
                   m.language AS target_language
            LIMIT 25
        """

        results = []
        with self.database.snapshot() as snapshot:
            rows = snapshot.execute_sql(
                gql,
                params={"entity_name": entity_name},
                param_types={"entity_name": spanner.param_types.STRING},
            )
            for row in rows:
                results.append({
                    "source_name": row[0],
                    "source_path": row[1],
                    "rel_type": row[2],
                    "target_name": row[3],
                    "target_path": row[4],
                    "target_language": row[5],
                })
        return results

    async def get_node_summary(self, entity_name: str) -> Dict[str, Any]:
        """Retrieve summary of a specific code entity."""
        sql = """
            SELECT name, path, language, doc_summary, complexity
            FROM SourceFile
            WHERE name = @name OR path LIKE '%' || @name || '%'
            LIMIT 1
        """
        with self.database.snapshot() as snapshot:
            rows = snapshot.execute_sql(
                sql,
                params={"name": entity_name},
                param_types={"name": spanner.param_types.STRING},
            )
            for row in rows:
                return {
                    "name": row[0],
                    "path": row[1],
                    "language": row[2],
                    "summary": row[3],
                    "complexity": row[4],
                }
        return {}

    async def semantic_search(self, query_embedding: List[float], top_k: int = 10) -> List[Dict]:
        """Vector similarity search using Spanner's ML.DISTANCE function."""
        sql = f"""
            SELECT name, path, language, doc_summary,
                   ML.DISTANCE(embedding, @query_embedding, 'COSINE') AS distance
            FROM SourceFile
            WHERE embedding IS NOT NULL
            ORDER BY distance ASC
            LIMIT {top_k}
        """
        results = []
        with self.database.snapshot() as snapshot:
            rows = snapshot.execute_sql(
                sql,
                params={"query_embedding": query_embedding},
                param_types={"query_embedding": spanner.param_types.Array(spanner.param_types.FLOAT64)},
            )
            for row in rows:
                results.append({
                    "name": row[0],
                    "path": row[1],
                    "language": row[2],
                    "summary": row[3],
                    "distance": float(row[4]),
                })
        return results
