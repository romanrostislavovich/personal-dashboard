import {
  HealthClinic,
  HealthClinicInput,
  HealthDiagnosis,
  HealthDiagnosisInput,
  HealthDoctor,
  HealthDoctorInput,
  HealthDocument,
  HealthDocumentInput,
  HealthMedication,
  HealthMedicationInput,
  HealthRecord,
  HealthVisit,
  HealthVisitInput,
  IcdDictionary,
  IcdEntry,
  IcdImportInput,
  IcdLoadInput,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

/** `/api/health` is the server's own health check, so Health lives at `/api/medical`. */
const BASE = '/api/medical';

export const HEALTH_READS = {
  /** The whole history: clinics, doctors, visits, diagnoses, medications, documents. */
  record: () => apiRequest(`${BASE}/record`),
  /** The ICD dictionaries loaded, with how many codes each has. */
  dictionaries: () => apiRequest(`${BASE}/icd`),
};

/** Adds without an id, changes with one. */
const save = <T>(api: ApiClient, path: string, input: object, id?: string) =>
  id ? api.put<T>(`${BASE}/${path}/${id}`, input) : api.post<T>(`${BASE}/${path}`, input);

export function healthApi(api: ApiClient) {
  return {
    record: () => api.read<HealthRecord>(HEALTH_READS.record()),

    saveClinic: (input: HealthClinicInput, id?: string) =>
      save<HealthClinic>(api, 'clinics', input, id),
    removeClinic: (id: string) => api.delete(`${BASE}/clinics/${id}`),

    saveDoctor: (input: HealthDoctorInput, id?: string) =>
      save<HealthDoctor>(api, 'doctors', input, id),
    removeDoctor: (id: string) => api.delete(`${BASE}/doctors/${id}`),

    saveVisit: (input: HealthVisitInput, id?: string) =>
      save<HealthVisit>(api, 'visits', input, id),
    removeVisit: (id: string) => api.delete(`${BASE}/visits/${id}`),

    saveDiagnosis: (input: HealthDiagnosisInput, id?: string) =>
      save<HealthDiagnosis>(api, 'diagnoses', input, id),
    removeDiagnosis: (id: string) => api.delete(`${BASE}/diagnoses/${id}`),

    saveMedication: (input: HealthMedicationInput, id?: string) =>
      save<HealthMedication>(api, 'medications', input, id),
    removeMedication: (id: string) => api.delete(`${BASE}/medications/${id}`),

    /** The file goes as a form with its description; empty fields are left out. */
    uploadDocument: (input: HealthDocumentInput, file: Blob) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(input)) {
        if (value !== null && value !== undefined && value !== '') {
          form.append(key, String(value));
        }
      }
      form.append('file', file);
      return api.post<HealthDocument>(`${BASE}/documents`, form);
    },
    updateDocument: (id: string, input: HealthDocumentInput) =>
      api.put<HealthDocument>(`${BASE}/documents/${id}`, input),
    /** The bytes, for an object URL (a link cannot send the auth header). */
    documentFile: (id: string) => api.blob(`${BASE}/documents/${id}/file`),
    removeDocument: (id: string) => api.delete(`${BASE}/documents/${id}`),

    dictionaries: () => api.read<IcdDictionary[]>(HEALTH_READS.dictionaries()),
    /** Downloads a dictionary from its publisher on the server; takes a minute. */
    loadDictionary: (input: IcdLoadInput) => api.post<IcdDictionary[]>(`${BASE}/icd/load`, input),
    /** A dictionary from a CSV or XLSX file the user downloaded themselves. */
    importDictionary: (input: IcdImportInput, file: Blob, name: string) => {
      const form = new FormData();
      form.append('system', input.system);
      form.append('language', input.language);
      form.append('file', file, name);
      return api.post<IcdDictionary[]>(`${BASE}/icd/import`, form);
    },
    searchIcd: (q: string, limit?: number) =>
      api.read<IcdEntry[]>(apiRequest(`${BASE}/icd/search`, { q, limit })),
  };
}

export type HealthClient = ReturnType<typeof healthApi>;
