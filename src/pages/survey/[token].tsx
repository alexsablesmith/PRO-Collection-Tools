import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { scoreInstrument } from '@/config/scoring'
import type { SurveyRequest, Battery, Instrument } from '@/types/database'

// Survey questions (English + Spanish)
// Full validated translations would be loaded here
// This is a structural placeholder showing the architecture

const SURVEY_QUESTIONS: Record<string, {
  en: { title: string; timeframe?: string; items: { id: string; text: string }[]; options: { value: number; label: string }[] }
  es: { title: string; timeframe?: string; items: { id: string; text: string }[]; options: { value: number; label: string }[] }
}> = {
  promis_physical_function_4a_v2: {
    en: {
      title: 'Physical Function',
      items: [
        { id: 'pf1', text: 'Does your health now limit you in doing vigorous activities, such as running, lifting heavy objects, participating in strenuous sports?' },
        { id: 'pf2', text: 'Does your health now limit you in doing moderate activities, such as moving a table, pushing a vacuum cleaner, bowling, or playing golf?' },
        { id: 'pf3', text: 'Does your health now limit you in lifting or carrying groceries?' },
        { id: 'pf4', text: 'Does your health now limit you in climbing several flights of stairs?' },
      ],
      options: [
        { value: 5, label: 'Without any difficulty' },
        { value: 4, label: 'With a little difficulty' },
        { value: 3, label: 'With some difficulty' },
        { value: 2, label: 'With much difficulty' },
        { value: 1, label: 'Unable to do' },
      ],
    },
    es: {
      title: 'Función Física',
      items: [
        { id: 'pf1', text: '¿Su salud actual le limita para hacer actividades vigorosas, tales como correr, levantar objetos pesados, o participar en deportes agotadores?' },
        { id: 'pf2', text: '¿Su salud actual le limita para hacer actividades moderadas, como mover una mesa, empujar una aspiradora, jugar al boliche, o jugar al golf?' },
        { id: 'pf3', text: '¿Su salud actual le limita para cargar el mandado?' },
        { id: 'pf4', text: '¿Su salud actual le limita para subir varios pisos de escaleras?' },
      ],
      options: [
        { value: 5, label: 'Sin ninguna dificultad' },
        { value: 4, label: 'Con poca dificultad' },
        { value: 3, label: 'Con alguna dificultad' },
        { value: 2, label: 'Con mucha dificultad' },
        { value: 1, label: 'No puedo hacerlo' },
      ],
    },
  },
  promis_anxiety_4a_v1: {
    en: {
      title: 'Anxiety',
      timeframe: 'In the past 7 days...',
      items: [
        { id: 'anx1', text: 'I felt fearful.' },
        { id: 'anx2', text: 'I found it hard to focus on anything other than my anxiety.' },
        { id: 'anx3', text: 'My worries overwhelmed me.' },
        { id: 'anx4', text: 'I felt uneasy.' },
      ],
      options: [
        { value: 1, label: 'Never' },
        { value: 2, label: 'Rarely' },
        { value: 3, label: 'Sometimes' },
        { value: 4, label: 'Often' },
        { value: 5, label: 'Always' },
      ],
    },
    es: {
      title: 'Ansiedad',
      timeframe: 'En los últimos 7 días...',
      items: [
        { id: 'anx1', text: 'Me sentí temeroso/a.' },
        { id: 'anx2', text: 'Me fue difícil enfocarme en algo más que no fuera mi ansiedad.' },
        { id: 'anx3', text: 'Mis preocupaciones me abrumaron.' },
        { id: 'anx4', text: 'Me sentí intranquilo/a.' },
      ],
      options: [
        { value: 1, label: 'Nunca' },
        { value: 2, label: 'Raramente' },
        { value: 3, label: 'A veces' },
        { value: 4, label: 'A menudo' },
        { value: 5, label: 'Siempre' },
      ],
    },
  },
  phq9: {
    en: {
      title: 'Depression Screen (PHQ-9)',
      timeframe: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
      items: [
        { id: 'phq_1',  text: 'Little interest or pleasure in doing things' },
        { id: 'phq_2',  text: 'Feeling down, depressed, or hopeless' },
        { id: 'phq_3',  text: 'Trouble falling or staying asleep, or sleeping too much' },
        { id: 'phq_4',  text: 'Feeling tired or having little energy' },
        { id: 'phq_5',  text: 'Poor appetite or overeating' },
        { id: 'phq_6',  text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down' },
        { id: 'phq_7',  text: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
        { id: 'phq_8',  text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual' },
        { id: 'phq_9',  text: 'Thoughts that you would be better off dead, or of hurting yourself in some way' },
      ],
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    es: {
      title: 'Cuestionario de Salud del Paciente (PHQ-9)',
      timeframe: 'Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?',
      items: [
        { id: 'phq_1',  text: 'Poco interés o placer en hacer las cosas' },
        { id: 'phq_2',  text: 'Sentirse desanimado/a, deprimido/a, o sin esperanza' },
        { id: 'phq_3',  text: 'Problemas para quedarse dormido/a o dormir demasiado' },
        { id: 'phq_4',  text: 'Sentirse cansado/a o con poca energía' },
        { id: 'phq_5',  text: 'Poco apetito o comer en exceso' },
        { id: 'phq_6',  text: 'Sentirse mal consigo mismo/a, o que es un fracaso, o que ha quedado mal consigo mismo/a o con su familia' },
        { id: 'phq_7',  text: 'Problemas para concentrarse en cosas tales como leer el periódico o ver televisión' },
        { id: 'phq_8',  text: 'Moverse o hablar tan lento que otras personas lo habrían notado, o lo contrario' },
        { id: 'phq_9',  text: 'Pensamientos de que estaría mejor muerto/a, o de que se haría daño de alguna manera' },
      ],
      options: [
        { value: 0, label: 'Para nada' },
        { value: 1, label: 'Varios días' },
        { value: 2, label: 'Más de la mitad de los días' },
        { value: 3, label: 'Casi todos los días' },
      ],
    },
  },
  gad7: {
    en: {
      title: 'Anxiety Screen (GAD-7)',
      timeframe: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
      items: [
        { id: 'gad_1', text: 'Feeling nervous, anxious, or on edge' },
        { id: 'gad_2', text: 'Not being able to stop or control worrying' },
        { id: 'gad_3', text: 'Worrying too much about different things' },
        { id: 'gad_4', text: 'Trouble relaxing' },
        { id: 'gad_5', text: 'Being so restless that it is hard to sit still' },
        { id: 'gad_6', text: 'Becoming easily annoyed or irritable' },
        { id: 'gad_7', text: 'Feeling afraid as if something awful might happen' },
      ],
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    es: {
      title: 'Trastorno de Ansiedad Generalizada (GAD-7)',
      timeframe: 'Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?',
      items: [
        { id: 'gad_1', text: 'Sentirse nervioso/a, ansioso/a, o al límite' },
        { id: 'gad_2', text: 'No poder dejar de preocuparse o no poder controlar la preocupación' },
        { id: 'gad_3', text: 'Preocuparse demasiado por diversas cosas' },
        { id: 'gad_4', text: 'Problemas para relajarse' },
        { id: 'gad_5', text: 'Estar tan inquieto/a que resulta difícil quedarse quieto/a' },
        { id: 'gad_6', text: 'Molestarse o ponerse irritable fácilmente' },
        { id: 'gad_7', text: 'Sentir miedo, como si algo terrible fuera a pasar' },
      ],
      options: [
        { value: 0, label: 'Para nada' },
        { value: 1, label: 'Varios días' },
        { value: 2, label: 'Más de la mitad de los días' },
        { value: 3, label: 'Casi todos los días' },
      ],
    },
  },
  tsk11: {
    en: {
      title: 'Tampa Scale for Kinesiophobia',
      timeframe: 'Please indicate how much you agree with each of the following statements.',
      items: [
        { id: 'tsk_1',  text: 'I\'m afraid that I might injure myself if I exercise.' },
        { id: 'tsk_2',  text: 'If I were to try to overcome it, my pain would increase.' },
        { id: 'tsk_3',  text: 'My body is telling me I have something dangerously wrong.' },
        { id: 'tsk_4',  text: 'My pain would probably be relieved if I were to exercise.' },
        { id: 'tsk_5',  text: 'People aren\'t taking my medical condition seriously enough.' },
        { id: 'tsk_6',  text: 'My accident has put my body at risk for the rest of my life.' },
        { id: 'tsk_7',  text: 'Pain always means I have injured my body.' },
        { id: 'tsk_8',  text: 'Just because something aggravates my pain does not mean it is dangerous.' },
        { id: 'tsk_9',  text: 'I am afraid that I might accidentally do something to make my pain worse.' },
        { id: 'tsk_10', text: 'Simply being careful that I do not make any unnecessary movements is the safest thing I can do to prevent my pain from worsening.' },
        { id: 'tsk_11', text: 'I wouldn\'t have this much pain if something wasn\'t terribly wrong with my body.' },
      ],
      options: [
        { value: 1, label: 'Strongly Disagree' },
        { value: 2, label: 'Disagree' },
        { value: 3, label: 'Agree' },
        { value: 4, label: 'Strongly Agree' },
      ],
    },
    es: {
      title: 'Escala de Tampa para la Kinesiofobia',
      timeframe: 'Por favor indique cuánto está de acuerdo con cada una de las siguientes afirmaciones.',
      items: [
        { id: 'tsk_1',  text: 'Me da miedo que me pueda lastimar si hago ejercicio.' },
        { id: 'tsk_2',  text: 'Si tratara de superarlo, mi dolor aumentaría.' },
        { id: 'tsk_3',  text: 'Mi cuerpo me dice que tengo algo peligrosamente malo.' },
        { id: 'tsk_4',  text: 'Probablemente mi dolor se aliviaría si hiciera ejercicio.' },
        { id: 'tsk_5',  text: 'La gente no toma mi condición médica suficientemente en serio.' },
        { id: 'tsk_6',  text: 'Mi accidente ha puesto mi cuerpo en riesgo por el resto de mi vida.' },
        { id: 'tsk_7',  text: 'El dolor siempre significa que he lastimado mi cuerpo.' },
        { id: 'tsk_8',  text: 'El hecho de que algo agrave mi dolor no significa que sea peligroso.' },
        { id: 'tsk_9',  text: 'Tengo miedo de hacer algo accidentalmente que empeore mi dolor.' },
        { id: 'tsk_10', text: 'Simplemente ser cuidadoso de no hacer movimientos innecesarios es lo más seguro que puedo hacer.' },
        { id: 'tsk_11', text: 'No tendría tanto dolor si algo no estuviera terriblemente mal en mi cuerpo.' },
      ],
      options: [
        { value: 1, label: 'Muy en desacuerdo' },
        { value: 2, label: 'En desacuerdo' },
        { value: 3, label: 'De acuerdo' },
        { value: 4, label: 'Muy de acuerdo' },
      ],
    },
  },
  pcs: {
    en: {
      title: 'Pain Catastrophizing Scale',
      timeframe: 'When I have pain, I think about it in the following ways. Please indicate the degree to which you have these thoughts and feelings.',
      items: [
        { id: 'pcs_1',  text: 'I worry all the time about whether the pain will end.' },
        { id: 'pcs_2',  text: 'I feel I can\'t go on.' },
        { id: 'pcs_3',  text: 'It\'s terrible and I think it\'s never going to get any better.' },
        { id: 'pcs_4',  text: 'It\'s awful and I feel that it overwhelms me.' },
        { id: 'pcs_5',  text: 'I feel I can\'t stand it anymore.' },
        { id: 'pcs_6',  text: 'I become afraid that the pain will get worse.' },
        { id: 'pcs_7',  text: 'I keep thinking of other painful events.' },
        { id: 'pcs_8',  text: 'I anxiously want the pain to go away.' },
        { id: 'pcs_9',  text: 'I can\'t seem to keep it out of my mind.' },
        { id: 'pcs_10', text: 'I keep thinking about how much it hurts.' },
        { id: 'pcs_11', text: 'I keep thinking about how badly I want the pain to stop.' },
        { id: 'pcs_12', text: 'There\'s nothing I can do to reduce the intensity of the pain.' },
        { id: 'pcs_13', text: 'I wonder whether something serious may happen.' },
      ],
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'To a slight degree' },
        { value: 2, label: 'To a moderate degree' },
        { value: 3, label: 'To a great degree' },
        { value: 4, label: 'All the time' },
      ],
    },
    es: {
      title: 'Escala de Catastrofización del Dolor',
      timeframe: 'Cuando tengo dolor, pienso en ello de las siguientes formas. Por favor indique en qué medida tiene estos pensamientos y sentimientos.',
      items: [
        { id: 'pcs_1',  text: 'Me preocupo todo el tiempo de si el dolor terminará.' },
        { id: 'pcs_2',  text: 'Siento que no puedo seguir adelante.' },
        { id: 'pcs_3',  text: 'Es terrible y creo que nunca va a mejorar.' },
        { id: 'pcs_4',  text: 'Es horrible y siento que me abruma.' },
        { id: 'pcs_5',  text: 'Siento que no puedo aguantar más.' },
        { id: 'pcs_6',  text: 'Me da miedo de que el dolor empeore.' },
        { id: 'pcs_7',  text: 'Sigo pensando en otros eventos dolorosos.' },
        { id: 'pcs_8',  text: 'Quiero ansiosamente que el dolor desaparezca.' },
        { id: 'pcs_9',  text: 'No puedo sacarlo de mi mente.' },
        { id: 'pcs_10', text: 'Sigo pensando cuánto me duele.' },
        { id: 'pcs_11', text: 'Sigo pensando cuánto quiero que el dolor se detenga.' },
        { id: 'pcs_12', text: 'No hay nada que pueda hacer para reducir la intensidad del dolor.' },
        { id: 'pcs_13', text: 'Me pregunto si puede ocurrir algo grave.' },
      ],
      options: [
        { value: 0, label: 'Para nada' },
        { value: 1, label: 'En pequeña medida' },
        { value: 2, label: 'En mediana medida' },
        { value: 3, label: 'En gran medida' },
        { value: 4, label: 'Todo el tiempo' },
      ],
    },
  },
  promis_depression_4a_v1: {
    en: {
      title: 'Depression',
      timeframe: 'In the past 7 days...',
      items: [
        { id: 'dep1', text: 'I felt worthless.' },
        { id: 'dep2', text: 'I felt that I had nothing to look forward to.' },
        { id: 'dep3', text: 'I felt helpless.' },
        { id: 'dep4', text: 'I felt sad.' },
      ],
      options: [
        { value: 1, label: 'Never' },
        { value: 2, label: 'Rarely' },
        { value: 3, label: 'Sometimes' },
        { value: 4, label: 'Often' },
        { value: 5, label: 'Always' },
      ],
    },
    es: {
      title: 'Depresión',
      timeframe: 'En los últimos 7 días...',
      items: [
        { id: 'dep1', text: 'Me sentí sin valor.' },
        { id: 'dep2', text: 'Sentí que no tenía nada que esperar con ansias.' },
        { id: 'dep3', text: 'Me sentí indefenso/a.' },
        { id: 'dep4', text: 'Me sentí triste.' },
      ],
      options: [
        { value: 1, label: 'Nunca' },
        { value: 2, label: 'Raramente' },
        { value: 3, label: 'A veces' },
        { value: 4, label: 'A menudo' },
        { value: 5, label: 'Siempre' },
      ],
    },
  },
  promis_fatigue_4a_v1: {
    en: {
      title: 'Fatigue',
      timeframe: 'In the past 7 days...',
      items: [
        { id: 'fat1', text: 'I feel fatigued.' },
        { id: 'fat2', text: 'I have trouble starting things because I am tired.' },
        { id: 'fat3', text: 'How run-down did you feel on average?' },
        { id: 'fat4', text: 'How fatigued were you on average?' },
      ],
      options: [
        { value: 1, label: 'Never' },
        { value: 2, label: 'Rarely' },
        { value: 3, label: 'Sometimes' },
        { value: 4, label: 'Often' },
        { value: 5, label: 'Always' },
      ],
    },
    es: {
      title: 'Fatiga',
      timeframe: 'En los últimos 7 días...',
      items: [
        { id: 'fat1', text: 'Me siento fatigado/a.' },
        { id: 'fat2', text: 'Tengo problemas para empezar cosas porque estoy cansado/a.' },
        { id: 'fat3', text: '¿Qué tan agotado/a se sintió en promedio?' },
        { id: 'fat4', text: '¿Qué tan fatigado/a estuvo en promedio?' },
      ],
      options: [
        { value: 1, label: 'Nunca' },
        { value: 2, label: 'Raramente' },
        { value: 3, label: 'A veces' },
        { value: 4, label: 'A menudo' },
        { value: 5, label: 'Siempre' },
      ],
    },
  },
  promis_sleep_4a_v1: {
    en: {
      title: 'Sleep Disturbance',
      timeframe: 'In the past 7 days...',
      items: [
        { id: 'slp1', text: 'My sleep quality was...' },
        { id: 'slp2', text: 'My sleep was refreshing.' },
        { id: 'slp3', text: 'I had difficulty falling asleep.' },
        { id: 'slp4', text: 'I had difficulty staying asleep.' },
      ],
      options: [
        { value: 1, label: 'Very poor' },
        { value: 2, label: 'Poor' },
        { value: 3, label: 'Fair' },
        { value: 4, label: 'Good' },
        { value: 5, label: 'Very good' },
      ],
    },
    es: {
      title: 'Trastorno del Sueño',
      timeframe: 'En los últimos 7 días...',
      items: [
        { id: 'slp1', text: 'La calidad de mi sueño fue...' },
        { id: 'slp2', text: 'Mi sueño fue reparador.' },
        { id: 'slp3', text: 'Tuve dificultad para quedarme dormido/a.' },
        { id: 'slp4', text: 'Tuve dificultad para mantenerme dormido/a.' },
      ],
      options: [
        { value: 1, label: 'Muy mala' },
        { value: 2, label: 'Mala' },
        { value: 3, label: 'Regular' },
        { value: 4, label: 'Buena' },
        { value: 5, label: 'Muy buena' },
      ],
    },
  },
  promis_social_4a_v1: {
    en: {
      title: 'Ability to Participate in Social Roles and Activities',
      timeframe: 'In the past 7 days...',
      items: [
        { id: 'soc1', text: 'I have trouble doing all of my regular leisure activities with others.' },
        { id: 'soc2', text: 'I have trouble doing all of the family activities that I want to do.' },
        { id: 'soc3', text: 'I have trouble doing all of my usual work.' },
        { id: 'soc4', text: 'I have trouble doing all of my regular social activities with groups of people.' },
      ],
      options: [
        { value: 5, label: 'Never' },
        { value: 4, label: 'Rarely' },
        { value: 3, label: 'Sometimes' },
        { value: 2, label: 'Usually' },
        { value: 1, label: 'Always' },
      ],
    },
    es: {
      title: 'Capacidad para Participar en Roles Sociales y Actividades',
      timeframe: 'En los últimos 7 días...',
      items: [
        { id: 'soc1', text: 'Tengo problemas para hacer todas mis actividades recreativas habituales con otros.' },
        { id: 'soc2', text: 'Tengo problemas para hacer todas las actividades familiares que quiero hacer.' },
        { id: 'soc3', text: 'Tengo problemas para hacer todo mi trabajo habitual.' },
        { id: 'soc4', text: 'Tengo problemas para hacer todas mis actividades sociales habituales en grupo.' },
      ],
      options: [
        { value: 5, label: 'Nunca' },
        { value: 4, label: 'Raramente' },
        { value: 3, label: 'A veces' },
        { value: 2, label: 'Generalmente' },
        { value: 1, label: 'Siempre' },
      ],
    },
  },
  promis_pain_interference_4a_v1: {
    en: {
      title: 'Pain Interference',
      timeframe: 'In the past 7 days, how much did pain interfere with your...',
      items: [
        { id: 'pi1', text: 'Day to day activities' },
        { id: 'pi2', text: 'Work around the home' },
        { id: 'pi3', text: 'Ability to participate in social activities' },
        { id: 'pi4', text: 'Enjoyment of life' },
      ],
      options: [
        { value: 1, label: 'Not at all' },
        { value: 2, label: 'A little bit' },
        { value: 3, label: 'Somewhat' },
        { value: 4, label: 'Quite a bit' },
        { value: 5, label: 'Very much' },
      ],
    },
    es: {
      title: 'Interferencia del Dolor',
      timeframe: 'En los últimos 7 días, ¿cuánto interfirió el dolor con su...',
      items: [
        { id: 'pi1', text: 'Actividades del día a día' },
        { id: 'pi2', text: 'Trabajo en el hogar' },
        { id: 'pi3', text: 'Capacidad para participar en actividades sociales' },
        { id: 'pi4', text: 'Disfrute de la vida' },
      ],
      options: [
        { value: 1, label: 'Para nada' },
        { value: 2, label: 'Un poco' },
        { value: 3, label: 'Algo' },
        { value: 4, label: 'Bastante' },
        { value: 5, label: 'Muchísimo' },
      ],
    },
  },pain_nrs: {
    en: {
      title: 'Pain Intensity',
      items: [{ id: 'nrs', text: 'On average, how would you rate your pain over the past 7 days?' }],
      options: Array.from({ length: 11 }, (_, i) => ({
        value: i,
        label: i === 0 ? '0 — No pain' : i === 10 ? '10 — Worst pain imaginable' : String(i),
      })),
    },
    es: {
      title: 'Intensidad del Dolor',
      items: [{ id: 'nrs', text: '¿Cómo calificaría su dolor en promedio durante los últimos 7 días?' }],
      options: Array.from({ length: 11 }, (_, i) => ({
        value: i,
        label: i === 0 ? '0 — Sin dolor' : i === 10 ? '10 — El peor dolor imaginable' : String(i),
      })),
    },
  },
}

export default function SurveyPage() {
  const router = useRouter()
  const { token } = router.query as { token: string }

  const [request,     setRequest]     = useState<SurveyRequest | null>(null)
  const [battery,     setBattery]     = useState<Battery | null>(null)
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  const [step,        setStep]        = useState(0)  // 0 = demographics (if needed), then 1..n = instruments
  const [demographics,setDemographics]= useState({ first_name:'', last_name:'', date_of_birth:'', gender:'', preferred_language:'en' })
  const [responses,   setResponses]   = useState<Record<string, Record<string, number>>>({})
  const [submitting,  setSubmitting]  = useState(false)
  const [completed,   setCompleted]   = useState(false)

  const lang = (request?.language ?? 'en') as 'en' | 'es'

  useEffect(() => {
    if (token) loadSurvey()
  }, [token])

  async function loadSurvey() {
    const { data: req, error } = await supabase
      .from('survey_requests')
      .select('*')
      .eq('token', token)
      .in('status', ['pending','sent'])
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

  function setItemResponse(instrumentKey: string, itemId: string, value: number) {
    setResponses(r => ({
      ...r,
      [instrumentKey]: { ...(r[instrumentKey] ?? {}), [itemId]: value }
    }))
  }

  function isCurrentComplete(): boolean {
    if (step === 0 && needsDemographics) {
      return !!(demographics.first_name && demographics.last_name && demographics.date_of_birth)
    }
    if (!currentInstrument) return false
    const key = currentInstrument.scoring_config_key
    const questions = SURVEY_QUESTIONS[key]?.[lang]
    if (!questions) return true
    const answered = responses[key] ?? {}
    return questions.items.every(item => answered[item.id] !== undefined)
  }

  async function handleSubmit() {
    setSubmitting(true)

    // Update patient demographics if patient entered them
    if (needsDemographics && request) {
      await supabase.from('patients').update({
        first_name: demographics.first_name,
        last_name:  demographics.last_name,
        date_of_birth: demographics.date_of_birth,
        gender:     demographics.gender,
        preferred_language: demographics.preferred_language,
      }).eq('id', request.patient_id)
    }

    // Score and save each instrument response
    for (const inst of instruments) {
      const key      = inst.scoring_config_key
      const instResp = responses[key] ?? {}
      try {
        const scored = scoreInstrument(key, instResp)
        await supabase.from('survey_responses').insert({
          survey_request_id: request!.id,
          patient_id:        request!.patient_id,
          instrument_id:     inst.id,
          raw_responses:     instResp,
          raw_score:         scored.rawScore,
          t_score:           scored.tScore ?? null,
          standard_error:    scored.standardError ?? null,
          total_score:       scored.totalScore ?? null,
          severity_label:    scored.severityLabel,
          subscale_scores:   scored.subscaleScores ?? null,
        })
      } catch(e) {
        console.error('Scoring error for', key, e)
      }
    }

    // Mark survey completed
    await supabase.from('survey_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', request!.id)

    setCompleted(true)
    setSubmitting(false)
  }

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-navy-DEFAULT rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading survey...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
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
          <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">
            {lang === 'es' ? '¡Gracias!' : 'Thank You!'}
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
        <title>{lang === 'es' ? 'Encuesta — Evaluación del Dolor' : 'Survey — Pain Evaluation'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-navy-DEFAULT text-white px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-semibold text-sm opacity-80">
              {lang === 'es' ? 'Evaluación Multidisciplinaria del Dolor' : 'Multidisciplinary Pain Evaluation'}
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

          {/* Demographics step */}
          {step === 0 && needsDemographics && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {lang === 'es' ? 'Información Personal' : 'Personal Information'}
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
                  <label className="label">{lang === 'es' ? 'Género' : 'Gender'}</label>
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

          {/* Instrument steps */}
          {(step > 0 || !needsDemographics) && currentInstrument && (() => {
            const key       = currentInstrument.scoring_config_key
            const questions = SURVEY_QUESTIONS[key]?.[lang]
            if (!questions) return <div className="card"><p className="text-gray-500">Survey questions not available for this instrument.</p></div>
            const instResp  = responses[key] ?? {}

            return (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">{questions.title}</h2>
                {questions.timeframe && <p className="text-sm text-gray-500 mb-5 italic">{questions.timeframe}</p>}

                {/* NRS special UI */}
                {key === 'pain_nrs' ? (
                  <div className="card">
                    <p className="text-gray-700 mb-4">{questions.items[0].text}</p>
                    <div className="grid grid-cols-11 gap-1">
                      {questions.options.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setItemResponse(key, 'nrs', opt.value)}
                          className={`py-3 rounded-lg text-sm font-bold transition-colors ${instResp['nrs'] === opt.value ? 'bg-navy-DEFAULT text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
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
                ) : (
                  <div className="space-y-4">
                    {questions.items.map((item, qi) => (
                      <div key={item.id} className={`card border ${instResp[item.id] !== undefined ? 'border-blue-200' : 'border-gray-100'}`}>
                        <p className="text-sm text-gray-800 mb-3 font-medium">{qi + 1}. {item.text}</p>
                        <div className="space-y-1.5">
                          {questions.options.map(opt => (
                            <label key={opt.value} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${instResp[item.id] === opt.value ? 'bg-ltblue border border-blue-300' : 'hover:bg-gray-50 border border-transparent'}`}>
                              <input
                                type="radio"
                                name={`${key}_${item.id}`}
                                checked={instResp[item.id] === opt.value}
                                onChange={() => setItemResponse(key, item.id, opt.value)}
                                className="sr-only"
                              />
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${instResp[item.id] === opt.value ? 'border-navy-DEFAULT' : 'border-gray-300'}`}>
                                {instResp[item.id] === opt.value && <div className="w-2 h-2 rounded-full bg-navy-DEFAULT" />}
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

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            {step > 0 ? (
              <button onClick={() => setStep(s => s - 1)} className="btn-secondary">
                {lang === 'es' ? '← Anterior' : '← Back'}
              </button>
            ) : <div />}

            {step < totalSteps - 1 ? (
              <button
                onClick={() => { setStep(s => s + 1); window.scrollTo(0, 0); }}
                disabled={!isCurrentComplete()}
                className="btn-primary"
              >
                {lang === 'es' ? 'Siguiente →' : 'Next →'}
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
