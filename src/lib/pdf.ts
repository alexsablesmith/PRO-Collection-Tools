/**
 * PDF Report Generator
 * Wraps the jsPDF-based report generation for use inside the Next.js app.
 * The full PDF generation logic is the same as the standalone HTML app.
 */

import type { Patient, SurveyResponse, SurveyRequest, Instrument } from '@/types/database'
import { INSTRUMENT_META } from '@/config/scoring'
import { format, parseISO } from 'date-fns'

interface VisitData {
  request:   SurveyRequest
  responses: (SurveyResponse & { instrument: Instrument })[]
}

export async function buildPatientPDF(patient: Patient, visits: VisitData[]) {
  // Dynamically import jsPDF (browser only)
  const { jsPDF } = await import('jspdf')

  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const NAVY   = [31, 78, 121]
  const BLUE   = [46, 117, 182]
  const LTBLUE = [235, 243, 251]
  const HDRBG  = [214, 228, 240]
  const GRAY   = [120, 120, 120]
  const WHITE  = [255, 255, 255]
  const ALT    = [245, 245, 245]

  const PW=612, PH=792, ML=50, MR=50, CW=512, BOT=54
  let y = 50

  const nVisits    = visits.length
  const visitDates = visits.map(v => v.request.completed_at ? format(parseISO(v.request.completed_at), 'MMM d, yyyy') : '')

  const VISIT_COLORS = [[31,78,121],[46,117,182],[231,76,60]]

  const safe = (s: any) => String(s||'').replace(/[^\x00-\x7F]/g, '?')
  const fmtT = (x: any) => (x != null && !isNaN(parseFloat(x))) ? parseFloat(x).toFixed(1) : 'N/A'
  const fmtI = (x: any) => (x != null && !isNaN(Number(x))) ? String(Math.round(Number(x))) : 'N/A'

  function checkPage(needed: number) { if (y + needed > PH - BOT) { pdf.addPage(); y = 50 } }
  function fillRect(x: number, ry: number, w: number, h: number, clr: number[]) { pdf.setFillColor(clr[0],clr[1],clr[2]); pdf.rect(x,ry,w,h,'F') }
  function setClr(clr: number[]) { pdf.setTextColor(clr[0],clr[1],clr[2]) }

  function sectionHead(text: string) {
    checkPage(30); y += 16
    pdf.setFont('helvetica','bold'); pdf.setFontSize(11); setClr(NAVY)
    pdf.text(safe(text.toUpperCase()), ML, y)
    y += 5; pdf.setDrawColor(NAVY[0],NAVY[1],NAVY[2]); pdf.setLineWidth(1.5); pdf.line(ML,y,ML+CW,y)
    y += 8; setClr([0,0,0])
  }

  function italicNote(text: string) {
    pdf.setFont('helvetica','italic'); pdf.setFontSize(8.5); setClr(GRAY)
    const lines = pdf.splitTextToSize(safe(text), CW)
    const bh = lines.length * 11 + 4; checkPage(bh)
    pdf.text(lines, ML, y); y += bh; setClr([0,0,0]); pdf.setFont('helvetica','normal')
  }

  function interpPromis(t: number, hib: boolean) {
    if (hib) return t>=45?'Within Normal Limits':t>=40?'Mild limitation':t>=30?'Moderate limitation':'Severe limitation'
    return t<55?'Within Normal Limits':t<60?'Mild':t<70?'Moderate':'Severe'
  }
  const phq9Sev  = (s: number) => s<=4?'None-Minimal':s<=9?'Mild':s<=14?'Moderate':s<=19?'Moderately Severe':'Severe'
  const gad7Sev  = (s: number) => s<=4?'Minimal':s<=9?'Mild':s<=14?'Moderate':'Severe'
  const tskInterp= (s: number) => s>=37?'Elevated kinesiophobia (>=37)':'Within normal range (<37)'
  const pcsInterp= (s: number) => s>=30?'Clinically significant (>=30)':'Below clinical threshold (<30)'

  function drawTable(headers: string[], colWidths: number[], dataRows: string[][]) {
    const HDR_H=22, ROW_H=20, PAD=5, totalW=colWidths.reduce((a,b)=>a+b,0)
    checkPage(HDR_H + ROW_H)
    const tblY = y
    fillRect(ML,tblY,totalW,HDR_H,HDRBG)
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); setClr(NAVY)
    let cx=ML
    headers.forEach((h,i) => {
      i===0?pdf.text(safe(h),cx+PAD,tblY+14):pdf.text(safe(h),cx+colWidths[i]/2,tblY+14,{align:'center'})
      cx+=colWidths[i]
    })
    y = tblY+HDR_H
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5)
    dataRows.forEach((cells,ri) => {
      const col0Lines = pdf.splitTextToSize(safe(String(cells[0]||'')), colWidths[0]-PAD*2)
      const thisRowH = Math.max(ROW_H, col0Lines.length*11+8)
      checkPage(thisRowH+2)
      fillRect(ML,y,totalW,thisRowH,ri%2===0?WHITE:ALT)
      setClr([30,30,30])
      let cx2=ML
      cells.forEach((cell,ci) => {
        const txt=safe(String(cell??''))
        if(ci===0){const ls=pdf.splitTextToSize(txt,colWidths[ci]-PAD*2);pdf.text(ls,cx2+PAD,y+13)}
        else pdf.text(txt,cx2+colWidths[ci]/2,y+13,{align:'center'})
        cx2+=colWidths[ci]
      })
      y+=thisRowH
    })
    const tblH=y-tblY
    pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,totalW,tblH)
    cx=ML; for(let i=0;i<colWidths.length-1;i++){cx+=colWidths[i];pdf.line(cx,tblY,cx,tblY+tblH)}
    let dY=tblY+HDR_H; for(let i=0;i<dataRows.length-1;i++){dY+=Math.max(ROW_H,20);pdf.line(ML,dY,ML+totalW,dY)}
    y+=6
  }

  // ── Build PDF ──────────────────────────────────────────────

  // Title
  pdf.setFont('helvetica','bold'); pdf.setFontSize(17); setClr(NAVY)
  pdf.text('MULTIDISCIPLINARY PAIN EVALUATION',PW/2,y,{align:'center'}); y+=20
  pdf.setFont('helvetica','normal'); pdf.setFontSize(12); setClr(BLUE)
  pdf.text('Patient Survey Results Report',PW/2,y,{align:'center'}); y+=20

  // Demographics
  const DC=[110,146,110,146], demoTW=DC.reduce((a,b)=>a+b,0), DEMO_H=20
  const reportDate = format(new Date(), 'MMMM d, yyyy')
  const dob = patient.date_of_birth ? format(parseISO(patient.date_of_birth), 'MMMM d, yyyy') : ''
  const demoRows = [
    ['Patient Name',`${patient.first_name} ${patient.last_name}`,'Date of Report',reportDate],
    ['Date of Birth',dob,'Gender',patient.gender||''],
    ['Preferred Language',patient.preferred_language==='es'?'Spanish':'English','',''],
  ]
  demoRows.forEach(cells => {
    fillRect(ML,y,DC[0],DEMO_H,LTBLUE); fillRect(ML+DC[0],y,DC[1],DEMO_H,WHITE)
    fillRect(ML+DC[0]+DC[1],y,DC[2],DEMO_H,LTBLUE); fillRect(ML+DC[0]+DC[1]+DC[2],y,DC[3],DEMO_H,WHITE)
    let cx=ML
    cells.forEach((cell,ci) => {
      const isL=ci===0||ci===2
      pdf.setFont('helvetica',isL?'bold':'normal'); pdf.setFontSize(8.5); setClr(isL?NAVY:[30,30,30])
      pdf.text(safe(String(cell)),cx+5,y+13); cx+=DC[ci]
    })
    y+=DEMO_H
  })
  pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5)
  pdf.rect(ML,y-demoRows.length*DEMO_H,demoTW,demoRows.length*DEMO_H)
  let dcx=ML;[DC[0],DC[1],DC[2]].forEach(w=>{dcx+=w;pdf.line(dcx,y-demoRows.length*DEMO_H,dcx,y)})
  for(let i=1;i<demoRows.length;i++) pdf.line(ML,y-demoRows.length*DEMO_H+i*DEMO_H,ML+demoTW,y-demoRows.length*DEMO_H+i*DEMO_H)
  y+=14

  if(nVisits>1){
    pdf.setFont('helvetica','italic'); pdf.setFontSize(8.5); setClr(GRAY)
    pdf.text(`Report includes ${nVisits} visits: ${visitDates.join(', ')}`,ML,y); y+=14
  }

  // ── PROMIS ──
  sectionHead('PROMIS Domain Scores')
  italicNote('PROMIS T-scores normed to US general population (mean=50, SD=10). For symptom scales, higher T = more symptoms. For Physical Function and Social Roles, higher T = better function.')

  const PROMIS_CONFIGS = [
    {label:'Physical Function',          rawKey:'promis_physical_function_4a_v2', hib:true },
    {label:'Anxiety',                    rawKey:'promis_anxiety_4a_v1',           hib:false},
    {label:'Depression',                 rawKey:'promis_depression_4a_v1',        hib:false},
    {label:'Fatigue',                    rawKey:'promis_fatigue_4a_v1',           hib:false},
    {label:'Sleep Disturbance',          rawKey:'promis_sleep_4a_v1',             hib:false},
    {label:'Social Roles & Activities',  rawKey:'promis_social_4a_v1',            hib:true },
    {label:'Pain Interference',          rawKey:'promis_pain_interference_4a_v1', hib:false},
  ]

  if(nVisits===1){
    const visit=visits[0]
    const promisRows=PROMIS_CONFIGS.map(cfg=>{
      const resp=visit.responses.find(r=>r.instrument?.scoring_config_key===cfg.rawKey)
      const t=resp?.t_score??0
      return [cfg.label, fmtI(resp?.raw_score), fmtT(resp?.t_score), interpPromis(t,cfg.hib)]
    })
    drawTable(['PROMIS Domain','Raw Score','T-Score','Interpretation'],[180,62,62,208],promisRows)
  } else {
    // Multi-visit PROMIS table
    const DOM_W=130, RAW_W=36, T_W=42
    const remaining=CW-DOM_W-nVisits*(RAW_W+T_W)
    const INT_W=Math.floor(remaining/nVisits)
    const totalW=DOM_W+nVisits*(RAW_W+T_W+INT_W)
    const HDR_H=22, SUB_H=18, ROW_H=19, PAD=4
    checkPage(HDR_H+SUB_H+7*ROW_H+4)
    const tblY=y
    fillRect(ML,tblY,totalW,HDR_H,HDRBG)
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); setClr(NAVY)
    pdf.text('PROMIS Domain',ML+PAD,tblY+14)
    let vx=ML+DOM_W
    visits.forEach((_,vi)=>{
      const vw=RAW_W+T_W+INT_W
      const tint=VISIT_COLORS[vi].map(c=>Math.min(255,c+160))
      fillRect(vx,tblY,vw,HDR_H,tint)
      pdf.setTextColor(VISIT_COLORS[vi][0],VISIT_COLORS[vi][1],VISIT_COLORS[vi][2])
      pdf.text(safe(visitDates[vi]),vx+vw/2,tblY+14,{align:'center'})
      vx+=vw
    })
    const subY=tblY+HDR_H
    fillRect(ML,subY,totalW,SUB_H,HDRBG)
    pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); setClr(NAVY)
    vx=ML+DOM_W
    visits.forEach(()=>{
      pdf.text('Raw',vx+RAW_W/2,subY+12,{align:'center'})
      pdf.text('T',vx+RAW_W+T_W/2,subY+12,{align:'center'})
      pdf.text('Interpretation',vx+RAW_W+T_W+INT_W/2,subY+12,{align:'center'})
      vx+=RAW_W+T_W+INT_W
    })
    y=subY+SUB_H
    pdf.setFont('helvetica','normal'); pdf.setFontSize(8); setClr([30,30,30])
    PROMIS_CONFIGS.forEach((cfg,ri)=>{
      checkPage(ROW_H+2)
      fillRect(ML,y,totalW,ROW_H,ri%2===0?WHITE:ALT)
      setClr([30,30,30]); pdf.text(safe(cfg.label),ML+PAD,y+13)
      vx=ML+DOM_W
      visits.forEach((visit,vi)=>{
        const resp=visit.responses.find(r=>r.instrument?.scoring_config_key===cfg.rawKey)
        const t=resp?.t_score??0
        pdf.text(fmtI(resp?.raw_score),vx+RAW_W/2,y+13,{align:'center'})
        pdf.text(fmtT(resp?.t_score),vx+RAW_W+T_W/2,y+13,{align:'center'})
        pdf.setFontSize(7.5)
        pdf.text(pdf.splitTextToSize(safe(interpPromis(t,cfg.hib)),INT_W-PAD*2),vx+RAW_W+T_W+PAD,y+12)
        pdf.setFontSize(8); vx+=RAW_W+T_W+INT_W
      })
      y+=ROW_H
    })
    const tblH=y-tblY
    pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,totalW,tblH)
    const vLines=[ML+DOM_W]; let tmpx=ML+DOM_W
    visits.forEach(()=>{tmpx+=RAW_W;vLines.push(tmpx);tmpx+=T_W;vLines.push(tmpx);tmpx+=INT_W;vLines.push(tmpx)})
    vLines.forEach(lx=>{if(lx<ML+totalW)pdf.line(lx,tblY,lx,tblY+tblH)})
    pdf.line(ML,tblY+HDR_H,ML+totalW,tblY+HDR_H)
    pdf.line(ML,tblY+HDR_H+SUB_H,ML+totalW,tblY+HDR_H+SUB_H)
    y+=6
  }
  y+=4

  // ── Scale tables helper ──
  function drawScaleTable(name: string, maxVal: number, scoresArr: number[], interpsArr: string[]) {
    const HDR_H=22, ROW_H=20, PAD=5
    checkPage(HDR_H+ROW_H+4)
    if(nVisits===1){
      drawTable(['Scale','Score','Maximum','Interpretation'],[110,80,80,242],[[name,String(scoresArr[0]),String(maxVal),safe(interpsArr[0])]])
    } else {
      const SCALE_W=90,MAX_W=44,SCR_W=54
      const INT_W=Math.floor((CW-SCALE_W-MAX_W-nVisits*SCR_W)/nVisits)
      const tW=SCALE_W+MAX_W+nVisits*(SCR_W+INT_W), tblY=y
      fillRect(ML,tblY,tW,HDR_H,HDRBG)
      pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); setClr(NAVY)
      pdf.text('Scale',ML+PAD,tblY+14); pdf.text('Max',ML+SCALE_W+MAX_W/2,tblY+14,{align:'center'})
      let vx=ML+SCALE_W+MAX_W
      visits.forEach((_,vi)=>{
        const vw=SCR_W+INT_W
        const tint=VISIT_COLORS[vi].map(c=>Math.min(255,c+160))
        fillRect(vx,tblY,vw,HDR_H,tint)
        pdf.setTextColor(VISIT_COLORS[vi][0],VISIT_COLORS[vi][1],VISIT_COLORS[vi][2])
        pdf.text(safe(visitDates[vi]),vx+vw/2,tblY+14,{align:'center'}); vx+=vw
      })
      const subY=tblY+HDR_H; fillRect(ML,subY,tW,18,HDRBG)
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7.5); setClr(NAVY)
      vx=ML+SCALE_W+MAX_W
      visits.forEach(()=>{pdf.text('Score',vx+SCR_W/2,subY+12,{align:'center'});pdf.text('Interpretation',vx+SCR_W+INT_W/2,subY+12,{align:'center'});vx+=SCR_W+INT_W})
      y=subY+18
      fillRect(ML,y,tW,ROW_H,WHITE)
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); setClr([30,30,30])
      pdf.text(safe(name),ML+PAD,y+13); pdf.text(String(maxVal),ML+SCALE_W+MAX_W/2,y+13,{align:'center'})
      vx=ML+SCALE_W+MAX_W
      scoresArr.forEach((sc,vi)=>{
        pdf.text(String(sc),vx+SCR_W/2,y+13,{align:'center'})
        pdf.setFontSize(7.5); pdf.text(pdf.splitTextToSize(safe(interpsArr[vi]),INT_W-PAD*2),vx+SCR_W+PAD,y+12)
        pdf.setFontSize(8.5); vx+=SCR_W+INT_W
      })
      y+=ROW_H
      const tblH=y-tblY; pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,tW,tblH)
      const vls=[ML+SCALE_W,ML+SCALE_W+MAX_W]; let tmpx=ML+SCALE_W+MAX_W
      visits.forEach(()=>{tmpx+=SCR_W;vls.push(tmpx);tmpx+=INT_W;vls.push(tmpx)})
      vls.forEach(lx=>{if(lx<ML+tW)pdf.line(lx,tblY,lx,tblY+tblH)})
      pdf.line(ML,tblY+HDR_H,ML+tW,tblY+HDR_H); pdf.line(ML,tblY+HDR_H+18,ML+tW,tblY+HDR_H+18)
      y+=6
    }
  }

  // PHQ-9
  sectionHead('PHQ-9 - Depression Screening (Past 2 Weeks)')
  drawScaleTable('PHQ-9',27,visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='phq9');return r?.total_score??0}),visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='phq9');return phq9Sev(r?.total_score??0)}))
  italicNote('Severity bands: None-Minimal <=4 | Mild 5-9 | Moderate 10-14 | Moderately Severe 15-19 | Severe >=20')
  y+=4

  // GAD-7
  sectionHead('GAD-7 - Generalized Anxiety Screening (Past 2 Weeks)')
  drawScaleTable('GAD-7',21,visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='gad7');return r?.total_score??0}),visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='gad7');return gad7Sev(r?.total_score??0)}))
  italicNote('Severity bands: Minimal <=4 | Mild 5-9 | Moderate 10-14 | Severe >=15')
  y+=4

  // TSK
  sectionHead('Tampa Scale for Kinesiophobia (TSK-11)')
  drawScaleTable('TSK-11',44,visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='tsk11');return r?.total_score??0}),visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='tsk11');return tskInterp(r?.total_score??0)}))
  italicNote('Measures fear of movement and re-injury. Scores >=37 indicate elevated kinesiophobia.')
  y+=4

  // PCS
  sectionHead('Pain Catastrophizing Scale (PCS)')
  drawScaleTable('PCS',52,visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='pcs');return r?.total_score??0}),visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='pcs');return pcsInterp(r?.total_score??0)}))
  italicNote('Scores >=30 are clinically significant and associated with greater pain-related disability.')
  y+=10

  // Disclaimer
  checkPage(30)
  pdf.setDrawColor(200,200,200); pdf.setLineWidth(0.5); pdf.line(ML,y,ML+CW,y); y+=8
  pdf.setFont('helvetica','italic'); pdf.setFontSize(7.5); setClr(GRAY)
  const disc='This report was automatically generated from patient self-report data. All scores are derived from validated instruments scored per published guidelines. Results should be interpreted by a qualified clinician. This document does not constitute a clinical diagnosis.'
  pdf.text(pdf.splitTextToSize(safe(disc),CW),ML,y)

  const today = format(new Date(),'yyyyMMdd')
  pdf.save(`Pain_Report_${patient.first_name}_${patient.last_name}_${today}.pdf`)
}
