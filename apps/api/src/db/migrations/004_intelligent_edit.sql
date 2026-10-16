CREATE TABLE edit_requests (
 jobId TEXT PRIMARY KEY REFERENCES jobs(id),
 documentId TEXT NOT NULL REFERENCES documents(id),
 baseRevisionId TEXT NOT NULL REFERENCES revisions(id),
 requestJson TEXT NOT NULL,
 snapshotJson TEXT NOT NULL,
 sourceAssetId TEXT NOT NULL REFERENCES assets(id),
 maskAssetId TEXT NOT NULL REFERENCES assets(id),
 rawAssetId TEXT REFERENCES assets(id),
 disposition TEXT NOT NULL DEFAULT 'candidate',
 acceptedDocumentId TEXT REFERENCES documents(id),
 versionId TEXT REFERENCES versions(id),
 idempotencyKey TEXT UNIQUE NOT NULL,
 createdAt TEXT NOT NULL
);
