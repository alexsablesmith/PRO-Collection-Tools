import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { scoreInstrument } from '@/config/scoring'
import { SURVEY_QUESTIONS } from '@/config/surveyQuestions'
import type { SurveyRequest, Battery, Instrument } from '@/types/database'

export default function SurveyPage() {
  const router = useRouter()
  const { token } = router.query as { token: string }

  const [request,      setRequest]      = useState<SurveyRequest | null>(null)
  const [battery,      setBattery]      = useState<Battery | null>(null)
  const [instruments,  setInstruments]  = useState<Instrument[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [step,         setStep]         = useState(0)
  const [demographics, setDemographics] = useState({ first_name: '', last_name: '', date_of_birth: '', gender: '', preferred_language: 'en' })
  const [responses,    setResponses]    = useState<Record<string, Record<string, number>>>({})
  const [submitting,   setSubmitting]   = useState(false)
  const [completed,    setCompleted]    = useState(false)

  const lang = (request?.language ?? 'en') as 'en' | 'es'

  useEffect(() => { if (token) loadSurvey() }, [token])

  async function loadSurvey() {
    const { data: req, error } = await supabase
      .from('survey_requests')
      .select('*')
      .eq('token', token)
      .in('status', ['pending', 'sent'])
      .single()
    if (error || !req) { setError('This survey link is invalid or has already been completed.'); setLoading(false); return }
    setRequest(req)
    const [{ data: bat }, { data: insts }] = await Promise.all([
      supabase.from('batteries').select('*').eq('id', req.battery_id).single(),
      supabase.from('instruments').select('*').eq('is_active', true),
    ])
    setBattery(bat)
    if (bat && insts) {
      const ordered = bat.instrument_ids.map(iid => insts.find(i => i.id === iid)).filter(Boolean) as Instrument[]
      setInstruments(ordered)
    }
    setLoading(false)
  }

  const needsDemographics = request?.demographics_entry === 'patient'
  const totalSteps = (needsDemographics ? 1 : 0) + instruments.length
  const currentInstrumentIndex = needsDemographics ? step - 1 : step
  const currentInstrument = instruments[currentInstrumentIndex]

  function getQuestions(inst: Instrument) {
    return (inst.questions as Record<string, any> | null | undefined)?.[lang]
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
    if (needsDemographics && request) {
      await supabase.from('patients').update({
        first_name: demographics.first_name,
        last_name: demographics.last_name,
        date_of_birth: demographics.date_of_birth,
        gender: demographics.gender,
        preferred_language: demographics.preferred_language,
      }).eq('id', request.patient_id)
    }
    for (const inst of instruments) {
      const key = inst.scoring_config_key
      const instResp = responses[key] ?? {}
      try {
        const scored = scoreInstrument(key, instResp, inst)
        await supabase.from('survey_responses').insert({
          survey_request_id: request!.id,
          patient_id: request!.patient_id,
          instrument_id: inst.id,
          raw_responses: instResp,
          raw_score: scored.rawScore,
          t_score: scored.tScore ?? null,
          standard_error: scored.standardError ?? null,
          total_score: scored.totalScore ?? null,
          severity_label: scored.severityLabel,
          subscale_scores: scored.subscaleScores ?? null,
        })
      } catch (e) { console.error('Scoring error for', key, e) }
    }
    await supabase.from('survey_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', request!.id)
    setCompleted(true)
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

  return (
    <>
      <Head>
        <title>{lang === 'es' ? 'Encuesta - Evaluacion del Dolor' : 'Survey - Pain Evaluation'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-gray-50">
        <div style={{ backgroundColor: '#1F4E79' }} className="text-white px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-semibold text-sm opacity-80">
              {lang === 'es' ? 'Evaluacion Multidisciplinaria del Dolor' : 'Multidisciplinary Pain Evaluation'}
            </h1>
            <div className="mt-2 h-1.5 bg-white/20 rounded-full">
              <div className="h-1.5 bg-white rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between text-xs opacity-60 mt-1">
              <span>{lang === 'es' ? `Paso ${step + 1} de ${totalSteps}` : `Step ${step + 1} of ${totalSteps}`}</span>
              <span>{progressPct}%</span>
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
        </div>
      </div>
    </>
  )
}
