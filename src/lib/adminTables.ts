// ── Admin Database Console — table registry ─────────────────────
// Single source of truth for which tables the /admin/database console
// may touch and which columns are exposed/editable. The API route
// validates every table and column name from a request against this
// registry — nothing client-supplied is ever passed to the DB unchecked.
//
// Deliberately EXCLUDED: admin_allowlist (security bootstrap list) and
// all transactional tables (training_engagements, engagement_trainers,
// travel_logs, invitation_tokens, audit_logs, notifications, profiles)
// — those have dedicated, business-logic-aware UIs; freeform edits
// could corrupt workflow state or bypass security controls.
//
// Pure data, no server-only imports — safe to import from client
// components (the grid/form renders itself from these definitions).

export type AdminColumnType = 'text' | 'number' | 'integer' | 'date' | 'textarea' | 'select' | 'tags'

export interface AdminColumnDef {
  name:     string
  labelEn:  string
  labelBm:  string
  type:     AdminColumnType
  required: boolean
  options?: string[]   // for type 'select'
}

export interface AdminTableDef {
  name:         string
  labelEn:      string
  labelBm:      string
  primaryKey:   string
  /** true = DB-generated (serial/uuid): omitted from the create form */
  pkAuto:       boolean
  searchColumn: string
  orderBy:      string
  columns:      AdminColumnDef[]
  /**
   * true = the table has a deleted_at column (migration 024): DELETE
   * sets deleted_at instead of removing the row, the list hides
   * deleted rows by default, and a deleted row can be restored.
   * Registry data (trainers, schools, taxonomy) must never be
   * hard-deleted — it may be referenced by historical engagements.
   */
  softDelete?:  boolean
}

export const ADMIN_TABLES: Record<string, AdminTableDef> = {
  schools: {
    name: 'schools', labelEn: 'Schools', labelBm: 'Sekolah',
    primaryKey: 'school_code', pkAuto: false, softDelete: true,
    searchColumn: 'school_name', orderBy: 'school_code',
    columns: [
      { name: 'school_code',        labelEn: 'School code',        labelBm: 'Kod sekolah',        type: 'text',    required: true  },
      { name: 'school_name',        labelEn: 'School name',        labelBm: 'Nama sekolah',       type: 'text',    required: true  },
      { name: 'state',              labelEn: 'State',              labelBm: 'Negeri',             type: 'text',    required: false },
      { name: 'ppd_district',       labelEn: 'PPD district',       labelBm: 'Daerah PPD',         type: 'text',    required: false },
      { name: 'level',              labelEn: 'Level',              labelBm: 'Peringkat',          type: 'text',    required: false },
      { name: 'school_type',        labelEn: 'School type',        labelBm: 'Jenis sekolah',      type: 'text',    required: false },
      { name: 'address',            labelEn: 'Address',            labelBm: 'Alamat',             type: 'text',    required: false },
      { name: 'postcode',           labelEn: 'Postcode',           labelBm: 'Poskod',             type: 'text',    required: false },
      { name: 'city',               labelEn: 'City',               labelBm: 'Bandar',             type: 'text',    required: false },
      { name: 'longitude',          labelEn: 'Longitude',          labelBm: 'Longitud',           type: 'number',  required: false },
      { name: 'latitude',           labelEn: 'Latitude',           labelBm: 'Latitud',            type: 'number',  required: false },
      { name: 'accessibility_tier', labelEn: 'Accessibility tier', labelBm: 'Tahap akses',        type: 'select',  required: true, options: ['road', 'boat', 'flight'] },
    ],
  },
  master_trainers: {
    name: 'master_trainers', labelEn: 'Master Trainers', labelBm: 'Jurulatih Utama',
    primaryKey: 'trainer_id', pkAuto: false, softDelete: true,
    searchColumn: 'trainer_name', orderBy: 'trainer_id',
    columns: [
      { name: 'trainer_id',              labelEn: 'Trainer ID',          labelBm: 'ID jurulatih',        type: 'text',   required: true  },
      { name: 'trainer_name',            labelEn: 'Trainer name',        labelBm: 'Nama jurulatih',      type: 'text',   required: true  },
      { name: 'email',                   labelEn: 'Email',               labelBm: 'E-mel',               type: 'text',   required: false },
      { name: 'ppd_district',            labelEn: 'PPD district',        labelBm: 'Daerah PPD',          type: 'text',   required: false },
      { name: 'workstation_school_code', labelEn: 'Workstation school',  labelBm: 'Kod sekolah bertugas', type: 'text',  required: false },
      { name: 'workstation_long',        labelEn: 'Workstation long.',   labelBm: 'Longitud',            type: 'number', required: false },
      { name: 'workstation_lat',         labelEn: 'Workstation lat.',    labelBm: 'Latitud',             type: 'number', required: false },
      { name: 'level',                   labelEn: 'Level',               labelBm: 'Peringkat',           type: 'text',   required: false },
      { name: 'coord_source',            labelEn: 'Coord source',        labelBm: 'Sumber koordinat',    type: 'text',   required: false },
    ],
  },
  skills_subjects: {
    name: 'skills_subjects', labelEn: 'Skills & Subjects', labelBm: 'Kemahiran & Subjek',
    primaryKey: 'item_id', pkAuto: true, softDelete: true,
    searchColumn: 'name_en', orderBy: 'item_id',
    columns: [
      { name: 'type',               labelEn: 'Type',               labelBm: 'Jenis',              type: 'select',  required: true, options: ['SKILL', 'SUBJECT'] },
      { name: 'name_en',            labelEn: 'Name (EN)',          labelBm: 'Nama (EN)',          type: 'text',    required: true  },
      { name: 'name_bm',            labelEn: 'Name (BM)',          labelBm: 'Nama (BM)',          type: 'text',    required: true  },
      { name: 'category_en',        labelEn: 'Category (EN)',      labelBm: 'Kategori (EN)',      type: 'text',    required: false },
      { name: 'category_bm',        labelEn: 'Category (BM)',      labelBm: 'Kategori (BM)',      type: 'text',    required: false },
      { name: 'ict_specialisation', labelEn: 'ICT specialisation', labelBm: 'Pengkhususan TMK',   type: 'text',    required: false },
    ],
  },
  trainer_skills: {
    name: 'trainer_skills', labelEn: 'Trainer Skills (links)', labelBm: 'Kemahiran Jurulatih (pautan)',
    primaryKey: 'id', pkAuto: true, softDelete: true,
    searchColumn: 'trainer_id', orderBy: 'id',
    columns: [
      { name: 'trainer_id', labelEn: 'Trainer ID', labelBm: 'ID jurulatih', type: 'text',    required: true },
      { name: 'item_id',    labelEn: 'Item ID',    labelBm: 'ID item',      type: 'integer', required: true },
    ],
  },
  trainer_roles: {
    name: 'trainer_roles', labelEn: 'Trainer Roles', labelBm: 'Peranan Jurulatih',
    primaryKey: 'id', pkAuto: true,
    searchColumn: 'trainer_id', orderBy: 'id',
    columns: [
      { name: 'trainer_id', labelEn: 'Trainer ID', labelBm: 'ID jurulatih', type: 'text', required: true },
      { name: 'role',       labelEn: 'Role',       labelBm: 'Peranan',      type: 'text', required: true },
    ],
  },
  travel_rates: {
    name: 'travel_rates', labelEn: 'Travel Rates', labelBm: 'Kadar Perjalanan',
    primaryKey: 'rate_key', pkAuto: false,
    searchColumn: 'rate_key', orderBy: 'rate_key',
    columns: [
      { name: 'rate_key',       labelEn: 'Rate key',       labelBm: 'Kunci kadar',     type: 'text',   required: true  },
      { name: 'rate_myr',       labelEn: 'Rate (MYR)',     labelBm: 'Kadar (MYR)',     type: 'number', required: true  },
      { name: 'unit',           labelEn: 'Unit',           labelBm: 'Unit',            type: 'select', required: true, options: ['per_km', 'flat'] },
      { name: 'note',           labelEn: 'Note',           labelBm: 'Nota',            type: 'text',   required: false },
      { name: 'effective_from', labelEn: 'Effective from', labelBm: 'Berkuat kuasa',   type: 'date',   required: false },
    ],
  },
  knowledge_base: {
    name: 'knowledge_base', labelEn: 'Knowledge Base', labelBm: 'Pangkalan Pengetahuan',
    primaryKey: 'doc_id', pkAuto: true,
    searchColumn: 'title_en', orderBy: 'created_at',
    columns: [
      { name: 'title_en',   labelEn: 'Title (EN)',   labelBm: 'Tajuk (EN)',     type: 'text',     required: false },
      { name: 'title_bm',   labelEn: 'Title (BM)',   labelBm: 'Tajuk (BM)',     type: 'text',     required: false },
      { name: 'content_en', labelEn: 'Content (EN)', labelBm: 'Kandungan (EN)', type: 'textarea', required: false },
      { name: 'content_bm', labelEn: 'Content (BM)', labelBm: 'Kandungan (BM)', type: 'textarea', required: false },
      { name: 'tags',       labelEn: 'Tags',         labelBm: 'Tag',            type: 'tags',     required: false },
    ],
  },
}

export const ADMIN_TABLE_NAMES = Object.keys(ADMIN_TABLES)

export function getAdminTable(name: string): AdminTableDef | null {
  return ADMIN_TABLES[name] ?? null
}
