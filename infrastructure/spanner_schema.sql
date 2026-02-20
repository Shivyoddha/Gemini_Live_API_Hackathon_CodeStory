-- CodeStory Spanner Graph Schema
-- Project: gemini-live-api-hackathon
-- Instance: cloud-codestory
-- Database: cymbal

-- ─────────────────────────────────────────────
-- Node Tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS SourceFile (
  id           STRING(36) NOT NULL,
  session_id   STRING(36) NOT NULL,
  name         STRING(512),
  path         STRING(1024),
  language     STRING(50),
  doc_summary  STRING(2000),
  embedding    ARRAY<FLOAT64>,
  created_at   TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS ClassObject (
  id           STRING(36) NOT NULL,
  session_id   STRING(36) NOT NULL,
  name         STRING(512),
  path         STRING(1024),
  language     STRING(50),
  content      STRING(5000),
  parent_id    STRING(36),
  complexity   INT64,
  embedding    ARRAY<FLOAT64>,
  created_at   TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS MethodObject (
  id           STRING(36) NOT NULL,
  session_id   STRING(36) NOT NULL,
  name         STRING(512),
  path         STRING(1024),
  language     STRING(50),
  content      STRING(3000),
  parent_id    STRING(36),
  complexity   INT64,
  embedding    ARRAY<FLOAT64>,
  created_at   TIMESTAMP OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (id);

CREATE TABLE IF NOT EXISTS Documentation (
  id           STRING(36) NOT NULL,
  session_id   STRING(36) NOT NULL,
  content      STRING(MAX),
  format       STRING(50),    -- markdown | docstring | comment
  last_updated TIMESTAMP,
  parent_id    STRING(36),
  embedding    ARRAY<FLOAT64>,
) PRIMARY KEY (id);

-- ─────────────────────────────────────────────
-- Edge Table
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS CodeEdge (
  id            STRING(36) NOT NULL,
  session_id    STRING(36) NOT NULL,
  edge_type     STRING(50) NOT NULL,  -- IMPORTS | CALLS | EXTENDS | DECLARES | OVERRIDES | DESCRIBES
  from_id       STRING(36) NOT NULL,
  to_id         STRING(36) NOT NULL,
  metadata      JSON,
) PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_code_edge_from ON CodeEdge (from_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_code_edge_to ON CodeEdge (to_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_source_file_session ON SourceFile (session_id);
CREATE INDEX IF NOT EXISTS idx_class_session ON ClassObject (session_id);
CREATE INDEX IF NOT EXISTS idx_method_session ON MethodObject (session_id);

-- ─────────────────────────────────────────────
-- Graph Definition (Property Graph)
-- ─────────────────────────────────────────────

CREATE PROPERTY GRAPH IF NOT EXISTS CodeGraph
  NODE TABLES (
    SourceFile  KEY (id) LABEL SourceFile PROPERTIES ALL COLUMNS,
    ClassObject KEY (id) LABEL ClassObject PROPERTIES ALL COLUMNS,
    MethodObject KEY (id) LABEL MethodObject PROPERTIES ALL COLUMNS,
    Documentation KEY (id) LABEL Documentation PROPERTIES ALL COLUMNS
  )
  EDGE TABLES (
    CodeEdge
      KEY (id)
      SOURCE KEY (from_id) REFERENCES SourceFile
      DESTINATION KEY (to_id) REFERENCES SourceFile
      LABEL IMPORTS,
    CodeEdge
      KEY (id)
      SOURCE KEY (from_id) REFERENCES ClassObject
      DESTINATION KEY (to_id) REFERENCES MethodObject
      LABEL DECLARES,
    CodeEdge
      KEY (id)
      SOURCE KEY (from_id) REFERENCES MethodObject
      DESTINATION KEY (to_id) REFERENCES MethodObject
      LABEL CALLS,
    CodeEdge
      KEY (id)
      SOURCE KEY (from_id) REFERENCES ClassObject
      DESTINATION KEY (to_id) REFERENCES ClassObject
      LABEL EXTENDS
  );
