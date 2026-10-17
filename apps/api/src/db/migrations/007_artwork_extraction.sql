CREATE TABLE artwork_extractions (
 id TEXT PRIMARY KEY,
 documentId TEXT NOT NULL REFERENCES documents(id),
 revisionId TEXT NOT NULL REFERENCES revisions(id),
 assetId TEXT NOT NULL REFERENCES assets(id),
 snapshotJson TEXT NOT NULL,
 requestJson TEXT NOT NULL,
 recordJson TEXT NOT NULL,
 idempotencyKey TEXT NOT NULL UNIQUE
);
