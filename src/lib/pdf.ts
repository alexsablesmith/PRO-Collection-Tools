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

  // Returns [bgRGB, textRGB] for a PROMIS interpretation label
  function sevColors(interp: string): [number[], number[]] {
    const s = interp.toLowerCase()
    if (s.includes('normal') || s.includes('minimal') || s.includes('none'))
      return [[198, 239, 206], [0, 97, 0]]     // green
    if (s.includes('mild'))
      return [[255, 235, 156], [124, 77, 8]]    // yellow
    if (s.includes('moderate'))
      return [[255, 205, 155], [130, 50, 0]]    // orange
    if (s.includes('severe'))
      return [[255, 180, 180], [139, 0, 0]]     // red
    return [[245, 245, 245], [120, 120, 120]]
  }

  const phq9Sev  = (s: number) => s<=4?'None-Minimal':s<=9?'Mild':s<=14?'Moderate':s<=19?'Moderately Severe':'Severe'
  const gad7Sev  = (s: number) => s<=4?'Minimal':s<=9?'Mild':s<=14?'Moderate':'Severe'
  const tskInterp= (_s: number) => 'Higher scores indicate greater fear of pain and re-injury with movement.'
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
    // Custom single-visit PROMIS table with score bar and severity coloring
    const DOM_W=150, T_W=52, BAR_W=118, INT_W=192
    const HDR_H=22, ROW_H=20, PAD=5
    const totalW=DOM_W+T_W+BAR_W+INT_W
    checkPage(HDR_H+7*ROW_H+4)
    const tblY=y
    fillRect(ML,tblY,totalW,HDR_H,HDRBG)
    pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); setClr(NAVY)
    pdf.text('PROMIS Domain',ML+PAD,tblY+14)
    pdf.text('T-Score',ML+DOM_W+T_W/2,tblY+14,{align:'center'})
    pdf.text('Score Range (20–80)',ML+DOM_W+T_W+BAR_W/2,tblY+14,{align:'center'})
    pdf.text('Interpretation',ML+DOM_W+T_W+BAR_W+PAD,tblY+14)
    y=tblY+HDR_H
    const visit=visits[0]
    PROMIS_CONFIGS.forEach((cfg,ri)=>{
      checkPage(ROW_H+2)
      fillRect(ML,y,totalW,ROW_H,ri%2===0?WHITE:ALT)
      const resp=visit.responses.find(r=>r.instrument?.scoring_config_key===cfg.rawKey)
      const t=resp?.t_score??null
      const interp=t!=null?interpPromis(t,cfg.hib):'N/A'
      const [bgClr,txtClr]=sevColors(interp)
      // Domain
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); setClr([30,30,30])
      pdf.text(safe(cfg.label),ML+PAD,y+13)
      // T-Score (black text, colored bar)
      setClr([30,30,30])
      pdf.text(fmtT(resp?.t_score),ML+DOM_W+T_W/2,y+13,{align:'center'})
      // Score bar
      const barX=ML+DOM_W+T_W+PAD
      const barInnerW=BAR_W-PAD*2
      const barH=8
      const barY=y+(ROW_H-barH)/2
      pdf.setFillColor(220,220,220); pdf.rect(barX,barY,barInnerW,barH,'F')
      if(t!=null){
        const tClamped=Math.min(80,Math.max(20,t))
        const fillW=((tClamped-20)/60)*barInnerW
        pdf.setFillColor(BLUE[0],BLUE[1],BLUE[2]); pdf.rect(barX,barY,fillW,barH,'F')
      }
      // T=50 reference tick
      const refX=barX+(30/60)*barInnerW
      pdf.setDrawColor(80,80,80); pdf.setLineWidth(0.75); pdf.line(refX,barY-1,refX,barY+barH+1)
      // Interpretation cell (colored background, black text)
      const intX=ML+DOM_W+T_W+BAR_W
      fillRect(intX,y,INT_W,ROW_H,bgClr)
      setClr([30,30,30]); pdf.setFontSize(8)
      pdf.text(pdf.splitTextToSize(safe(interp),INT_W-PAD*2),intX+PAD,y+12)
      y+=ROW_H
    })
    const tblH=y-tblY
    pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,totalW,tblH)
    pdf.line(ML+DOM_W,tblY,ML+DOM_W,tblY+tblH)
    pdf.line(ML+DOM_W+T_W,tblY,ML+DOM_W+T_W,tblY+tblH)
    pdf.line(ML+DOM_W+T_W+BAR_W,tblY,ML+DOM_W+T_W+BAR_W,tblY+tblH)
    pdf.line(ML,tblY+HDR_H,ML+totalW,tblY+HDR_H)
    let dY2=tblY+HDR_H
    for(let i=0;i<PROMIS_CONFIGS.length-1;i++){dY2+=ROW_H;pdf.line(ML,dY2,ML+totalW,dY2)}
    y+=6
  } else {
    // Multi-visit PROMIS table
    const DOM_W=130, RAW_W=36, T_W=42
    const remaining=CW-DOM_W-nVisits*(RAW_W+T_W)
    const INT_W=Math.floor(remaining/nVisits)
    const totalW=DOM_W+nVisits*(RAW_W+T_W+INT_W)
    const HDR_H=22, SUB_H=18, ROW_H=22, PAD=4
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
    const interpLabel = INT_W < 55 ? 'Interp.' : 'Interpretation'
    visits.forEach(()=>{
      pdf.text('Raw',vx+RAW_W/2,subY+12,{align:'center'})
      pdf.text('T',vx+RAW_W+T_W/2,subY+12,{align:'center'})
      pdf.text(interpLabel,vx+RAW_W+T_W+INT_W/2,subY+12,{align:'center'})
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
        const t=resp?.t_score??null
        const interp=t!=null?interpPromis(t,cfg.hib):'N/A'
        const [bgClr,txtClr]=sevColors(interp)
        // Raw score (neutral color)
        setClr([30,30,30]); pdf.setFontSize(8)
        pdf.text(fmtI(resp?.raw_score),vx+RAW_W/2,y+13,{align:'center'})
        // T-Score (black text)
        setClr([30,30,30])
        pdf.text(fmtT(resp?.t_score),vx+RAW_W+T_W/2,y+13,{align:'center'})
        // Interpretation cell (colored background, black text)
        fillRect(vx+RAW_W+T_W,y,INT_W,ROW_H,bgClr)
        setClr([30,30,30]); pdf.setFontSize(7.5)
        pdf.text(pdf.splitTextToSize(safe(interp),INT_W-PAD*2),vx+RAW_W+T_W+PAD,y+12)
        pdf.setFontSize(8); vx+=RAW_W+T_W+INT_W
      })
      y+=ROW_H
    })
    const tblH=y-tblY
    pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,totalW,tblH)
    const interVisitLines: number[] = [ML+DOM_W]
    const subLines: number[] = []
    let tmpx = ML+DOM_W
    visits.forEach(()=>{
      tmpx+=RAW_W; subLines.push(tmpx)
      tmpx+=T_W;   subLines.push(tmpx)
      tmpx+=INT_W; interVisitLines.push(tmpx)
    })
    interVisitLines.forEach(lx=>{if(lx<ML+totalW)pdf.line(lx,tblY,lx,tblY+tblH)})
    subLines.forEach(lx=>{if(lx<ML+totalW)pdf.line(lx,tblY+HDR_H,lx,tblY+tblH)})
    pdf.line(ML,tblY+HDR_H,ML+totalW,tblY+HDR_H)
    pdf.line(ML,tblY+HDR_H+SUB_H,ML+totalW,tblY+HDR_H+SUB_H)
    y+=6
  }
  y+=4

  // ── PROMIS band chart ──────────────────────────────────────
  italicNote(
    'The chart below plots each domain T-score against published severity cut points. ' +
    'Green = Within Normal Limits. ' +
    (nVisits > 1 ? 'Shapes distinguish visit dates (circle = oldest, triangle = most recent).' : '')
  )

  ;(function drawPromisBandChart() {
    const LBL2   = 142
    const AX2X   = ML + LBL2 + 8
    const AX2W   = CW - LBL2 - 8
    const T0 = 20, T1_MAX = 80
    const TICKS2 = [20, 30, 40, 45, 50, 55, 60, 70, 80]
    const TH2 = 16, RH2 = 18, RG2 = 10
    const MR = 3.5

    const tx = (t: number) =>
      AX2X + ((Math.min(T1_MAX, Math.max(T0, t)) - T0) / (T1_MAX - T0)) * AX2W

    // Band colors pre-mixed at ~40% opacity on white (avoids GState requirement)
    const BC = {
      wnl:  [171, 235, 199] as number[],
      mild: [249, 231, 159] as number[],
      mod:  [250, 216, 160] as number[],
      sev:  [245, 183, 177] as number[],
    }
    // Saturated colors for legend swatches
    const BCS = {
      wnl:  [46, 204, 113] as number[],
      mild: [241, 196,  15] as number[],
      mod:  [243, 156,  18] as number[],
      sev:  [231,  76,  60] as number[],
    }

    const getBands2 = (hib: boolean) => hib
      ? [{t1:T0,t2:30,c:'sev'},{t1:30,t2:40,c:'mod'},{t1:40,t2:45,c:'mild'},{t1:45,t2:T1_MAX,c:'wnl'}]
      : [{t1:T0,t2:55,c:'wnl'},{t1:55,t2:60,c:'mild'},{t1:60,t2:70,c:'mod'},{t1:70,t2:T1_MAX,c:'sev'}]

    const vOff = nVisits === 1 ? [0] : nVisits === 2 ? [-3, 3] : [-4, 0, 4]
    const rowsH = PROMIS_CONFIGS.length * (RH2 + RG2) - RG2
    const needed = TH2 + rowsH + (nVisits > 1 ? 40 : 24)
    checkPage(needed)

    const top = y

    // Tick grid + labels
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7); setClr(GRAY)
    TICKS2.forEach(t => {
      const x = tx(t)
      pdf.text(String(t), x, top + 10, { align: 'center' })
      pdf.setDrawColor(220, 220, 220); pdf.setLineWidth(0.3)
      pdf.line(x, top + 13, x, top + TH2 + rowsH)
    })
    pdf.setDrawColor(160, 160, 160); pdf.setLineWidth(0.8)
    pdf.setLineDashPattern([3, 2], 0)
    pdf.line(tx(50), top + 13, tx(50), top + TH2 + rowsH)
    pdf.setLineDashPattern([], 0)

    const rowsTop = top + TH2

    PROMIS_CONFIGS.forEach((cfg, i) => {
      const rowY = rowsTop + i * (RH2 + RG2)

      // Label
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); setClr([50, 50, 50])
      pdf.text(safe(cfg.label), ML + LBL2, rowY + RH2 * 0.72, { align: 'right' })

      // Bands
      getBands2(cfg.hib).forEach(({ t1, t2, c }) => {
        const clr = BC[c as keyof typeof BC]
        fillRect(tx(t1), rowY, tx(t2) - tx(t1), RH2, clr)
      })

      // Markers per visit
      visits.forEach((visit, vi) => {
        const resp = visit.responses.find(r => r.instrument?.scoring_config_key === cfg.rawKey)
        const tVal = resp?.t_score
        if (tVal == null) return

        const mx = tx(tVal)
        const oy = rowY + RH2 / 2 + vOff[vi]
        const fc  = VISIT_COLORS[vi]

        pdf.setFillColor(fc[0], fc[1], fc[2])
        pdf.setDrawColor(255, 255, 255)
        pdf.setLineWidth(0.8)

        if (vi === 0) {
          pdf.circle(mx, oy, MR, 'FD')
        } else if (vi === 1) {
          pdf.rect(mx - MR, oy - MR, MR * 2, MR * 2, 'FD')
        } else {
          const R = MR * 1.3
          pdf.triangle(mx, oy - R, mx - R * 0.866, oy + R * 0.5, mx + R * 0.866, oy + R * 0.5, 'FD')
        }

        // T-score label above the most recent visit marker
        if (vi === nVisits - 1) {
          pdf.setFont('helvetica','bold'); pdf.setFontSize(6)
          setClr([fc[0], fc[1], fc[2]])
          pdf.text(`T=${tVal.toFixed(1)}`, mx, rowY - 1.5, { align: 'center' })
        }
      })
    })

    // Band legend
    const legY = rowsTop + rowsH + 5
    const BLEG = [
      { c: 'wnl', label: 'Within Normal Limits', w: 112 },
      { c: 'mild', label: 'Mild',                 w:  42 },
      { c: 'mod',  label: 'Moderate',             w:  64 },
      { c: 'sev',  label: 'Severe',               w:  52 },
    ]
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); setClr([70, 70, 70])
    let lx = AX2X
    BLEG.forEach(({ c, label, w }) => {
      const clr = BCS[c as keyof typeof BCS]
      fillRect(lx, legY, 11, 9, clr)
      setClr([70, 70, 70])
      pdf.text(label, lx + 14, legY + 7.5)
      lx += w
    })

    // Visit legend (only when multiple visits)
    if (nVisits > 1) {
      const legY2 = legY + 16
      lx = AX2X
      visits.forEach((v, vi) => {
        const fc = VISIT_COLORS[vi]
        pdf.setFillColor(fc[0], fc[1], fc[2])
        pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.8)
        const cy = legY2 + MR + 1
        if (vi === 0) {
          pdf.circle(lx + MR, cy, MR, 'FD')
        } else if (vi === 1) {
          pdf.rect(lx, cy - MR, MR * 2, MR * 2, 'FD')
        } else {
          const R = MR * 1.3
          pdf.triangle(lx + MR, cy - R, lx + MR - R * 0.866, cy + R * 0.5, lx + MR + R * 0.866, cy + R * 0.5, 'FD')
        }
        setClr([70, 70, 70])
        pdf.text(safe(visitDates[vi]), lx + MR * 2 + 4, legY2 + 8)
        lx += MR * 2 + 4 + pdf.getStringUnitWidth(visitDates[vi]) * 7.5 / pdf.internal.scaleFactor + 12
      })
      y = legY2 + 18
    } else {
      y = legY + 18
    }
  })()

  y += 4

  // ── Scale tables helper ──
  // showInterp=false renders a score-only table (no interpretation column, no sub-header)
  function drawScaleTable(name: string, maxVal: number, scoresArr: (number | string)[], interpsArr: string[], showInterp: boolean = true) {
    const HDR_H=22, PAD=5
    const SCALE_W=90, MAX_W=44, SCR_W=54

    if(nVisits===1){
      checkPage(HDR_H+20+4)
      if(showInterp){
        drawTable(['Scale','Score','Maximum','Interpretation'],[110,80,80,242],[[name,String(scoresArr[0]),String(maxVal),safe(interpsArr[0])]])
      } else {
        drawTable(['Scale','Score','Maximum'],[110,160,242],[[name,String(scoresArr[0]),String(maxVal)]])
      }
    } else if(showInterp) {
      // Multi-visit with interpretation column
      const INT_W=Math.floor((CW-SCALE_W-MAX_W-nVisits*SCR_W)/nVisits)
      // Compute row height from the longest interpretation text
      pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5)
      const maxLines=interpsArr.reduce((mx,interp)=>
        Math.max(mx,pdf.splitTextToSize(safe(interp),INT_W-PAD*2).length),1)
      const ROW_H=Math.max(20,maxLines*10+6)
      const tW=SCALE_W+MAX_W+nVisits*(SCR_W+INT_W)
      checkPage(HDR_H+18+ROW_H+4)
      const tblY=y
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
      const interpLabel=INT_W<55?'Interp.':'Interpretation'
      vx=ML+SCALE_W+MAX_W
      visits.forEach(()=>{
        pdf.text('Score',vx+SCR_W/2,subY+12,{align:'center'})
        pdf.text(interpLabel,vx+SCR_W+INT_W/2,subY+12,{align:'center'})
        vx+=SCR_W+INT_W
      })
      y=subY+18
      fillRect(ML,y,tW,ROW_H,WHITE)
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); setClr([30,30,30])
      pdf.text(safe(name),ML+PAD,y+13); pdf.text(String(maxVal),ML+SCALE_W+MAX_W/2,y+13,{align:'center'})
      vx=ML+SCALE_W+MAX_W
      scoresArr.forEach((sc,vi)=>{
        pdf.text(String(sc),vx+SCR_W/2,y+13,{align:'center'})
        pdf.setFontSize(7.5)
        pdf.text(pdf.splitTextToSize(safe(interpsArr[vi]),INT_W-PAD*2),vx+SCR_W+PAD,y+12)
        pdf.setFontSize(8.5); vx+=SCR_W+INT_W
      })
      y+=ROW_H
      const tblH=y-tblY; pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,tW,tblH)
      const interVisitLines2: number[]=[ML+SCALE_W,ML+SCALE_W+MAX_W]
      const subLines2: number[]=[]
      let tmpx=ML+SCALE_W+MAX_W
      visits.forEach(()=>{tmpx+=SCR_W;subLines2.push(tmpx);tmpx+=INT_W;interVisitLines2.push(tmpx)})
      interVisitLines2.forEach(lx=>{if(lx<ML+tW)pdf.line(lx,tblY,lx,tblY+tblH)})
      subLines2.forEach(lx=>{if(lx<ML+tW)pdf.line(lx,tblY+HDR_H,lx,tblY+tblH)})
      pdf.line(ML,tblY+HDR_H,ML+tW,tblY+HDR_H); pdf.line(ML,tblY+HDR_H+18,ML+tW,tblY+HDR_H+18)
      y+=6
    } else {
      // Multi-visit score-only (no interpretation column, no sub-header)
      const ROW_H=20
      const tW=SCALE_W+MAX_W+nVisits*SCR_W
      checkPage(HDR_H+ROW_H+4)
      const tblY=y
      fillRect(ML,tblY,tW,HDR_H,HDRBG)
      pdf.setFont('helvetica','bold'); pdf.setFontSize(8.5); setClr(NAVY)
      pdf.text('Scale',ML+PAD,tblY+14); pdf.text('Max',ML+SCALE_W+MAX_W/2,tblY+14,{align:'center'})
      let vx=ML+SCALE_W+MAX_W
      visits.forEach((_,vi)=>{
        const tint=VISIT_COLORS[vi].map(c=>Math.min(255,c+160))
        fillRect(vx,tblY,SCR_W,HDR_H,tint)
        pdf.setTextColor(VISIT_COLORS[vi][0],VISIT_COLORS[vi][1],VISIT_COLORS[vi][2])
        pdf.text(safe(visitDates[vi]),vx+SCR_W/2,tblY+14,{align:'center'}); vx+=SCR_W
      })
      y=tblY+HDR_H
      fillRect(ML,y,tW,ROW_H,WHITE)
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); setClr([30,30,30])
      pdf.text(safe(name),ML+PAD,y+13); pdf.text(String(maxVal),ML+SCALE_W+MAX_W/2,y+13,{align:'center'})
      vx=ML+SCALE_W+MAX_W
      scoresArr.forEach(sc=>{
        pdf.text(String(sc),vx+SCR_W/2,y+13,{align:'center'}); vx+=SCR_W
      })
      y+=ROW_H
      const tblH=y-tblY; pdf.setDrawColor(180,180,180); pdf.setLineWidth(0.5); pdf.rect(ML,tblY,tW,tblH)
      const allVLines: number[]=[ML+SCALE_W,ML+SCALE_W+MAX_W]
      let tx=ML+SCALE_W+MAX_W
      visits.forEach(()=>{tx+=SCR_W;allVLines.push(tx)})
      allVLines.forEach(lx=>{if(lx<ML+tW)pdf.line(lx,tblY,lx,tblY+tblH)})
      pdf.line(ML,tblY+HDR_H,ML+tW,tblY+HDR_H)
      y+=6
    }
  }

  // PHQ-9
  sectionHead('PHQ-9 - Depression Screening (Past 2 Weeks)')
  drawScaleTable('PHQ-9',27,
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='phq9');return r?.total_score??'No Data'}),
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='phq9');return r!=null?phq9Sev(r.total_score??0):'No Data'}))
  italicNote('Severity bands: None-Minimal <=4 | Mild 5-9 | Moderate 10-14 | Moderately Severe 15-19 | Severe >=20')
  y+=4

  // GAD-7
  sectionHead('GAD-7 - Generalized Anxiety Screening (Past 2 Weeks)')
  drawScaleTable('GAD-7',21,
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='gad7');return r?.total_score??'No Data'}),
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='gad7');return r!=null?gad7Sev(r.total_score??0):'No Data'}))
  italicNote('Severity bands: Minimal <=4 | Mild 5-9 | Moderate 10-14 | Severe >=15')
  y+=4

  // TSK
  sectionHead('Tampa Scale for Kinesiophobia (TSK-11)')
  drawScaleTable('TSK-11',44,
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='tsk11');return r?.total_score??'No Data'}),
    [],false)
  italicNote('Higher scores indicate greater fear of pain and re-injury with movement.')
  y+=4

  // PCS
  sectionHead('Pain Catastrophizing Scale (PCS)')
  drawScaleTable('PCS',52,
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='pcs');return r?.total_score??'No Data'}),
    visits.map(v=>{const r=v.responses.find(r=>r.instrument?.scoring_config_key==='pcs');return r!=null?pcsInterp(r.total_score??0):'No Data'}))
  italicNote('Scores >=30 are clinically significant and associated with greater pain-related disability.')
  y+=10

  // GIC
  const hasGIC = visits.some(v => v.responses.some(r => r.instrument?.scoring_config_key === 'gic'))
  if (hasGIC) {
    sectionHead('Global Impression of Change')
    drawScaleTable(
      'GIC', 7,
      visits.map(v => { const r = v.responses.find(r => r.instrument?.scoring_config_key === 'gic'); return r?.total_score ?? 'No Data' }),
      visits.map(v => { const r = v.responses.find(r => r.instrument?.scoring_config_key === 'gic'); return r?.severity_label ?? 'No Data' })
    )
    italicNote("Score: 1=A lot better, 4=No change, 7=A lot worse. Reflects patient's overall impression of change since starting the functional restoration program.")
    y += 4
  }

  // Disclaimer
  checkPage(30)
  pdf.setDrawColor(200,200,200); pdf.setLineWidth(0.5); pdf.line(ML,y,ML+CW,y); y+=8
  pdf.setFont('helvetica','italic'); pdf.setFontSize(7.5); setClr(GRAY)
  const disc='This report was automatically generated from patient self-report data. All scores are derived from validated instruments scored per published guidelines. Results should be interpreted by a qualified clinician. This document does not constitute a clinical diagnosis.'
  pdf.text(pdf.splitTextToSize(safe(disc),CW),ML,y)

  const today = format(new Date(),'yyyyMMdd')
  pdf.save(`Pain_Report_${patient.first_name}_${patient.last_name}_${today}.pdf`)
}
