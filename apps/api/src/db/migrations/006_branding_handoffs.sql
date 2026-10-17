CREATE TABLE handoffs (
 id TEXT PRIMARY KEY,
 documentId TEXT NOT NULL REFERENCES documents(id),
 revisionId TEXT NOT NULL REFERENCES revisions(id),
 format TEXT NOT NULL,
 filename TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 bytes BLOB NOT NULL,
 recordJson TEXT NOT NULL,
 requestJson TEXT NOT NULL,
 idempotencyKey TEXT NOT NULL UNIQUE
);
CREATE TABLE project_imports (
 idempotencyKey TEXT PRIMARY KEY,
 sha256 TEXT NOT NULL,
 projectId TEXT NOT NULL REFERENCES projects(id),
 documentId TEXT NOT NULL REFERENCES documents(id)
);
