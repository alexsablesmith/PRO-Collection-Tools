export type Role = 'app_admin' | 'org_admin' | 'clinical_user' | 'read_only'
export type Language = 'en' | 'es'
export type SurveyStatus = 'pending' | 'sent' | 'completed' | 'expired'
export type DeliveryMethod = 'email' | 'sms' | 'manual'
export type ReportType = 'single' | 'longitudinal'
export type DemographicsEntry = 'clinician' | 'patient'

export interface Organization {
  id: string
  name: string
  created_at: string
}

export interface UserProfile {
  id: string
  organization_id: string
  role: Role
  full_name: string | null
  is_active: boolean
  created_at: string
}

export interface Patient {
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

export interface InstrumentQuestionDef {
  title: string
  timeframe?: string
  items: { id: string; text: string; options?: { value: number; label: string }[] }[]
  options: { value: number; label: string }[]
}

export interface InstrumentScoringConfig {
  type: string
  higherIsBetter?: boolean
  maxScore?: number
  severityBands?: { max?: number; label: string; interpretation: string }[]
}

export type InstrumentType = 'standard' | 'promis_cat' | 'promis_fixed' | 'freeform'

export interface Instrument {
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

export interface Battery {
  id: string
  organization_id: string
  name: string
  instrument_ids: string[]
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface SurveyRequest {
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
  partial_responses: Record<string, Record<string, number>> | null
  created_at: string
}

export interface SurveyResponse {
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

export interface ReportAuditLog {
  id: string
  generated_by: string
  patient_id: string
  survey_request_ids: string[]
  report_type: ReportType
  generated_at: string
}

// ── New tables added in migration 001 ────────────────────────

export type CatSessionStatus = 'active' | 'finished' | 'error'

export interface CatDomainSession {
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

export interface CatItemResponse {
  id:                string
  domain_session_id: string
  item_id:           string
  question_text:     string | null
  response_id:       string
  response_value:    number
  administered_at:   string
}

export type SurveyTemplateType = 'promis_fixed' | 'freeform'

export interface SurveyTemplate {
  id:              string
  organization_id: string
  created_by:      string | null
  name:            string
  description:     string | null
  type:            SurveyTemplateType
  is_active:       boolean
  created_at:      string
}

export interface TemplatePromisItem {
  id:               string
  template_id:      string
  position:         number
  form_oid:         string
  item_id:          string
  question_text:    string
  response_options: { id: string; value: number; label: string }[]
}

export type FreeformQuestionType = 'multiple_choice' | 'likert' | 'text'

export interface TemplateFreeformQuestion {
  id:            string
  template_id:   string
  position:      number
  question_text: string
  question_type: FreeformQuestionType
  options:       Record<string, unknown> | null
}

// ── Joined types used in the UI ───────────────────────────────
export interface PatientWithHistory extends Patient {
  last_survey_date: string | null
  completed_surveys: number
}

export interface SurveyRequestWithResponses extends SurveyRequest {
  responses: SurveyResponse[]
  battery: Battery | null
}

// Database type for Supabase client
export type Database = {
  public: {
    Tables: {
      organizations:               { Row: Organization;              Insert: Partial<Organization>;              Update: Partial<Organization>              }
      user_profiles:               { Row: UserProfile;               Insert: Partial<UserProfile>;               Update: Partial<UserProfile>               }
      patients:                    { Row: Patient;                   Insert: Partial<Patient>;                   Update: Partial<Patient>                   }
      instruments:                 { Row: Instrument;                Insert: Partial<Instrument>;                Update: Partial<Instrument>                }
      batteries:                   { Row: Battery;                   Insert: Partial<Battery>;                   Update: Partial<Battery>                   }
      survey_requests:             { Row: SurveyRequest;             Insert: Partial<SurveyRequest>;             Update: Partial<SurveyRequest>             }
      survey_responses:            { Row: SurveyResponse;            Insert: Partial<SurveyResponse>;            Update: Partial<SurveyResponse>            }
      report_audit_log:            { Row: ReportAuditLog;            Insert: Partial<ReportAuditLog>;            Update: Partial<ReportAuditLog>            }
      cat_domain_sessions:         { Row: CatDomainSession;          Insert: Partial<CatDomainSession>;          Update: Partial<CatDomainSession>          }
      cat_item_responses:          { Row: CatItemResponse;           Insert: Partial<CatItemResponse>;           Update: Partial<CatItemResponse>           }
      survey_templates:            { Row: SurveyTemplate;            Insert: Partial<SurveyTemplate>;            Update: Partial<SurveyTemplate>            }
      template_promis_items:       { Row: TemplatePromisItem;        Insert: Partial<TemplatePromisItem>;        Update: Partial<TemplatePromisItem>        }
      template_freeform_questions: { Row: TemplateFreeformQuestion;  Insert: Partial<TemplateFreeformQuestion>;  Update: Partial<TemplateFreeformQuestion>  }
    }
  }
}
