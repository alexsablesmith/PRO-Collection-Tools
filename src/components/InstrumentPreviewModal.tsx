import { useState } from 'react'
import { SURVEY_QUESTIONS, type QuestionDef } from '@/config/surveyQuestions'
import type { Instrument } from '@/types/database'

interface Props {
  instrument: Instrument
  onClose: () => void
}

export default function InstrumentPreviewModal({ instrument, onClose }: Props) {
  const questionData: Record<string, QuestionDef> =
    (instrument.questions as Record<string, QuestionDef> | null | undefined) ??
    SURVEY_QUESTIONS[instrument.scoring_config_key] ??
    {}

  const availableLangs = Object.keys(questionData)
  const [lang, setLang] = useState(availableLangs[0] ?? 'en')
  const def = questionData[lang]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">{instrument.name}</h2>
            {instrument.version && <p className="text-xs text-gray-400">{instrument.version}</p>}
          </div>
          <div className="flex items-center gap-3">
            {availableLangs.length > 1 && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {availableLangs.map(l => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-3 py-1.5 font-medium transition-colors ${lang === l ? 'bg-navy-DEFAULT text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                    style={lang === l ? { backgroundColor: '#1F4E79' } : {}}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          {!def ? (
            <p className="text-gray-500 text-sm">No question data available for this instrument.</p>
          ) : (
            <>
              {def.timeframe && (
                <p className="text-sm italic text-gray-500 border-l-4 border-blue-200 pl-3">{def.timeframe}</p>
              )}

              {/* Response options legend */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Response Options</p>
                <div className="flex flex-wrap gap-2">
                  {def.options.map(opt => (
                    <span key={opt.value} className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-1">
                      <span className="font-medium">{opt.value}</span> — {opt.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Items ({def.items.length})
                </p>
                <ol className="space-y-2">
                  {def.items.map((item, i) => (
                    <li key={item.id} className="flex gap-3 text-sm">
                      <span className="flex-shrink-0 w-6 text-gray-400 font-medium text-right">{i + 1}.</span>
                      <div>
                        <span className="text-gray-800">{item.text}</span>
                        {item.options && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.options.map(o => (
                              <span key={o.value} className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                                {o.value} — {o.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 text-right">
          <button onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}
