import {
  BandDayQuery,
  GoogleHealthAppInput,
  MindfulnessInput,
  ReactionFeeling,
  HealthAllergy,
  HealthAllergyInput,
  HealthClinic,
  HealthClinicInput,
  HealthDiagnosis,
  HealthDiagnosisInput,
  HealthDoctor,
  HealthDoctorInput,
  HealthDocument,
  HealthDocumentDraft,
  HealthDocumentInput,
  HealthDraftApplied,
  HealthDraftApplyInput,
  HealthIntake,
  HealthIntakeAnswer,
  HealthLabPanel,
  HealthLabPanelInput,
  HealthMedication,
  HealthMedicationInput,
  HealthOperation,
  HealthOperationInput,
  HealthProfile,
  HealthProfileInput,
  HealthRecord,
  HealthShare,
  HealthShareCreated,
  HealthShareInput,
  HealthStudy,
  HealthStudyInput,
  HealthSummaryOptionsInput,
  HealthTaskInput,
  HealthVaccination,
  HealthVaccinationInput,
  HealthVisit,
  HealthVisitInput,
  IcdDictionary,
  IcdEntry,
  IcdImportInput,
  IcdLoadInput,
  WearableDaysQuery,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

/** `/api/health` is the server's own health check, so Health lives at `/api/medical`. */
const BASE = '/api/medical';

export const HEALTH_READS = {
  /** The whole history: clinics, doctors, visits, diagnoses, medications, documents. */
  record: () => apiRequest(`${BASE}/record`),
  /** The ICD dictionaries loaded, with how many codes each has. */
  dictionaries: () => apiRequest(`${BASE}/icd`),
  /** The links for doctors, the latest first. */
  shares: () => apiRequest(`${BASE}/shares`),
  /** The band through the Google Health API: connected or not, the last sync. */
  wearable: () => apiRequest(`${BASE}/wearable`),
  /** The band's days of a period, oldest first. */
  wearableDays: (query: WearableDaysQuery) =>
    apiRequest(`${BASE}/wearable/days`, query),
  /** A day of the band from the phone's Health Connect: by hours, its night, its reactions. */
  bandDay: (query: BandDayQuery) => apiRequest(`${BASE}/band/day`, query),
};

/** Adds without an id, changes with one. */
const save = <T>(api: ApiClient, path: string, input: object, id?: string) =>
  id
    ? api.put<T>(`${BASE}/${path}/${id}`, input)
    : api.post<T>(`${BASE}/${path}`, input);

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

    /** A recommendation of a doctor as a task of the TODO list; 404 without Tasks. */
    addTask: (input: HealthTaskInput) =>
      api.post<{created: boolean}>(`${BASE}/tasks`, input),

    saveProfile: (input: HealthProfileInput) =>
      api.put<HealthProfile>(`${BASE}/profile`, input),
    saveAllergy: (input: HealthAllergyInput, id?: string) =>
      save<HealthAllergy>(api, 'allergies', input, id),
    removeAllergy: (id: string) => api.delete(`${BASE}/allergies/${id}`),
    saveVaccination: (input: HealthVaccinationInput, id?: string) =>
      save<HealthVaccination>(api, 'vaccinations', input, id),
    removeVaccination: (id: string) => api.delete(`${BASE}/vaccinations/${id}`),
    saveOperation: (input: HealthOperationInput, id?: string) =>
      save<HealthOperation>(api, 'operations', input, id),
    removeOperation: (id: string) => api.delete(`${BASE}/operations/${id}`),
    /** "Taken" or "skipped" for a reminder to take a medication. */
    answerIntake: (id: string, input: HealthIntakeAnswer) =>
      api.put<HealthIntake>(`${BASE}/intakes/${id}`, input),

    saveDiagnosis: (input: HealthDiagnosisInput, id?: string) =>
      save<HealthDiagnosis>(api, 'diagnoses', input, id),
    removeDiagnosis: (id: string) => api.delete(`${BASE}/diagnoses/${id}`),

    saveMedication: (input: HealthMedicationInput, id?: string) =>
      save<HealthMedication>(api, 'medications', input, id),
    removeMedication: (id: string) => api.delete(`${BASE}/medications/${id}`),

    /** A lab report with all its lines; changing one replaces the lines as a whole. */
    saveLabPanel: (input: HealthLabPanelInput, id?: string) =>
      save<HealthLabPanel>(api, 'labs', input, id),
    removeLabPanel: (id: string) => api.delete(`${BASE}/labs/${id}`),

    saveStudy: (input: HealthStudyInput, id?: string) =>
      save<HealthStudy>(api, 'studies', input, id),
    removeStudy: (id: string) => api.delete(`${BASE}/studies/${id}`),

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
    /** The bytes of a page, for an object URL (a link cannot send the auth header). */
    documentFile: (id: string, page = 1) =>
      api.blob(
        `${BASE}/documents/${id}/file${page > 1 ? `?page=${page}` : ''}`,
      ),
    /** One more photographed page at the end. */
    addDocumentPage: (id: string, file: Blob) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<HealthDocument>(`${BASE}/documents/${id}/pages`, form);
    },
    /** A page after the first taken out; the ones after it move up. */
    removeDocumentPage: (id: string, page: number) =>
      api.delete<HealthDocument>(`${BASE}/documents/${id}/pages/${page}`),
    removeDocument: (id: string) => api.delete(`${BASE}/documents/${id}`),

    /** The AI reads the document into a draft (kept next to it); takes up to a minute. */
    readDocument: (id: string) =>
      api.post<HealthDocumentDraft>(`${BASE}/documents/${id}/read`, {}),
    /** The draft waiting to be checked, if any. */
    documentDraft: (id: string) =>
      api.read<{draft: HealthDocumentDraft | null}>(
        apiRequest(`${BASE}/documents/${id}/draft`),
      ),
    dropDraft: (id: string) => api.delete(`${BASE}/documents/${id}/draft`),
    /** Saves a checked draft at once: the visit, the lab report or the study, with the document. */
    applyDraft: (input: HealthDraftApplyInput) =>
      api.post<HealthDraftApplied>(`${BASE}/drafts/apply`, input),

    /** The summary for a doctor as a page to print (HTML) or a Word document. */
    summaryHtml: (options: HealthSummaryOptionsInput) =>
      api.blob(`${BASE}/summary/html`, options),
    summaryDocx: (options: HealthSummaryOptionsInput) =>
      api.blob(`${BASE}/summary/docx`, options),
    shares: () => api.read<HealthShare[]>(HEALTH_READS.shares()),
    /** A link for a doctor; its address comes only now. */
    share: (input: HealthShareInput) =>
      api.post<HealthShareCreated>(`${BASE}/shares`, input),
    revokeShare: (id: string) => api.delete(`${BASE}/shares/${id}`),

    dictionaries: () => api.read<IcdDictionary[]>(HEALTH_READS.dictionaries()),
    /** Downloads a dictionary from its publisher on the server; takes a minute. */
    loadDictionary: (input: IcdLoadInput) =>
      api.post<IcdDictionary[]>(`${BASE}/icd/load`, input),
    /** A dictionary from a CSV or XLSX file the user downloaded themselves. */
    importDictionary: (input: IcdImportInput, file: Blob, name: string) => {
      const form = new FormData();
      form.append('system', input.system);
      form.append('language', input.language);
      form.append('file', file, name);
      return api.post<IcdDictionary[]>(`${BASE}/icd/import`, form);
    },
    searchIcd: (q: string, limit?: number) =>
      api.read<IcdEntry[]>(apiRequest(`${BASE}/icd/search`, {q, limit})),

    /** The Google sign-in page the user has to open to connect the band. */
    wearableConnectUrl: () =>
      api.post<{url: string}>(`${BASE}/wearable/connect`, {}),
    disconnectWearable: () => api.delete(`${BASE}/wearable`),
    /** Reads the band's new days now. */
    syncWearable: () => api.post<void>(`${BASE}/wearable/sync`, {}),
    /** The owner sets the keys of the server's Google Cloud app. */
    setGoogleHealthApp: (input: GoogleHealthAppInput) =>
      api.put<void>(`${BASE}/wearable/app`, input),
    removeGoogleHealthApp: () => api.delete(`${BASE}/wearable/app`),
    /** What a reaction of the body was (the owner's answer). */
    setReactionFeeling: (id: string, feeling: ReactionFeeling) =>
      api.put<void>(`${BASE}/band/reactions/${id}`, {feeling}),
    /** A breathing session done in the dashboard. */
    addMindfulness: (input: MindfulnessInput) =>
      api.post<void>(`${BASE}/band/mindfulness`, input),
    removeMindfulness: (id: string) =>
      api.delete(`${BASE}/band/mindfulness/${id}`),
  };
}
