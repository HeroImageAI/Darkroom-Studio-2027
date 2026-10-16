CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  documentId TEXT NOT NULL REFERENCES documents(id),
  revisionId TEXT NOT NULL REFERENCES revisions(id),
  assetId TEXT NOT NULL REFERENCES assets(id),
  requestJson TEXT NOT NULL,
  recordJson TEXT NOT NULL,
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL
);
CREATE TABLE finish_requests (
  jobId TEXT PRIMARY KEY REFERENCES jobs(id),
  documentId TEXT NOT NULL REFERENCES documents(id),
  baseRevisionId TEXT NOT NULL REFERENCES revisions(id),
  sourceAssetId TEXT NOT NULL REFERENCES assets(id),
  snapshotJson TEXT NOT NULL,
  requestJson TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'candidate',
  acceptedDocumentId TEXT REFERENCES documents(id),
  versionId TEXT REFERENCES versions(id),
  idempotencyKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL
);
