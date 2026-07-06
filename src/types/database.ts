export type Role = 'app_admin' | 'org_admin' | 'clinical_user' | 'read_only'
export type Language = 'en' | 'es'
export type SurveyStatus = 'pending' | 'sent' | 'completed' | 'expired'
export type DeliveryMethod = 'email' | 'sms' | 'manual'
export type ReportType = 'single' | 'longitudinal'
export type DemographicsEntry = 'clinician' | 'patient'

export type Organization = {
  id: string
  name: string
  created_at: string
}

export type UserProfile = {
  id: string
  organization_id: string
  role: Role
  full_name: string | null
  is_active: boolean
  created_at: string
}

export type Patient = {
  id: string
  organization_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  gender: string | null
  preferred_language: Language
  phone: string | null
  email: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

export type InstrumentQuestionDef = {
  title: string
  timeframe?: string
  items: { id: string; text: string; options?: { value: number; label: string }[] }[]
  options: { value: number; label: string }[]
}

export type InstrumentScoringConfig = {
  type: string
  higherIsBetter?: boolean
  maxScore?: number
  severityBands?: { max?: number; label: string; interpretation: string }[]
}

export type InstrumentType = 'standard' | 'promis_cat' | 'promis_fixed' | 'freeform'

export type Instrument = {
  id: string
  code: string
  name: string
  version: string | null
  scoring_config_key: string
  languages: Language[]
  is_active: boolean
  type: InstrumentType
  form_oid: string | null
  template_id: string | null
  questions?: Record<string, InstrumentQuestionDef> | null
  scoring_config?: InstrumentScoringConfig | null
}

export type Battery = {
  id: string
  organization_id: string
  name: string
  instrument_ids: string[]
  is_active: boolean
  created_by: string | null
  created_at: string
}

export type SurveyDemographics = {
  first_name:         string
  last_name:          string
  date_of_birth:      string
  gender:             string
  preferred_language: string
}

/** Shape stored in survey_requests.partial_responses for save/resume */
export type SurveyProgress = {
  responses:    Record<string, Record<string, number>>
  step:         number
  demographics: SurveyDemographics | null
  saved_at:     string
}

export type SurveyRequest = {
  id: string
  patient_id: string
  battery_id: string
  created_by: string | null
  language: Language
  token: string
  delivery_method: DeliveryMethod | null
  sent_at: string | null
  completed_at: string | null
  expires_at: string
  status: SurveyStatus
  demographics_entry: DemographicsEntry
  partial_responses: SurveyProgress | null
  created_at: string
}

export type SurveyResponse = {
  id: string
  survey_request_id: string
  patient_id: string
  instrument_id: string
  raw_responses: Record<string, number>
  raw_score: number | null
  t_score: number | null
  standard_error: number | null
  total_score: number | null
  severity_label: string | null
  subscale_scores: Record<string, number> | null
  completed_at: string
}

export type ReportAuditLog = {
  id: string
  generated_by: string
  patient_id: string
  survey_request_ids: string[]
  report_type: ReportType
  generated_at: string
}

// ── New tables added in migration 001 ────────────────────────

export type CatSessionStatus = 'active' | 'finished' | 'error'

export type CatDomainSession = {
  id:                 string
  survey_request_id:  string
  instrument_id:      string
  form_oid:           string
  assessment_token:   string
  layer:              number
  status:             CatSessionStatus
  t_score:            number | null
  standard_error:     number | null
  items_administered: number
  created_at:         string
  finished_at:        string | null
}

export type CatItemResponse = {
  id:                string
  domain_session_id: string
  item_id:           string
  question_text:     string | null
  response_id:       string
  response_value:    number
  administered_at:   string
}

export type SurveyTemplateType = 'promis_fixed' | 'freeform'

export type SurveyTemplate = {
  id:              string
  organization_id: string
  created_by:      string | null
  name:            string
  description:     string | null
  type:            SurveyTemplateType
  is_active:       boolean
  created_at:      string
}

export type TemplatePromisItem = {
  id:               string
  template_id:      string
  position:         number
  form_oid:         string
  item_id:          string
  question_text:    string
  response_options: { id: string; value: number; label: string }[]
}

export type FreeformQuestionType = 'multiple_choice' | 'likert' | 'text'

export type TemplateFreeformQuestion = {
  id:            string
  template_id:   string
  position:      number
  question_text: string
  question_type: FreeformQuestionType
  options:       Record<string, unknown> | null
}

// ── Item bank + clinical events ───────────────────────────────

export type ItemOption = {
  value:     number
  label:     string
  label_es?: string
}

/**
 * One question in the master item bank, tagged with ICF domain and body
 * region metadata. item_key matches the key used in raw_responses so
 * item-level answers can be joined back to their metadata.
 */
export type Item = {
  id:                    string
  instrument_code:       string
  item_key:              string
  position:              number
  text_en:               string
  text_es:               string | null
  options:               ItemOption[]
  higher_is_worse:       boolean
  icf_primary_code:      string | null
  icf_primary_label:     string | null
  icf_secondary_code:    string | null
  icf_secondary_label:   string | null
  mh_code:               string | null
  mh_label:              string | null
  body_region_primary:   string | null
  body_region_secondary: string | null
  response_format:       string | null
  coding_notes:          string | null
}

export type ClinicalEventType = 'surgery' | 'injury' | 'treatment_start' | 'treatment_end' | 'other'

export type ClinicalEvent = {
  id:              string
  patient_id:      string
  organization_id: string
  event_type:      ClinicalEventType
  label:           string
  event_date:      string
  notes:           string | null
  created_by:      string | null
  created_at:      string
}

// ── Joined types used in the UI ───────────────────────────────
export type PatientWithHistory = Patient & {
  last_survey_date: string | null
  completed_surveys: number
}

export type SurveyRequestWithResponses = SurveyRequest & {
  responses: SurveyResponse[]
  battery: Battery | null
}

// Database type for Supabase client
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      organizations:               Table<Organization>
      user_profiles:               Table<UserProfile>
      patients:                    Table<Patient>
      instruments:                 Table<Instrument>
      batteries:                   Table<Battery>
      survey_requests:             Table<SurveyRequest>
      survey_responses:            Table<SurveyResponse>
      report_audit_log:            Table<ReportAuditLog>
      cat_domain_sessions:         Table<CatDomainSession>
      cat_item_responses:          Table<CatItemResponse>
      survey_templates:            Table<SurveyTemplate>
      template_promis_items:       Table<TemplatePromisItem>
      template_freeform_questions: Table<TemplateFreeformQuestion>
      export_audit_log:            Table<Record<string, unknown>>
      items:                       Table<Item>
      clinical_events:             Table<ClinicalEvent>
    }
    Views: Record<string, never>
    Functions: {
      submit_survey: {
        Args:    { p_request_id: string; p_demographics: unknown; p_responses: unknown }
        Returns: undefined
      }
      delete_patient: {
        Args:    { p_patient_id: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
