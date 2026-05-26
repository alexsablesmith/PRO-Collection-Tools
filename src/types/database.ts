export type Role = 'admin' | 'clinician' | 'reviewer'
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

export interface Instrument {
  id: string
  code: string
  name: string
  version: string | null
  scoring_config_key: string
  languages: Language[]
  is_active: boolean
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

// Joined types used in the UI
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
      organizations:     { Row: Organization;  Insert: Partial<Organization>;  Update: Partial<Organization>  }
      user_profiles:     { Row: UserProfile;   Insert: Partial<UserProfile>;   Update: Partial<UserProfile>   }
      patients:          { Row: Patient;       Insert: Partial<Patient>;       Update: Partial<Patient>       }
      instruments:       { Row: Instrument;    Insert: Partial<Instrument>;    Update: Partial<Instrument>    }
      batteries:         { Row: Battery;       Insert: Partial<Battery>;       Update: Partial<Battery>       }
      survey_requests:   { Row: SurveyRequest; Insert: Partial<SurveyRequest>; Update: Partial<SurveyRequest> }
      survey_responses:  { Row: SurveyResponse;Insert: Partial<SurveyResponse>;Update: Partial<SurveyResponse>}
      report_audit_log:  { Row: ReportAuditLog;Insert: Partial<ReportAuditLog>;Update: Partial<ReportAuditLog>}
    }
  }
}
