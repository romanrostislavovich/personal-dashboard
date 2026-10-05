/** The version of the archive's layout; an archive of a newer one is refused. */
export const DATA_ARCHIVE_FORMAT = 1;

/** `manifest.json` of an archive of one's data (Settings → Data → Export). */
export interface DataArchiveManifest {
  format: number;
  exportedAt: string;
  /** Table → how many rows of it the archive holds. */
  tables: Record<string, number>;
}

/** What an import does to one table. */
export interface DataImportTable {
  table: string;
  /** Rows of the table in the archive. */
  inArchive: number;
  /** Of them not in the dashboard yet: they are (or would be) added. */
  added: number;
}

/**
 * What an archive would add, counted before anything is changed. An import only adds what is
 * missing: a record that is already here stays as it is.
 */
export interface DataImportReport {
  /** The uploaded archive kept on the server: apply or discard it by this id. */
  id: string;
  exportedAt: string;
  tables: DataImportTable[];
  /** Tables of the archive this dashboard does not have (a module that is gone): left out. */
  unknownTables: string[];
}
