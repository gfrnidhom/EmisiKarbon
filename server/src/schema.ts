// Skema dasar (dialek SQLite). Untuk PostgreSQL diterjemahkan otomatis oleh db.ts → toPgDDL().
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, grid_code TEXT DEFAULT 'EL_JAMALI'
);
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY, region_id INTEGER REFERENCES regions(id), name TEXT NOT NULL, short TEXT, npsn TEXT,
  type TEXT DEFAULT 'sekolah', jenjang TEXT DEFAULT 'SMP', kecamatan TEXT, address TEXT,
  students INTEGER DEFAULT 0, teachers INTEGER DEFAULT 0, staff INTEGER DEFAULT 0,
  land_m2 REAL DEFAULT 0, building_m2 REAL DEFAULT 0, lat REAL, lng REAL, polygon TEXT,
  sanitation TEXT DEFAULT 'septik', landfill TEXT, school_days_per_week INTEGER DEFAULT 6,
  base_load_kwh REAL DEFAULT 0, none_sources TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT, trained INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS role_assignments (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), role TEXT NOT NULL,
  org_id INTEGER REFERENCES organizations(id), region_id INTEGER REFERENCES regions(id),
  valid_from TEXT DEFAULT (date('now')), valid_to TEXT
);
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY, email TEXT, role TEXT, org_id INTEGER, token TEXT UNIQUE, invited_by INTEGER,
  expires_at TEXT, accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS personal_footprints (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), period TEXT NOT NULL, data TEXT DEFAULT '{}',
  total REAL DEFAULT 0, household INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, period)
);
CREATE TABLE IF NOT EXISTS otp_codes (
  email TEXT PRIMARY KEY, code_hash TEXT, expires_at BIGINT, attempts INTEGER DEFAULT 0, locked_until BIGINT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY, user_id INTEGER, expires_at BIGINT
);
CREATE TABLE IF NOT EXISTS verifier_assignments (
  id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES organizations(id), user_id INTEGER REFERENCES users(id),
  kind TEXT DEFAULT 'utama', UNIQUE(org_id, user_id)
);
CREATE TABLE IF NOT EXISTS emission_factors (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL, ext_id TEXT, category TEXT, name TEXT, name_en TEXT, activity_unit TEXT, gwp_basis TEXT,
  status TEXT DEFAULT 'referensi', value REAL, unit TEXT, gas TEXT,
  scope TEXT, source TEXT, url TEXT, version TEXT NOT NULL, valid_from TEXT, valid_to TEXT,
  active INTEGER DEFAULT 1, non_national INTEGER DEFAULT 0, note TEXT, created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_fe_code ON emission_factors(code, active);
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY, local_name TEXT, scientific TEXT, equation TEXT, a REAL, b REAL, density REAL,
  growth_default REAL, dbh_min REAL, dbh_max REAL, carbon_fraction REAL, root_ratio REAL,
  carbon_tree INTEGER DEFAULT 1, source TEXT, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS calendar_days (
  org_id INTEGER, date TEXT, type TEXT, attendance_pct REAL DEFAULT 100, note TEXT,
  PRIMARY KEY (org_id, date)
);
CREATE TABLE IF NOT EXISTS baselines (
  id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES organizations(id), version_label TEXT, version INTEGER,
  period_start TEXT, period_end TEXT, status TEXT DEFAULT 'draf', completeness REAL DEFAULT 0,
  estimate_share REAL DEFAULT 0, population INTEGER, data_hash TEXT, fe_version TEXT, summary TEXT,
  submitted_by INTEGER, approved_by INTEGER, verified_by INTEGER, locked_by INTEGER, locked_at TEXT,
  reason TEXT, verifier_note TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS baseline_components (
  id INTEGER PRIMARY KEY, baseline_id INTEGER REFERENCES baselines(id), source TEXT, total_kg REAL,
  daily_active_kg REAL, daily_holiday_kg REAL, method TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS activity_records (
  id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES organizations(id), source TEXT NOT NULL, period TEXT NOT NULL,
  quantity REAL NOT NULL, unit TEXT, meta TEXT DEFAULT '{}', method TEXT DEFAULT 'aktual',
  revision INTEGER DEFAULT 1, parent_id INTEGER, superseded INTEGER DEFAULT 0, status TEXT DEFAULT 'draf',
  flags TEXT DEFAULT '[]', evidence_ids TEXT DEFAULT '[]', created_by INTEGER, submitted_by INTEGER,
  verified_by INTEGER, note TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_act ON activity_records(org_id, source, period, superseded);
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY, org_id INTEGER, filename TEXT, mime TEXT, size INTEGER, sha256 TEXT, path TEXT,
  taken_at TEXT, lat REAL, lng REAL, uploaded_by INTEGER, flags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES organizations(id), type TEXT NOT NULL, code TEXT UNIQUE,
  qr_sig TEXT, name TEXT, species_id INTEGER REFERENCES species(id), lat REAL, lng REAL, gps_accuracy REAL,
  status TEXT DEFAULT 'hidup', meta TEXT DEFAULT '{}', flags TEXT DEFAULT '[]', planted_at TEXT, dead_at TEXT,
  dead_reason TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_assets ON assets(org_id, type);
CREATE TABLE IF NOT EXISTS tree_measurements (
  id INTEGER PRIMARY KEY, asset_id INTEGER REFERENCES assets(id), date TEXT NOT NULL, dbh REAL NOT NULL,
  stems TEXT, height REAL, condition TEXT, photos TEXT DEFAULT '[]', lat REAL, lng REAL, accuracy REAL,
  measured_by INTEGER, measurer_role TEXT DEFAULT 'operator', status TEXT DEFAULT 'draf', reason TEXT,
  flags TEXT DEFAULT '[]', idempotency_key TEXT UNIQUE, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_tm ON tree_measurements(asset_id, date);
CREATE TABLE IF NOT EXISTS waste_sessions (
  id INTEGER PRIMARY KEY, org_id INTEGER, kind TEXT, start_date TEXT, end_date TEXT, days INTEGER,
  status TEXT DEFAULT 'berjalan', created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS waste_weighings (
  id INTEGER PRIMARY KEY, session_id INTEGER REFERENCES waste_sessions(id), date TEXT, category TEXT,
  treatment TEXT, factor_code TEXT, kg REAL, evidence_id INTEGER, created_by INTEGER,
  UNIQUE(session_id, date, category, treatment)
);
CREATE TABLE IF NOT EXISTS mobility_surveys (
  id INTEGER PRIMARY KEY, org_id INTEGER, title TEXT, token TEXT UNIQUE, period TEXT, classes TEXT DEFAULT '{}',
  status TEXT DEFAULT 'aktif', created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mobility_responses (
  id INTEGER PRIMARY KEY, survey_id INTEGER REFERENCES mobility_surveys(id), class_name TEXT, role TEXT,
  mode TEXT, distance_km REAL, escort INTEGER DEFAULT 1, occupants INTEGER DEFAULT 1, days_per_week INTEGER DEFAULT 6,
  count INTEGER DEFAULT 1, device_hash TEXT, flags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(survey_id, device_hash)
);
CREATE TABLE IF NOT EXISTS rainfall (
  org_id INTEGER, period TEXT, mm REAL, PRIMARY KEY (org_id, period)
);
CREATE TABLE IF NOT EXISTS env_records (
  id INTEGER PRIMARY KEY, org_id INTEGER, asset_id INTEGER, action TEXT, period TEXT, quantity REAL, unit TEXT,
  created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS verification_tasks (
  id INTEGER PRIMARY KEY, org_id INTEGER, object_type TEXT, object_id INTEGER, title TEXT, priority TEXT DEFAULT 'normal',
  reason TEXT, verifier_id INTEGER, status TEXT DEFAULT 'terbuka', due_at TEXT, checklist TEXT DEFAULT '{}',
  result TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')), closed_at TEXT, closed_by INTEGER
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY, task_id INTEGER, org_id INTEGER, object_type TEXT, object_id INTEGER,
  category TEXT, note TEXT, status TEXT DEFAULT 'terbuka', created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT
);
CREATE TABLE IF NOT EXISTS field_samples (
  id INTEGER PRIMARY KEY, org_id INTEGER, seed INTEGER, asset_ids TEXT, status TEXT DEFAULT 'rencana',
  planned_date TEXT, result TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, org_id INTEGER, kind TEXT, period_type TEXT, period_label TEXT, start_date TEXT, end_date TEXT,
  status TEXT DEFAULT 'draf', baseline_version TEXT, fe_version TEXT, snapshot TEXT, hash TEXT,
  submitted_by INTEGER, approved_by INTEGER, verified_by INTEGER, created_at TEXT DEFAULT (datetime('now')), published_at TEXT
);
CREATE TABLE IF NOT EXISTS calculation_results (
  org_id INTEGER, date TEXT, source TEXT, co2e REAL, label TEXT, fe_version TEXT, baseline_version TEXT,
  computed_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (org_id, date, source)
);
CREATE TABLE IF NOT EXISTS day_ledger (
  org_id INTEGER, date TEXT, k REAL, day_type TEXT, total REAL, scope1 REAL, scope2 REAL, scope3 REAL,
  fe_version TEXT, baseline_version TEXT, revision INTEGER DEFAULT 1, closed_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (org_id, date)
);
CREATE TABLE IF NOT EXISTS ledger_state (
  org_id INTEGER PRIMARY KEY, dirty INTEGER DEFAULT 0, last_closed TEXT, updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT, object_type TEXT, object_id TEXT,
  before TEXT, after TEXT, ip TEXT, at TEXT DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log append-only'); END;
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, body TEXT, link TEXT, read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS iot_devices (
  id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES organizations(id), name TEXT, kind TEXT DEFAULT 'kwh_meter', unit TEXT DEFAULT 'kWh',
  source TEXT DEFAULT 'listrik', token TEXT UNIQUE, location TEXT, status TEXT DEFAULT 'aktif', created_at TEXT DEFAULT (datetime('now')),
  interval_sec INTEGER DEFAULT 300, last_seen_at TEXT, last_ip TEXT, firmware TEXT, rssi INTEGER, battery REAL, paired_at TEXT
);
CREATE TABLE IF NOT EXISTS iot_heartbeats (
  id INTEGER PRIMARY KEY, device_id INTEGER REFERENCES iot_devices(id), at TEXT NOT NULL, kind TEXT DEFAULT 'ping', rssi INTEGER, battery REAL, ip TEXT
);
CREATE INDEX IF NOT EXISTS ix_iot_hb ON iot_heartbeats(device_id, at);
CREATE TABLE IF NOT EXISTS iot_readings (
  id INTEGER PRIMARY KEY, device_id INTEGER REFERENCES iot_devices(id), at TEXT NOT NULL, value REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_iot ON iot_readings(device_id, at);
`
