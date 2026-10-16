CREATE TABLE create_batches(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),requestJson TEXT NOT NULL,idempotencyKey TEXT NOT NULL UNIQUE,createdAt TEXT NOT NULL);
ALTER TABLE jobs ADD COLUMN batchId TEXT REFERENCES create_batches(id);
ALTER TABLE jobs ADD COLUMN variationIndex INTEGER NOT NULL DEFAULT 0;
CREATE TABLE candidates(id TEXT PRIMARY KEY,jobId TEXT NOT NULL UNIQUE REFERENCES jobs(id),assetId TEXT NOT NULL REFERENCES assets(id),variationIndex INTEGER NOT NULL,disposition TEXT NOT NULL CHECK(disposition IN ('candidate','accepted','rejected')),documentId TEXT REFERENCES documents(id),versionId TEXT REFERENCES versions(id));
