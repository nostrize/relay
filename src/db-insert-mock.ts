import { getDb } from "./db";

const db = getDb();

const createBoostsTable = `CREATE TABLE IF NOT EXISTS boosts (
    event_id TEXT PRIMARY KEY,
    created_at INTEGER,
    e TEXT,
    "from" TEXT,
    "to" TEXT,
    type TEXT CHECK(type IN ('org', 'issue', 'pr', 'repo', 'user')),
    json TEXT
);`;

db.run(createBoostsTable);

db.run(`CREATE INDEX IF NOT EXISTS idx_e ON boosts("e")`);
db.run(`CREATE INDEX IF NOT EXISTS idx_from ON boosts("from")`);
db.run(`CREATE INDEX IF NOT EXISTS idx_to ON boosts("to")`);

// Check if the table has any rows
const checkIfEmpty = `SELECT COUNT(*) as count FROM boosts;`;
const result: any = db.query(checkIfEmpty).get();

if (result.count === 0) {
  const insertMockBoosts = `INSERT INTO boosts (event_id, created_at, e, "from", "to", type, json) VALUES 
  ('event1hash', 1692451200, 'receipt_event_id1', 'user1', 'org1', 'org', '{"key": "value"}'),
  ('event2hash', 1692451800, 'receipt_event_id2', 'user2', 'repo1', 'repo', '{"key": "value"}'),
  ('event3hash', 1692452400, 'receipt_event_id3', 'user3', 'issue1', 'issue', '{"key": "value"}'),
  ('event4hash', 1692453000, 'receipt_event_id4', 'user4', 'pr1', 'pr', '{"key": "value"}'),
  ('event5hash', 1692453600, 'receipt_event_id5', 'user5', 'user1', 'user', '{"key": "value"}');`;

  db.run(insertMockBoosts);
}

const createReceiptsTable = `CREATE TABLE IF NOT EXISTS receipts (
  event_id TEXT PRIMARY KEY,
  created_at INTEGER,
  p TEXT,
  amount INTEGER,
  bolt11 TEXT,
  preimage TEXT,
  json TEXT
);`;

db.run(createReceiptsTable);

db.run(`CREATE INDEX IF NOT EXISTS idx_p ON receipts("p")`);

// Check if the table has any rows
const checkIfEmpty2 = `SELECT COUNT(*) as count FROM receipts;`;
const result2: any = db.query(checkIfEmpty2).get();

if (result2.count === 0) {
  const insertMockBoosts = `INSERT INTO receipts (event_id, created_at, p, amount, bolt11, preimage, json) VALUES 
('receipt1hash', 1692451200, 'pubkey1', 21000, 'bolt11string1', 'preimage1', '{"key": "value"}'),
('receipt2hash', 1692451800, 'pubkey2', 2000, 'bolt11string2', 'preimage2', '{"key": "value"}'),
('receipt3hash', 1692452400, 'pubkey3', 4000, 'bolt11string3', 'preimage3', '{"key": "value"}'),
('receipt4hash', 1692453000, 'pubkey4', 50000, 'bolt11string4', 'preimage4', '{"key": "value"}'),
('receipt5hash', 1692453600, 'pubkey5', 210000, 'bolt11string5', 'preimage5', '{"key": "value"}');`;

  db.run(insertMockBoosts);
}
