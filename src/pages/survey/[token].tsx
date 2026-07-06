import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import type { InstrumentQuestionDef, InstrumentScoringConfig, SurveyProgress } from '@/types/database'
import { SURVEY_QUESTIONS } from '@/config/surveyQuestions'

// Slimmed instrument shape returned by GET /api/survey/[token]
interface SurveyInstrument {
  id:                 string
  code:               string
  name:               string
  type:               string
  scoring_config_key: string
  scoring_config:     InstrumentScoringConfig | null
  questions:          Record<string, InstrumentQuestionDef> | null
}

interface SurveyPayload {
  language:           'en' | 'es'
  demographics_entry: 'clinician' | 'patient'
  battery_name:       string
  instruments:        SurveyInstrument[]
  progress:           SurveyProgress | null
}

const AUTOSAVE_DELAY_MS = 800

export default function SurveyPage() {
  const router = useRouter()
  const { token } = router.query as { token: string }

  const [payload,      setPayload]      = useState<SurveyPayload | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [step,         setStep]         = useState(0)
  const [demographics, setDemographics] = useState({ first_name: '', last_name: '', date_of_birth: '', gender: '', preferred_language: 'en' })
  const [responses,    setResponses]    = useState<Record<string, Record<string, number>>>({})
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')
  const [completed,    setCompleted]    = useState(false)
  const [saveState,    setSaveState]    = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const loadedRef  = useRef(false)
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const lang = payload?.language ?? 'en'
  const instruments = payload?.instruments ?? []

  useEffect(() => { if (token) loadSurvey() }, [token])

  async function loadSurvey() {
    try {
      const res = await fetch(`/api/survey/${token}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'This survey link is invalid.'); setLoading(false); return }
      const data = json as SurveyPayload
      setPayload(data)
      if (data.progress) {
        setResponses(data.progress.responses ?? {})
        setStep(data.progress.step ?? 0)
        if (data.progress.demographics) setDemographics(d => ({ ...d, ...data.progress!.demographics }))
      }
      loadedRef.current = true
    } catch {
      setError('Unable to load the survey. Please check your connection and try again.')
    }
    setLoading(false)
  }

  // Auto-save progress so the patient can close the tab and resume later
  useEffect(() => {
    if (!loadedRef.current || completed || submitting) return
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/survey/${token}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responses, step, demographics }),
        })
        setSaveState(res.ok ? 'saved' : 'error')
      } catch {
        setSaveState('error')
      }
    }, AUTOSAVE_DELAY_MS)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [responses, step, demographics]) // eslint-disable-line react-hooks/exhaustive-deps

  const needsDemographics = payload?.demographics_entry === 'patient'
  const totalSteps = (needsDemographics ? 1 : 0) + instruments.length
  const currentInstrumentIndex = needsDemographics ? step - 1 : step
  const currentInstrument = instruments[currentInstrumentIndex]

  function getQuestions(inst: SurveyInstrument) {
    return inst.questions?.[lang]
      ?? SURVEY_QUESTIONS[inst.scoring_config_key]?.[lang]
  }

  function setItemResponse(instrumentKey: string, itemId: string, value: number) {
    setResponses(r => ({ ...r, [instrumentKey]: { ...(r[instrumentKey] ?? {}), [itemId]: value } }))
  }

  function isCurrentComplete(): boolean {
    if (step === 0 && needsDemographics) {
      return !!(demographics.first_name && demographics.last_name && demographics.date_of_birth)
    }
    if (!currentInstrument) return false
    const questions = getQuestions(currentInstrument)
    if (!questions) return true
    const answered = responses[currentInstrument.scoring_config_key] ?? {}
    return questions.items.every((item: any) => answered[item.id] !== undefined)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/survey/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses,
          demographics: needsDemographics ? demographics : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSubmitError(json.error ?? (lang === 'es'
          ? 'No se pudo enviar la encuesta. Por favor intente de nuevo.'
          : 'Your survey could not be submitted. Please try again.'))
        setSubmitting(false)
        return
      }
      setCompleted(true)
    } catch {
      setSubmitError(lang === 'es'
        ? 'Error de conexión. Sus respuestas están guardadas — intente enviar de nuevo.'
        : 'Connection error. Your answers are saved — please try submitting again.')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-[#1F4E79] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading survey...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">warning</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Survey Unavailable</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center card">
          <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-3xl">done</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">
            {lang === 'es' ? 'Gracias!' : 'Thank You!'}
          </h1>
          <p className="text-gray-500 text-sm">
            {lang === 'es'
              ? 'Su encuesta ha sido completada. Puede cerrar esta ventana.'
              : 'Your survey has been completed. You may close this window.'}
          </p>
        </div>
      </div>
    )
  }

  const progressPct = totalSteps > 0 ? Math.round((step / totalSteps) * 100) : 0

  const saveLabel =
    saveState === 'saving' ? (lang === 'es' ? 'Guardando…' : 'Saving…')
    : saveState === 'saved' ? (lang === 'es' ? 'Progreso guardado' : 'Progress saved')
    : saveState === 'error' ? (lang === 'es' ? 'No se pudo guardar' : 'Could not save')
    : ''

  return (
    <>
      <Head>
        <title>{lang === 'es' ? 'Encuesta - Prolix Health' : 'Survey - Prolix Health'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-gray-50">
        <div style={{ backgroundColor: '#1F4E79' }} className="text-white px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-semibold text-sm opacity-80">
              {lang === 'es' ? 'Prolix Health — Encuesta de Salud' : 'Prolix Health — Health Survey'}
            </h1>
            <div className="mt-2 h-1.5 bg-white/20 rounded-full">
              <div className="h-1.5 bg-white rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between text-xs opacity-60 mt-1">
              <span>{lang === 'es' ? `Paso ${step + 1} de ${totalSteps}` : `Step ${step + 1} of ${totalSteps}`}</span>
              <span className={saveState === 'error' ? 'text-red-200 opacity-100' : ''}>{saveLabel || `${progressPct}%`}</span>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">

          {step === 0 && needsDemographics && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {lang === 'es' ? 'Informacion Personal' : 'Personal Information'}
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">{lang === 'es' ? 'Nombre' : 'First Name'} *</label>
                    <input className="input" value={demographics.first_name} onChange={e => setDemographics(d => ({ ...d, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">{lang === 'es' ? 'Apellido' : 'Last Name'} *</label>
                    <input className="input" value={demographics.last_name} onChange={e => setDemographics(d => ({ ...d, last_name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">{lang === 'es' ? 'Fecha de Nacimiento' : 'Date of Birth'} *</label>
                  <input type="date" className="input" value={demographics.date_of_birth} onChange={e => setDemographics(d => ({ ...d, date_of_birth: e.target.value }))} />
                </div>
                <div>
                  <label className="label">{lang === 'es' ? 'Genero' : 'Gender'}</label>
                  <select className="input" value={demographics.gender} onChange={e => setDemographics(d => ({ ...d, gender: e.target.value }))}>
                    <option value="">{lang === 'es' ? 'Seleccionar...' : 'Select...'}</option>
                    <option value="Male">{lang === 'es' ? 'Masculino' : 'Male'}</option>
                    <option value="Female">{lang === 'es' ? 'Femenino' : 'Female'}</option>
                    <option value="Non-binary">{lang === 'es' ? 'No binario' : 'Non-binary'}</option>
                    <option value="Prefer not to say">{lang === 'es' ? 'Prefiero no decir' : 'Prefer not to say'}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {(step > 0 || !needsDemographics) && currentInstrument && (() => {
            const key = currentInstrument.scoring_config_key
            const questions = getQuestions(currentInstrument)
            if (!questions) return <div className="card"><p className="text-gray-500">Survey questions not available for this instrument.</p></div>
            const instResp = responses[key] ?? {}

            return (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">{questions.title}</h2>
                {questions.timeframe && <p className="text-sm text-gray-500 mb-5 italic">{questions.timeframe}</p>}

                {key === 'pain_nrs' ? (
                  <div className="card">
                    <p className="text-gray-700 mb-4">{questions.items[0].text}</p>
                    <div className="grid grid-cols-11 gap-1">
                      {questions.options.map((opt: any) => (
                        <button
                          key={opt.value}
                          onClick={() => setItemResponse(key, 'nrs', opt.value)}
                          className={`py-3 rounded-lg text-sm font-bold transition-colors ${instResp['nrs'] === opt.value ? 'bg-[#1F4E79] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                        >
                          {opt.value}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                      <span>{lang === 'es' ? 'Sin dolor' : 'No pain'}</span>
                      <span>{lang === 'es' ? 'Peor dolor imaginable' : 'Worst pain imaginable'}</span>
                    </div>
                  </div>
                ) : ['phq9', 'gad7', 'tsk11', 'pcs'].includes(key) || currentInstrument.scoring_config?.type === 'sum' ? (
                  <div className="card overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left py-2 pr-4 font-medium text-gray-600 w-1/2"></th>
                          {questions.options.map((opt: any) => (
                            <th key={opt.value} className="text-center py-2 px-2 font-medium text-gray-600 text-xs">
                              {opt.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {questions.items.map((item: any, qi: number) => (
                          <tr key={item.id} className={qi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="py-3 pr-4 text-gray-800 text-sm">
                              <span className="font-medium text-gray-400 mr-2">{qi + 1}.</span>
                              {item.text}
                            </td>
                            {questions.options.map((opt: any) => (
                              <td key={opt.value} className="text-center py-3 px-2">
                                <button
                                  onClick={() => setItemResponse(key, item.id, opt.value)}
                                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center mx-auto transition-colors ${instResp[item.id] === opt.value ? 'bg-[#1F4E79] border-[#1F4E79]' : 'border-gray-300 hover:border-[#2E75B6]'}`}
                                >
                                  {instResp[item.id] === opt.value && <div className="w-3 h-3 rounded-full bg-white" />}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {questions.items.map((item: any, qi: number) => (
                      <div key={item.id} className={`card border ${instResp[item.id] !== undefined ? 'border-blue-200' : 'border-gray-100'}`}>
                        <p className="text-sm text-gray-800 mb-3 font-medium">{qi + 1}. {item.text}</p>
                        <div className="space-y-1.5">
                          {(item.options || questions.options).map((opt: any) => (
                            <label key={opt.value} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${instResp[item.id] === opt.value ? 'bg-[#EBF3FB] border border-blue-300' : 'hover:bg-gray-50 border border-transparent'}`}>
                              <input
                                type="radio"
                                name={`${key}_${item.id}`}
                                checked={instResp[item.id] === opt.value}
                                onChange={() => setItemResponse(key, item.id, opt.value)}
                                className="sr-only"
                              />
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${instResp[item.id] === opt.value ? 'border-[#1F4E79]' : 'border-gray-300'}`}>
                                {instResp[item.id] === opt.value && <div className="w-2 h-2 rounded-full bg-[#1F4E79]" />}
                              </div>
                              <span className="text-sm text-gray-700">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {submitError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          <div className="flex justify-between mt-6">
            {step > 0 ? (
              <button onClick={() => { setStep(s => s - 1); window.scrollTo(0, 0); }} className="btn-secondary">
                {lang === 'es' ? 'Anterior' : 'Back'}
              </button>
            ) : <div />}

            {step < totalSteps - 1 ? (
              <button
                onClick={() => { setStep(s => s + 1); window.scrollTo(0, 0); }}
                disabled={!isCurrentComplete()}
                className="btn-primary"
              >
                {lang === 'es' ? 'Siguiente' : 'Next'}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isCurrentComplete() || submitting}
                className="btn-primary"
              >
                {submitting
                  ? (lang === 'es' ? 'Enviando...' : 'Submitting...')
                  : (lang === 'es' ? 'Enviar' : 'Submit')}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            {lang === 'es'
              ? 'Su progreso se guarda automáticamente. Puede cerrar esta página y volver más tarde usando el mismo enlace.'
              : 'Your progress is saved automatically. You can close this page and return later using the same link.'}
          </p>
        </div>
      </div>
    </>
  )
}
