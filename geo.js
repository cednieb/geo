// app.js
// Version complète et finale avec correction TDZ (SVG constants en tête).
// Fonctionnalités : création/édition d'objets (point/line/circle/arc/text/rline),
// perpendiculaires, triangles (AS/BS), droites infinies (rline) clipées au canevas,
// grille cm + mm, affichage/cachage des labels (par objet et global), import/export,
// options texte (fill/stroke/bold/italic/underline/strike) et aperçu dans le formulaire.
// Units: monde = cm

// suppression : conversion rline <-> segment (réversible via méta), parallèles, intersections, // A voir plus tard, boutons pas affichés

(() => {
  // ---------- Config ----------
  const version = 0.32;
  const A4 = { w: 21, h: 29.7 }; // cm
  const EPS = 1e-6;
  const DUP_EPS = 1e-3;
  
  var labelsVisibility = 1;

  // ---------- SVG constants (moved up to avoid TDZ) ----------
  const SVG_EYE = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8S3.5 17 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`; 
  const SVG_EYE_CLOSED = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12C3.5 7 7.5 4 12 4s8.5 3 10.5 8c-2 5-6 8-10.5 8S3.5 17 1.5 12z"  fill="black"/></svg>`;
  
  const SVG_PEN = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l3-1 11-11 1-3-3 1-11 11-1 3z"/></svg>`;
  
  const SVG_TRASH = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6v14c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V6"/><path d="M10 6V4h4v2"/></svg>`;
  
  const SVG_LABEL_ON = `<svg viewBox="0 0 24 24"><path d="M3 6h18v12l-9-3-9 3z" fill="#2d3748"/></svg>`;
  const SVG_LABEL_OFF = `<svg viewBox="0 0 24 24"><path d="M3 6h18v12l-9-3-9 3z" stroke="#2d3748" fill="none"/><path d="M4 5l16 14" stroke="#e53e3e" stroke-width="1.6"/></svg>`;
  
  const SVG_CONVERT = `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#2b6cb0" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;

  // ---------- DOM ----------
  const canvas = document.getElementById('sheet');
  const orientationSelect = document.getElementById('orientation');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  const helpBtn = document.getElementById('help-btn');
  const helpModal = document.getElementById('help-modal');
  const helpClose = document.getElementById('help-close');
  const showFrameChk = document.getElementById('show-frame');

  const enableDraggingChk = document.getElementById('enable-dragging');
  const showMMChk = document.getElementById('show-mm');
  const toggleLabelsBtn = document.getElementById('toggle-labels');

  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const resetBtn = document.getElementById('reset-view');
  
  const clearBtn = document.getElementById('clear-all');
  
  const screenshotBtn = document.getElementById('screenshot');
  const screenshotBtnA4 = document.getElementById('screenshotA4'); 
  
  const exportBtn = document.getElementById('export-json');

  const showAxesChk = document.getElementById('show-axes');
  const showGridChk = document.getElementById('show-grid');
  const showTicksChk = document.getElementById('show-ticks');

  const cursorCoords = document.getElementById('cursor-coords');
  const objectsList = document.getElementById('objects');

  const tabs = document.querySelectorAll('.tab');
  const formFields = document.getElementById('form-fields');
  const createForm = document.getElementById('create-form');
  const createSubmit = document.getElementById('create-submit');
  const createReset = document.getElementById('create-reset');

  // ---------- Canvas & rendering ----------
  const ctx = canvas.getContext('2d');
  let DPR = window.devicePixelRatio || 1;
  let scheduled = false;
  function requestRender(){ if(!scheduled){ scheduled = true; requestAnimationFrame(render); } }

  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, Math.floor(rect.width * DPR));
    canvas.height = Math.max(300, Math.floor(rect.height * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    requestRender();
  }
  window.addEventListener('resize', resizeCanvas);
  new ResizeObserver(resizeCanvas).observe(canvas);

  // ---------- View transform ----------
  let scale = 20; // px per cm
  let view = { offsetX: 0, offsetY: 0 };

  function worldToScreen(wx, wy) {
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    return { x: cx + view.offsetX + wx * scale, y: cy + view.offsetY - wy * scale };
  }
  function screenToWorld(sx, sy) {
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    return { x: (sx - cx - view.offsetX) / scale, y: (cy - sy + view.offsetY) / scale };
  }
  function fitToCanvas() {
    const rect = canvas.getBoundingClientRect();
    const padding = 40;
    const cssW = rect.width - padding * 2;
    const cssH = rect.height - padding * 2;
    const orientation = orientationSelect.value;
    const sheetW = orientation === 'portrait' ? A4.w : A4.h;
    const sheetH = orientation === 'portrait' ? A4.h : A4.w;
    const sx = cssW / sheetW;
    const sy = cssH / sheetH;
    scale = Math.min(sx, sy);
    view.offsetX = 0; view.offsetY = 0;
    requestRender();
  }  
  
  // ---------- Screenshot A4 ----------
  
async function screenshotA4ResetAndCapture(canvas, options = {}) {
  const {
    dpi = 300,
    returnBlob = true,
    mime = 'image/png',
    quality = 0.92,
    background = null
  } = options;

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('Le premier argument doit être un élément <canvas>.');
  }
  if (typeof worldToScreen !== 'function') {
    throw new Error('worldToScreen(wx, wy) introuvable.');
  }
  if (typeof fitToCanvas !== 'function') {
    throw new Error('fitToCanvas() introuvable.');
  }

  // 1) Reset zoom / position
  fitToCanvas();

  // 2) Attendre le rendu -> on attend deux frames pour laisser le rendu et potentiels DOM updates
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // 3) Récupérer orientation
  const orientation = (typeof orientationSelect !== 'undefined' && orientationSelect.value) ? orientationSelect.value : 'portrait';

  // 4) Dimensions A4 en cm (ton monde est en cm)
  const A4 = { w: 21.0, h: 29.7 };
  const wCm = orientation === 'landscape' ? A4.h : A4.w;
  const hCm = orientation === 'landscape' ? A4.w : A4.h;

  // 5) Calculer les 4 coins en coordonnées monde (origine au centre)
  // top-left, top-right, bottom-right, bottom-left
  const halfW = wCm / 2;
  const halfH = hCm / 2;
  const worldCorners = [
    { wx: -halfW, wy: +halfH }, // TL
    { wx: +halfW, wy: +halfH }, // TR
    { wx: +halfW, wy: -halfH }, // BR
    { wx: -halfW, wy: -halfH }  // BL
  ];

  // 6) Convertir ces coins en coordonnées écran CSS via worldToScreen
  const screenCornersCss = worldCorners.map(p => {
    const s = worldToScreen(p.wx, p.wy);
    return { x: s.x, y: s.y };
  });

  // 7) Trouver bounding box CSS (minX,minY -> maxX,maxY)
  const xs = screenCornersCss.map(p => p.x);
  const ys = screenCornersCss.map(p => p.y);
  const minX_css = Math.min(...xs);
  const maxX_css = Math.max(...xs);
  const minY_css = Math.min(...ys);
  const maxY_css = Math.max(...ys);

  // 8) Convertir CSS px -> buffer px (canvas.width/height)
  const cssW = canvas.clientWidth || canvas.width || 1;
  const cssH = canvas.clientHeight || canvas.height || 1;
  const ratioX = canvas.width / cssW;
  const ratioY = canvas.height / cssH;

  let sxBuf = Math.round(minX_css * ratioX);
  let syBuf = Math.round(minY_css * ratioY);
  let sWidthBuf = Math.round((maxX_css - minX_css) * ratioX);
  let sHeightBuf = Math.round((maxY_css - minY_css) * ratioY);

  // 9) Clamp source rect dans le buffer du canvas
  const maxW = canvas.width;
  const maxH = canvas.height;

  const rectOutside = (sxBuf + sWidthBuf <= 0) || (syBuf + sHeightBuf <= 0) || (sxBuf >= maxW) || (syBuf >= maxH);
  if (!rectOutside) {
    if (sxBuf < 0) { sWidthBuf += sxBuf; sxBuf = 0; }
    if (syBuf < 0) { sHeightBuf += syBuf; syBuf = 0; }
    if (sxBuf + sWidthBuf > maxW) sWidthBuf = maxW - sxBuf;
    if (syBuf + sHeightBuf > maxH) sHeightBuf = maxH - syBuf;
    sWidthBuf = Math.max(0, sWidthBuf);
    sHeightBuf = Math.max(0, sHeightBuf);
  } else {
    sWidthBuf = 0;
    sHeightBuf = 0;
  }

  // 10) Calculer taille de sortie en pixels au DPI demandé (cm -> inches -> px)
  const cmToPxAtDpi = (cm, dpiVal) => Math.round((cm / 2.54) * dpiVal);
  const targetW = cmToPxAtDpi(wCm, dpi);
  const targetH = cmToPxAtDpi(hCm, dpi);

  // 11) Créer canvas de sortie et dessiner (redimensionnement)
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');

  // Fond si demandé ou si jpeg
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
  } else if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
  }

  if (sWidthBuf > 0 && sHeightBuf > 0) {
    ctx.drawImage(canvas, sxBuf, syBuf, sWidthBuf, sHeightBuf, 0, 0, targetW, targetH);
  } else {
    // zone A4 complètement hors du canvas : on laisse le canvas de sortie vierge / fond appliqué
  }

  // 12) Retourner Blob ou dataURL
  if (returnBlob) {
    return await new Promise((resolve) => out.toBlob(resolve, mime, quality));
  } else {
    return out.toDataURL(mime, quality);
  }
}  
  
  

  // ---------- State ----------
  let showAxes = true, showGrid = true, showTicks = true, showMM = false;
  const objects = []; // all objects
  let currentTab = 'point';
  let editTargetId = null;

  // ---------- Utils ----------
  function uid(prefix = '') { return prefix + Math.random().toString(36).slice(2, 9); }
  function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ---------- Render ----------
  function clearCanvas() { ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight); }

  function render() {
    scheduled = false;
    clearCanvas();
    ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight); ctx.restore();

    if (showFrameChk && showFrameChk.checked) drawA4Frame();
    if (showGrid) drawGrid();
    if (showAxes) drawAxes();

    for (const obj of objects) if (obj.visible) drawObject(obj);
  }

  function drawA4Frame() {
    const orientation = orientationSelect.value;
    const w = orientation === 'portrait' ? A4.w : A4.h;
    const h = orientation === 'portrait' ? A4.h : A4.w;
    const halfW = w/2, halfH = h/2;
    const p1 = worldToScreen(-halfW, halfH);
    const p2 = worldToScreen(halfW, -halfH);
    const x = p1.x, y = p1.y, width = p2.x - p1.x, height = p2.y - p1.y;
    ctx.save();
    ctx.strokeStyle = '#0b7285';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  function drawGrid() {
    const rect = canvas.getBoundingClientRect();
    const topLeft = screenToWorld(0,0);
    const bottomRight = screenToWorld(rect.width, rect.height);
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = '#e6eef8';
    const startX = Math.floor(topLeft.x)-1, endX = Math.ceil(bottomRight.x)+1;
    for (let k=startX;k<=endX;k++){ const sx = worldToScreen(k,0).x; ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,rect.height); ctx.stroke(); }
    const startY = Math.floor(bottomRight.y)-1, endY = Math.ceil(topLeft.y)+1;
    for (let k=startY;k<=endY;k++){ const sy = worldToScreen(0,k).y; ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(rect.width,sy); ctx.stroke(); }

    if (showMM) {
      ctx.lineWidth = 0.5; ctx.strokeStyle = '#f1f6fb';
      const xs = Math.floor(topLeft.x * 10) - 1, xe = Math.ceil(bottomRight.x * 10) + 1;
      for (let i=xs;i<=xe;i++) {
        const gx = i/10;
        if (Math.abs(gx - Math.round(gx)) < 1e-9) continue;
        const px = worldToScreen(gx,0).x; ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,rect.height); ctx.stroke();
      }
      const ys = Math.floor(bottomRight.y * 10) - 1, ye = Math.ceil(topLeft.y * 10) + 1;
      for (let i=ys;i<=ye;i++) {
        const gy = i/10;
        if (Math.abs(gy - Math.round(gy)) < 1e-9) continue;
        const py = worldToScreen(0,gy).y; ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(rect.width,py); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawAxes() {
    const rect = canvas.getBoundingClientRect();
    const center = worldToScreen(0,0);
    ctx.save();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, center.y); ctx.lineTo(rect.width, center.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center.x, 0); ctx.lineTo(center.x, rect.height); ctx.stroke();

    if (showTicks) {
      ctx.fillStyle = '#222'; ctx.font = '12px sans-serif';
      const topLeft = screenToWorld(0,0);
      const bottomRight = screenToWorld(rect.width, rect.height);
      const startX = Math.floor(topLeft.x)-1, endX = Math.ceil(bottomRight.x)+1;
      for (let k=startX;k<=endX;k++) {
        if (k === 0) continue;
        const p = worldToScreen(k,0);
        ctx.beginPath(); ctx.moveTo(p.x, center.y-5); ctx.lineTo(p.x, center.y+5); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
        ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText(String(k), p.x, center.y+6); ctx.restore();
      }
      const startY = Math.floor(bottomRight.y)-1, endY = Math.ceil(topLeft.y)+1;
      for (let k=startY;k<=endY;k++) {
        if (k === 0) continue;
        const p = worldToScreen(0,k);
        ctx.beginPath(); ctx.moveTo(center.x-5, p.y); ctx.lineTo(center.x+5, p.y); ctx.stroke();
        ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillText(String(k), center.x-8, p.y); ctx.restore();
      }
      ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText('0', center.x+6, center.y+6); ctx.restore();
    }
    ctx.restore();
  }

  // ---------- geometry helpers ----------
  // intersect infinite line defined by p1->p2 with rectangle in world coords
  function intersectLineWithRect(p1, p2, rectWorld) {
    const xs = [];
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    [rectWorld.left, rectWorld.right].forEach(x => {
      if (Math.abs(dx) < EPS) return;
      const t = (x - p1.x) / dx;
      const y = p1.y + t * dy;
      if (y <= rectWorld.top + EPS && y >= rectWorld.bottom - EPS) xs.push({ x, y });
    });
    [rectWorld.top, rectWorld.bottom].forEach(y => {
      if (Math.abs(dy) < EPS) return;
      const t = (y - p1.y) / dy;
      const x = p1.x + t * dx;
      if (x >= rectWorld.left - EPS && x <= rectWorld.right + EPS) xs.push({ x, y });
    });
    const uniq = [];
    for (const p of xs) {
      if (!uniq.some(u => Math.hypot(u.x - p.x, u.y - p.y) < 1e-3)) uniq.push(p);
    }
    return uniq.slice(0,2);
  }

  function canvasRectWorld() {
    const p00 = screenToWorld(0, 0);
    const p11 = screenToWorld(canvas.clientWidth, canvas.clientHeight);
    const left = Math.min(p00.x, p11.x);
    const right = Math.max(p00.x, p11.x);
    const top = Math.max(p00.y, p11.y);
    const bottom = Math.min(p00.y, p11.y);
    return { left, right, top, bottom };
  }

  function angleOnArc(a, arc) {
    const start = ((arc.startDeg * Math.PI / 180) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
    const end   = ((arc.endDeg   * Math.PI / 180) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
    let ang = a % (2*Math.PI); if (ang < 0) ang += 2*Math.PI;
    if (arc.anticlockwise) {
      if (end >= start) return (ang >= start - EPS && ang <= end + EPS);
      return (ang >= start - EPS || ang <= end + EPS);
    } else {
      if (start >= end) return !(ang > end + EPS && ang < start - EPS);
      return !(ang > end + EPS || ang < start - EPS);
    }
  }

  function isNonFilled(obj) {
    if (!obj) return false;
    if (obj.type === 'circle' || obj.type === 'arc') return !obj.fill;
    return obj.type === 'line' || obj.type === 'rline';
  }

  // ---------- draw objects ----------
  function drawObject(obj) {
    ctx.save();
    if (obj.type === 'point') {
      const p = worldToScreen(obj.x, obj.y);
      ctx.beginPath(); ctx.fillStyle = obj.color || '#c0392b'; ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
      if (obj.showLabel !== false) { ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.fillStyle='#111'; ctx.font='12px sans-serif'; ctx.fillText(obj.name || '', p.x+6, p.y+6); ctx.restore(); }
    } else if (obj.type === 'line') {
      const a = worldToScreen(obj.x1, obj.y1), b = worldToScreen(obj.x2, obj.y2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = obj.color || '#1f75fe'; ctx.lineWidth = Math.max(1, obj.thickness || 2); ctx.stroke();
      if (obj.showLabel !== false) { ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.fillStyle='#111'; ctx.font='12px sans-serif'; ctx.fillText(obj.name || '', (a.x + b.x)/2 + 6, (a.y + b.y)/2 + 6); ctx.restore(); }
    } else if (obj.type === 'rline') {
      const rect = canvasRectWorld();
      const pts = intersectLineWithRect({x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2}, rect);
      if (pts.length >= 2) {
        const s1 = worldToScreen(pts[0].x, pts[0].y), s2 = worldToScreen(pts[1].x, pts[1].y);
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
        ctx.setLineDash([6,6]); ctx.strokeStyle = obj.color || '#9b2c2c'; ctx.lineWidth = Math.max(1, obj.thickness || 1.5); ctx.stroke(); ctx.setLineDash([]);
        if (obj.showLabel !== false) { ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.fillStyle='#111'; ctx.font='12px sans-serif'; ctx.fillText(obj.name || '', (s1.x + s2.x)/2 + 6, (s1.y + s2.y)/2 + 6); ctx.restore(); }
      }
    } else if (obj.type === 'circle') {
      const c = worldToScreen(obj.x, obj.y);
      const r = Math.abs(obj.radius * scale);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI*2);
      if (obj.fill) { ctx.fillStyle = obj.fillColor || 'rgba(200,200,255,0.5)'; ctx.fill(); }
      ctx.strokeStyle = obj.strokeColor || '#1c7a3b'; ctx.lineWidth = Math.max(1, obj.strokeWidth || 2); ctx.stroke();
      if (obj.showLabel !== false) { ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.fillStyle='#111'; ctx.font='12px sans-serif'; ctx.fillText(obj.name || '', c.x + r + 6, c.y - 6); ctx.restore(); }
    } else if (obj.type === 'arc') {
      const c = worldToScreen(obj.x, obj.y); const r = Math.abs(obj.radius * scale);
      const s = (obj.startDeg * Math.PI) / 180, e = (obj.endDeg * Math.PI) / 180;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, -s, -e, obj.anticlockwise || false);
      if (obj.fill) { ctx.fillStyle = obj.fillColor || 'rgba(220,200,200,0.4)'; ctx.fill(); }
      ctx.strokeStyle = obj.strokeColor || '#7b2cbf'; ctx.lineWidth = Math.max(1, obj.strokeWidth || 2); ctx.stroke();
      if (obj.showLabel !== false) { ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0); ctx.fillStyle='#111'; ctx.font='12px sans-serif'; ctx.fillText(obj.name || '', c.x + r + 6, c.y - 6); ctx.restore(); }
    } else if (obj.type === 'text') {
      const screenP = worldToScreen(obj.x, obj.y);
      const fontFamily = obj.fontFamily || 'sans-serif';
      const fontSize = obj.fontSize || 12;
      let fontStyle = '';
      if (obj.italic) fontStyle += 'italic ';
      if (obj.bold) fontStyle += 'bold ';
      fontStyle += `${fontSize}px ${fontFamily}`;
      ctx.save();
      ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.textAlign = obj.align || 'left';
      ctx.textBaseline = 'top';
      const lines = String(obj.text || '').split('\n');
      const lh = Math.round(fontSize * 1.2);
      if (obj.stroke && obj.strokeColor) {
        ctx.strokeStyle = obj.strokeColor; ctx.lineWidth = Math.max(1, (obj.strokeWidth || Math.max(1, Math.round(fontSize/10))));
        ctx.font = fontStyle;
        lines.forEach((ln, i) => { const y = screenP.y + i * lh; ctx.strokeText(ln, screenP.x, y); });
      }
      if (obj.fill !== false) {
        ctx.fillStyle = obj.color || '#111'; ctx.font = fontStyle;
        lines.forEach((ln, i) => { const y = screenP.y + i * lh; ctx.fillText(ln, screenP.x, y); });
      } else if (!obj.fill && !obj.stroke) {
        ctx.fillStyle = obj.color || '#111'; ctx.font = fontStyle;
        lines.forEach((ln, i) => { const y = screenP.y + i * lh; ctx.fillText(ln, screenP.x, y); });
      }
      // underline/strike
      ctx.font = fontStyle;
      for (let i=0;i<lines.length;i++){
        const ln = lines[i];
        const y = screenP.y + i * lh;
        const m = ctx.measureText(ln);
        const textWidth = m.width;
        let xStart = screenP.x;
        if (ctx.textAlign === 'center') xStart = screenP.x - textWidth/2;
        if (ctx.textAlign === 'right') xStart = screenP.x - textWidth;
        if (obj.underline) { ctx.beginPath(); ctx.strokeStyle = obj.underlineColor || obj.color || '#111'; ctx.lineWidth = Math.max(1, Math.round(fontSize/12)); const uy = y + Math.round(fontSize * 1.05); ctx.moveTo(xStart, uy); ctx.lineTo(xStart + textWidth, uy); ctx.stroke(); }
        if (obj.strike) { ctx.beginPath(); ctx.strokeStyle = obj.strikeColor || obj.color || '#111'; ctx.lineWidth = Math.max(1, Math.round(fontSize/12)); const sy = y + Math.round(fontSize * 0.45); ctx.moveTo(xStart, sy); ctx.lineTo(xStart + textWidth, sy); ctx.stroke(); }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- interaction ----------
  let isPanning = false, panStart = null, lastPointer = { x:0, y:0 };
  let dragging = null;
  const HIT_TOLERANCE = 8;

  function pointerDown(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    lastPointer.x = sx; lastPointer.y = sy;
    const found = findObjectAtScreen(sx, sy);
    const dragEnabled = enableDraggingChk ? enableDraggingChk.checked : true;
    if (found && dragEnabled) {
      dragging = { obj: found, startScreen: { x: sx, y: sy }, startProps: JSON.parse(JSON.stringify(found)) };
    } else {
      isPanning = true;
      panStart = { x: sx, y: sy, offsetX: view.offsetX, offsetY: view.offsetY };
    }
  }

  function pointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    lastPointer.x = sx; lastPointer.y = sy;
    const w = screenToWorld(sx, sy);
    cursorCoords.textContent = `Monde: (${w.x.toFixed(2)} cm, ${w.y.toFixed(2)} cm) — Réel: (${Math.round(sx)} px, ${Math.round(sy)} px)`;
    if (dragging) {
      const dx = (sx - dragging.startScreen.x) / scale;
      const dy = -(sy - dragging.startScreen.y) / scale;
      const obj = dragging.obj;
      if (obj.type === 'point') { obj.x = dragging.startProps.x + dx; obj.y = dragging.startProps.y + dy; }
      else if (obj.type === 'line' || obj.type === 'rline') { obj.x1 = dragging.startProps.x1 + dx; obj.y1 = dragging.startProps.y1 + dy; obj.x2 = dragging.startProps.x2 + dx; obj.y2 = dragging.startProps.y2 + dy; }
      else if (obj.type === 'circle' || obj.type === 'arc') { obj.x = dragging.startProps.x + dx; obj.y = dragging.startProps.y + dy; }
      else if (obj.type === 'text') { obj.x = dragging.startProps.x + dx; obj.y = dragging.startProps.y + dy; }
      requestRender(); updateObjectsListUI(); refreshFormPointSelect();
      return;
    }
    if (isPanning && panStart) {
      view.offsetX = panStart.offsetX + (sx - panStart.x);
      view.offsetY = panStart.offsetY + (sy - panStart.y);
      requestRender();
      return;
    }
  }

  function pointerUp() { isPanning = false; panStart = null; dragging = null; }

  function findObjectAtScreen(sx, sy) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (!obj.visible) continue;
      if (isPointNearObject(obj, sx, sy)) return obj;
    }
    return null;
  }

  function isPointNearObject(obj, sx, sy) {
    const p = screenToWorld(sx, sy);
    if (obj.type === 'point') {
      return Math.hypot(p.x - obj.x, p.y - obj.y) * scale <= HIT_TOLERANCE;
    } else if (obj.type === 'line') {
      const ax = obj.x1, ay = obj.y1, bx = obj.x2, by = obj.y2;
      const px = p.x, py = p.y;
      const vx = bx - ax, vy = by - ay;
      const wx = px - ax, wy = py - ay;
      const c1 = vx*wx + vy*wy; const c2 = vx*vx + vy*vy;
      let t = c2 < 1e-12 ? 0 : c1 / c2; t = Math.max(0, Math.min(1, t));
      const projx = ax + t*vx, projy = ay + t*vy;
      return Math.hypot(px - projx, py - projy) * scale <= HIT_TOLERANCE;
    } else if (obj.type === 'rline') {
      const ax = obj.x1, ay = obj.y1, bx = obj.x2, by = obj.y2;
      const px = p.x, py = p.y;
      const vx = bx - ax, vy = by - ay;
      const wx = px - ax, wy = py - ay;
      const c2 = vx*vx + vy*vy; if (c2 < 1e-12) return false;
      const t = (vx*wx + vy*wy) / c2;
      const projx = ax + t*vx, projy = ay + t*vy;
      return Math.hypot(px - projx, py - projy) * scale <= HIT_TOLERANCE;
    } else if (obj.type === 'circle' || obj.type === 'arc') {
      const d = Math.hypot(p.x - obj.x, p.y - obj.y) * scale;
      const rpx = Math.abs(obj.radius * scale);
      return Math.abs(d - rpx) <= Math.max(8, Math.min(20, rpx * 0.2));
    } else if (obj.type === 'text') {
      const fontPx = obj.fontSize || 12; const lines = String(obj.text||'').split('\n'); const lh = Math.round(fontPx * 1.2);
      const maxChars = Math.max(...lines.map(l => l.length), 1); const approxW = (fontPx * 0.6) * maxChars;
      const screenP = worldToScreen(obj.x, obj.y);
      let left = screenP.x; if (obj.align === 'center') left = screenP.x - approxW/2; if (obj.align === 'right') left = screenP.x - approxW;
      const right = left + approxW; const top = screenP.y; const bottom = top + lines.length * lh;
      return sx >= left && sx <= right && sy >= top && sy <= bottom;
    }
    return false;
  }

  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const factor = wheel > 0 ? 1.12 : 1 / 1.12;
    zoomAtScreen(sx, sy, factor);
  }, { passive:false });

  function zoomAtScreen(sx, sy, factor) {
    const before = screenToWorld(sx, sy);
    scale *= factor; scale = Math.max(2, Math.min(400, scale));
    const after = screenToWorld(sx, sy);
    view.offsetX += (after.x - before.x) * scale;
    view.offsetY += (before.y - after.y) * scale;
    requestRender();
  }

  // ---------- Buttons wiring ----------
  zoomInBtn.addEventListener('click', () => { const cx = canvas.clientWidth/2, cy = canvas.clientHeight/2; zoomAtScreen(cx, cy, 1.12); });
  zoomOutBtn.addEventListener('click', () => { const cx = canvas.clientWidth/2, cy = canvas.clientHeight/2; zoomAtScreen(cx, cy, 1/1.12); });
  resetBtn.addEventListener('click', fitToCanvas);
  
  clearBtn.addEventListener('click', () => { objects.length = 0; updateObjectsListUI(); requestRender(); });
  
  screenshotBtn.addEventListener('click', () => { const dataURL = canvas.toDataURL('image/png'); const a = document.createElement('a'); a.href = dataURL; a.download = 'sheet-screenshot.png'; a.click(); });
  
  screenshotBtnA4.addEventListener('click', async () => {
  try {
    const blob = await screenshotA4ResetAndCapture(canvas, { dpi: 300, returnBlob: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sheet-A4-screenshot.png';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erreur capture A4 :', err);
  }
});
  
  

  exportBtn.addEventListener('click', () => {
    const payload = { orientation: orientationSelect.value, view:{offsetX:view.offsetX, offsetY:view.offsetY, scale}, showAxes, showGrid, showTicks, showMM, objects };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sheet-export.json'; a.click(); URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.objects && Array.isArray(data.objects)) {
          objects.length = 0;
          for (const o of data.objects) objects.push(o);
          if (data.view) { view.offsetX = data.view.offsetX || 0; view.offsetY = data.view.offsetY || 0; scale = data.view.scale || scale; }
          if (data.orientation) orientationSelect.value = data.orientation;
          showAxes = !!data.showAxes; showGrid = !!data.showGrid; showTicks = !!data.showTicks; showMM = !!data.showMM;
          showAxesChk.checked = showAxes; showGridChk.checked = showGrid; showTicksChk.checked = showTicks; showMMChk.checked = showMM;
          updateObjectsListUI(); refreshFormPointSelect(); requestRender(); alert('Import OK');
        } else alert('Fichier JSON invalide (format attendu).');
      } catch (err) { alert('Erreur lecture JSON: ' + err.message); }
    };
    reader.readAsText(f); ev.target.value = '';
  });

  helpBtn.addEventListener('click', () => { helpModal.setAttribute('aria-hidden', 'false'); });
  helpClose && helpClose.addEventListener('click', () => { helpModal.setAttribute('aria-hidden', 'true'); });

  showAxesChk.addEventListener('change', (e) => { showAxes = e.target.checked; requestRender(); });
  showGridChk.addEventListener('change', (e) => { showGrid = e.target.checked; requestRender(); });
  showTicksChk.addEventListener('change', (e) => { showTicks = e.target.checked; requestRender(); });
  showMMChk.addEventListener('change', (e) => { showMM = e.target.checked; requestRender(); });
  showFrameChk && showFrameChk.addEventListener('change', () => requestRender());
  
  orientationSelect.addEventListener('change', fitToCanvas);

  /*
  // original mais bug
  toggleLabelsBtn.addEventListener('click', () => {
    const anyHidden = objects.some(o => o.showLabel === false);
    for (const o of objects) o.showLabel = !anyHidden;
    updateObjectsListUI(); requestRender();
  });
  */  
  
  // labelsVisibility definie au demarrage sur 1
  toggleLabelsBtn.addEventListener('click', () => {
  labelsVisibility = 1 - labelsVisibility; // Toggle 0↔1
  for (const o of objects) o.showLabel = !!labelsVisibility;
  
  // Update TOUS les boutons existants
  document.querySelectorAll('.icon-btn.icon-label').forEach(btn => {
    btn.title = labelsVisibility ? 'Cacher le nom' : 'Afficher le nom';
    btn.innerHTML = labelsVisibility ? SVG_LABEL_ON : SVG_LABEL_OFF;
    btn.className = `icon-btn icon-label ${labelsVisibility ? 'on' : 'off'}`;
  });
  
  requestRender();
});

  // ---------- Form UI: tabs & fields ----------
  function setActiveTab(t) { currentTab = t; tabs.forEach(tb => tb.classList.toggle('active', tb.dataset.type === t)); renderFormForType(t); }
  tabs.forEach(tb => tb.addEventListener('click', () => { cancelEditMode(); setActiveTab(tb.dataset.type); }));
  setActiveTab('point');

  function getPointsList() { return objects.filter(o => o.type === 'point'); }
  function getLinesList() { return objects.filter(o => o.type === 'line'); }
  function getRLinesList() { return objects.filter(o => o.type === 'rline'); }

  function refreshFormPointSelect() {
    const selects = formFields.querySelectorAll('select[name="centerPoint"], select[name="point1"], select[name="point2"], select[name="point"], select[name="line"], select[name="objA"], select[name="objB"]');
    const points = getPointsList();
    const lines = getLinesList();
    selects.forEach(sel => {
      const name = sel.getAttribute('name');
      const prev = sel.value;
      sel.innerHTML = `<option value="">-- choisir --</option>`;
      if (name === 'line') {
        for (const l of lines) { const opt = document.createElement('option'); opt.value = l.id; opt.textContent = `${l.name || l.id} (${l.type})`; sel.appendChild(opt); }
      } else if (name === 'objA' || name === 'objB') {
        for (const o of objects) if (isNonFilled(o)) { const opt = document.createElement('option'); opt.value = o.id; opt.textContent = `${o.name || o.id} (${o.type})`; sel.appendChild(opt); }
      } else {
        for (const p of points) { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.name || p.id} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`; sel.appendChild(opt); }
      }
      if (prev) sel.value = prev;
    });
  }

  function attachCenterModeHandlers() {
    const radios = formFields.querySelectorAll('input[name="centerMode"]');
    if (!radios || radios.length === 0) return;
    const manualRow = formFields.querySelector('.center-manual');
    const pointRow = formFields.querySelector('.center-point');
    function update() {
      const mode = formFields.querySelector('input[name="centerMode"]:checked')?.value || 'manual';
      if (manualRow) manualRow.style.display = mode === 'manual' ? 'flex' : 'none';
      if (pointRow) pointRow.style.display = mode === 'fromPoint' ? 'flex' : 'none';
    }
    radios.forEach(r => r.addEventListener('change', update));
    update(); refreshFormPointSelect();
  }

  function attachLineEndpointsHandlers() {
    const radios = formFields.querySelectorAll('input[name="endpointsMode"]');
    if (!radios || radios.length === 0) return;
    const manualRows = formFields.querySelectorAll('.endpoints-manual');
    const pointsRow = formFields.querySelector('.endpoints-points');
    function update() {
      const mode = formFields.querySelector('input[name="endpointsMode"]:checked')?.value || 'manual';
      manualRows.forEach(r => r.style.display = mode === 'manual' ? 'flex' : 'none');
      if (pointsRow) pointsRow.style.display = mode === 'fromPoints' ? 'flex' : 'none';
    }
    radios.forEach(r => r.addEventListener('change', update));
    update(); refreshFormPointSelect();
  }

  function renderFormForType(type, values = {}) {
    const v = (name, def='') => values[name] !== undefined ? values[name] : def;
    let html = `<div class="form-row"><label>Nom<input name="name" type="text" value="${escapeHtml(v('name',''))}" /></label></div>`;
    if (type === 'point') {
      html += `<div class="form-row"><label>X (cm)<input name="x" type="number" step="0.1" value="${v('x',0)}" /></label><label>Y (cm)<input name="y" type="number" step="0.1" value="${v('y',0)}" /></label></div>`;
      html += `<div class="form-row"><label>Couleur<input name="color" type="color" value="${v('color','#c0392b')}" /></label></div>`;
    } else if (type === 'line') {
      const mode = v('endpointsMode', 'manual');
      html += `<div class="form-row"><label style="display:flex;align-items:center;"><input type="radio" name="endpointsMode" value="manual" ${mode==='manual'?'checked':''} /> Entrer coordonnées</label><label style="display:flex;align-items:center;margin-left:8px;"><input type="radio" name="endpointsMode" value="fromPoints" ${mode==='fromPoints'?'checked':''} /> Depuis deux points</label></div>`;
      html += `<div class="form-row endpoints-manual"><label>X1<input name="x1" type="number" step="0.1" value="${v('x1',-1)}" /></label><label>Y1<input name="y1" type="number" step="0.1" value="${v('y1',0)}" /></label></div>`;
      html += `<div class="form-row endpoints-manual"><label>X2<input name="x2" type="number" step="0.1" value="${v('x2',1)}" /></label><label>Y2<input name="y2" type="number" step="0.1" value="${v('y2',0)}" /></label></div>`;
      html += `<div class="form-row endpoints-points" style="display:none"><label>Point 1<select name="point1"><option value="">-- choisir --</option></select></label><label>Point 2<select name="point2"><option value="">-- choisir --</option></select></label></div>`;
      html += `<div class="form-row"><label>Épaisseur<input name="thickness" type="number" step="0.1" value="${v('thickness',2)}" /></label><label>Couleur<input name="color" type="color" value="${v('color','#1f75fe')}" /></label></div>`;
    } 
    
      else if (type === 'circle' || type === 'arc') {
      const centerMode = v('centerMode', 'manual');
      html += `<div class="form-row"><label style="display:flex;align-items:center;"><input type="radio" name="centerMode" value="manual" ${centerMode==='manual'?'checked':''} /> Entrer centre</label><label style="display:flex;align-items:center;margin-left:8px;"><input type="radio" name="centerMode" value="fromPoint" ${centerMode==='fromPoint'?'checked':''} /> Depuis un point</label></div>`;
      html += `<div class="form-row center-manual"><label>X (cm)<input name="x" type="number" step="0.1" value="${v('x',0)}" /></label><label>Y (cm)<input name="y" type="number" step="0.1" value="${v('y',0)}" /></label></div>`;
      html += `<div class="form-row center-point" style="display:none"><label>Point centre<select name="centerPoint"><option value="">-- choisir --</option></select></label></div>`;
      html += `<div class="form-row"><label>Rayon (cm)<input name="radius" type="number" step="0.1" value="${v('radius',3)}" /></label>`;      
      if (type === 'arc') 
         {
         html += `<label>Sens anti-horaire<input name="anticlockwise" type="checkbox" ${v('anticlockwise')?'checked':''} /></label></div>`;
         html += `<div class="form-row"><label>Angle début (deg)<input name="startDeg" type="number" step="1" value="${v('startDeg',0)}" /></label>`;
         html += `<label>Angle fin (deg)<input name="endDeg" type="number" step="1" value="${v('endDeg',90)}" /></label></div>`;       
         } 
      else 
         {
         html += `</div>`;
         }
      html += `<div class="form-row"><label>Contour<input name="strokeColor" type="color" value="${v('strokeColor', '#1c7a3b')}" /></label><label>Épaisseur<input name="strokeWidth" type="number" step="0.1" value="${v('strokeWidth',2)}" /></label></div>`;
      html += `<div class="form-row"><label>Remplissage<input name="fill" type="checkbox" ${v('fill')?'checked':''} /></label><label>Couleur remplissage<input name="fillColor" type="color" value="${v('fillColor','#cfead9')}" /></label></div>`;
    } 
    
      else if (type === 'perp') {
      html += `<div class="form-row"><label>Ligne<select name="line"><option value="">-- choisir --</option></select></label><label>Point<select name="point"><option value="">-- choisir --</option></select></label></div>`;
      html += `<div class="form-row"><label style="color:#666;font-size:13px">Crée le pied H et le segment perpendiculaire.</label></div>`;
    } else if (type === 'triangle') {
      html += `<div class="form-row"><label>Segment<select name="line"><option value="">-- choisir --</option></select></label><label>Point<select name="point"><option value="">-- choisir --</option></select></label></div>`;
      html += `<div class="form-row"><label style="color:#666;font-size:13px">Crée les deux segments.</label></div>`;
    } else if (type === 'droite') {
      html += `<div class="form-row"><label>Segment (base)<select name="line"><option value="">-- choisir --</option></select></label></div>`;
      html += `<div class="form-row"><label style="color:#666;font-size:13px">Crée une droite infinie à partir du segment.</label></div>`;
    } else if (type === 'parallel') {
      html += `<div class="form-row"><label>Ligne de base<select name="line"><option value="">-- choisir --</option></select></label><label>Point<select name="point"><option value="">-- choisir --</option></select></label></div>`;
      html += `<div class="form-row"><label style="color:#666;font-size:13px">Crée une droite parallèle passant par le point choisi.</label></div>`;
    } else if (type === 'intersections') {
      html += `<div class="form-row"><label>Objet A<select name="objA"></select></label><label>Objet B<select name="objB"></select></label></div>`;
      html += `<div class="form-row"><label style="color:#666;font-size:13px">Calcule intersections d'objets non-plein (lignes/cercle/arc non remplis).</label></div>`;
    } 
    
    else if (type === 'text') {
      html += `<div class="form-row"><label>X (cm)<input name="x" type="number" step="0.1" value="${v('x',0)}"/></label><label>Y (cm)<input name="y" type="number" step="0.1" value="${v('y',0)}"/></label></div>`;
      html += `<div class="form-row"><label>Texte<textarea name="text" rows="4">${v('text','')}</textarea></label></div>`;
      html += `<div class="form-row"><label>Taille (px)<input name="fontSize" type="number" step="1" value="${v('fontSize',12)}"/></label><label>Couleur (fill)<input name="color" type="color" value="${v('color','#111')}"/></label></div>`;
      html += `<div class="form-row"><label>Stroke<input name="stroke" type="checkbox" ${v('stroke')?'checked':''}/></label><label>Couleur stroke<input name="strokeColor" type="color" value="${v('strokeColor','#000000')}"/></label></div>`;
      html += `<div class="form-row"><label><input type="checkbox" name="bold" ${v('bold')?'checked':''}/> Gras</label><label><input type="checkbox" name="italic" ${v('italic')?'checked':''}/> Italique</label></div>`;
      html += `<div class="form-row"><label><input type="checkbox" name="underline" ${v('underline')?'checked':''}/> Souligné</label><label><input type="checkbox" name="strike" ${v('strike')?'checked':''}/> Barré</label></div>`;
      html += `<div class="form-row"><label>Align<select name="align"><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label></div>`;
      html += `<div class="form-row"><div class="text-preview" id="text-preview">Aperçu</div></div>`;
    }

    formFields.innerHTML = html;
    attachCenterModeHandlers();
    attachLineEndpointsHandlers();
    refreshFormPointSelect();

    if (type === 'intersections') {
      const selA = formFields.querySelector('select[name="objA"]');
      const selB = formFields.querySelector('select[name="objB"]');
      selA.innerHTML = `<option value="">-- choisir --</option>`;
      selB.innerHTML = `<option value="">-- choisir --</option>`;
      for (const o of objects) if (isNonFilled(o)) { const opt = document.createElement('option'); opt.value = o.id; opt.textContent = `${o.name || o.id} (${o.type})`; selA.appendChild(opt); selB.appendChild(opt.cloneNode(true)); }
    }

    if (type === 'text') {
      const preview = document.getElementById('text-preview');
      const inputs = formFields.querySelectorAll('textarea[name="text"], input[name="fontSize"], input[name="color"], input[name="stroke"], input[name="strokeColor"], input[name="bold"], input[name="italic"], input[name="underline"], input[name="strike"], select[name="align"]');
      function updatePreview(){
        const text = formFields.querySelector('textarea[name="text"]').value || '';
        const size = parseInt(formFields.querySelector('input[name="fontSize"]').value || '12');
        const color = formFields.querySelector('input[name="color"]').value || '#111';
        const stroke = formFields.querySelector('input[name="stroke"]').checked;
        const strokeColor = formFields.querySelector('input[name="strokeColor"]').value || '#000';
        const bold = formFields.querySelector('input[name="bold"]').checked;
        const italic = formFields.querySelector('input[name="italic"]').checked;
        const underline = formFields.querySelector('input[name="underline"]').checked;
        const strike = formFields.querySelector('input[name="strike"]').checked;
        const align = formFields.querySelector('select[name="align"]').value || 'left';
        preview.style.fontFamily = 'sans-serif'; preview.style.fontSize = size + 'px'; preview.style.color = color;
        preview.style.fontWeight = bold ? '700' : '400'; preview.style.fontStyle = italic ? 'italic' : 'normal';
        let deco = '';
        if (underline) deco += ' underline';
        if (strike) deco += ' line-through';
        preview.style.textDecoration = deco.trim();
        if (stroke) { preview.style.webkitTextStroke = '1px ' + strokeColor; preview.style.textShadow = `-1px -1px ${strokeColor}, 1px -1px ${strokeColor}, -1px 1px ${strokeColor}, 1px 1px ${strokeColor}`; }
        else { preview.style.webkitTextStroke = '0px transparent'; preview.style.textShadow = 'none'; }
        preview.style.textAlign = align;
        preview.textContent = text || 'Aperçu';
      }
      inputs.forEach(inp => inp.addEventListener('input', updatePreview));
      updatePreview();
    }
  }

  // ---------- Constructions & operations ---------- 
  
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }  
  
  function createPerpendicularBetween(lineObj, pointObj){
    if (!lineObj || !pointObj) return 0;
    const ax = (lineObj.x1 ?? 0), ay = (lineObj.y1 ?? 0), bx = (lineObj.x2 ?? 0), by = (lineObj.y2 ?? 0);
    const vx = bx - ax, vy = by - ay; const mag2 = vx*vx + vy*vy; if (mag2 < EPS) { alert('Ligne dégénérée'); return 0; }
    const t = ((pointObj.x - ax)*vx + (pointObj.y - ay)*vy) / mag2;
    const foot = { x: ax + t*vx, y: ay + t*vy };
    for (const o of objects) if (o.type === 'point' && dist(o, foot) < DUP_EPS) {
      const seg = { id: uid('o_'), type: 'line', name: `h_${lineObj.name||lineObj.id}_${pointObj.name||pointObj.id}`, visible:true, x1: pointObj.x, y1: pointObj.y, x2: o.x, y2: o.y, thickness:1.5, color:'#2d3748', showLabel:false };
      objects.push(seg); updateObjectsListUI(); refreshFormPointSelect(); requestRender(); return 1;
    }
    const footP = { id: uid('o_'), type:'point', name: `H_${lineObj.name||lineObj.id}_${pointObj.name||pointObj.id}`, visible:true, x: foot.x, y: foot.y, color:'#16a085', showLabel:true };
    objects.push(footP);
    const seg = { id: uid('o_'), type:'line', name: `h_${lineObj.name||lineObj.id}_${pointObj.name||pointObj.id}`, visible:true, x1: pointObj.x, y1: pointObj.y, x2: foot.x, y2: foot.y, thickness:1.5, color:'#2d3748', showLabel:false };
    objects.push(seg);
    updateObjectsListUI(); refreshFormPointSelect(); requestRender(); return 1;
  }
  
 

  function createTriangleFromSegmentAndPoint(segmentObj, pointObj){
    if (!segmentObj || !pointObj) return 0;
    const A = { x: segmentObj.x1, y: segmentObj.y1 }, B = { x: segmentObj.x2, y: segmentObj.y2 };
    const lineAS = { id: uid('o_'), type:'line', name: `AS_${pointObj.name||pointObj.id}`, visible:true, x1: A.x, y1: A.y, x2: pointObj.x, y2: pointObj.y, thickness:1.5, color:'#0b7285', showLabel:false };
    const lineBS = { id: uid('o_'), type:'line', name: `BS_${pointObj.name||pointObj.id}`, visible:true, x1: B.x, y1: B.y, x2: pointObj.x, y2: pointObj.y, thickness:1.5, color:'#0b7285', showLabel:false };
    objects.push(lineAS, lineBS);
    updateObjectsListUI(); refreshFormPointSelect(); requestRender(); return 2;
  }

  function createRLineFromSegment(segmentObj){
    if (!segmentObj) return 0;
    const r = { id: uid('o_'), type:'rline', name: `d_${segmentObj.name||segmentObj.id}`, visible:true, x1: segmentObj.x1, y1: segmentObj.y1, x2: segmentObj.x2, y2: segmentObj.y2, thickness:1.5, color:'#9b2c2c', showLabel:true };
    objects.push(r);
    updateObjectsListUI(); refreshFormPointSelect(); requestRender(); return 1;
  }

  function createParallel(lineObj, pointObj){
    if (!lineObj || !pointObj) return 0;
    const dx = (lineObj.x2 - lineObj.x1), dy = (lineObj.y2 - lineObj.y1);
    const p1 = { x: pointObj.x - dx, y: pointObj.y - dy }, p2 = { x: pointObj.x + dx, y: pointObj.y + dy };
    const r = { id: uid('o_'), type:'rline', name: `par_${lineObj.name||lineObj.id}_${pointObj.name||pointObj.id}`, visible:true, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, thickness:1.5, color:'#4a5568', showLabel:true };
    objects.push(r);
    updateObjectsListUI(); refreshFormPointSelect(); requestRender(); return 1;
  }

  // ---------- intersections (kept) ----------
  function intersectSegments(s1, s2) { const x1=s1.x1,y1=s1.y1,x2=s1.x2,y2=s1.y2,x3=s2.x1,y3=s2.y1,x4=s2.x2,y4=s2.y2; const denom=(y4-y3)*(x2-x1)-(x4-x3)*(y2-y1); if(Math.abs(denom) < EPS) return []; const ua=((x4-x3)*(y1-y3)-(y4-y3)*(x1-x3))/denom; const ub=((x2-x1)*(y1-y3)-(y2-y1)*(x1-x3))/denom; if(ua < -EPS || ua > 1+EPS || ub < -EPS || ub > 1+EPS) return []; return [{ x: x1 + ua*(x2-x1), y: y1 + ua*(y2-y1) }]; }
  function intersectSegmentCircle(seg, circ) { const cx=circ.x, cy=circ.y, r=circ.radius; const x1=seg.x1-cx,y1=seg.y1-cy,x2=seg.x2-cx,y2=seg.y2-cy; const dx=x2-x1, dy=y2-y1; const a=dx*dx+dy*dy; const b=2*(x1*dx+y1*dy); const c=x1*x1+y1*y1-r*r; const disc=b*b-4*a*c; if(disc < -EPS) return []; const pts=[]; if(Math.abs(disc) < EPS){ const t = -b/(2*a); if(t>=-EPS&&t<=1+EPS) pts.push({x:cx + x1 + t*dx, y:cy + y1 + t*dy}); } else { const sd=Math.sqrt(Math.max(0,disc)); const t1=(-b+sd)/(2*a), t2=(-b-sd)/(2*a); if(t1>=-EPS&&t1<=1+EPS) pts.push({x:cx + x1 + t1*dx, y:cy + y1 + t1*dy}); if(t2>=-EPS&&t2<=1+EPS) pts.push({x:cx + x1 + t2*dx, y:cy + y1 + t2*dy}); } return pts; }
  function intersectCircles(c1,c2) { const x0=c1.x,y0=c1.y,r0=c1.radius,x1=c2.x,y1=c2.y,r1=c2.radius; const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy); if(d < EPS) return []; if(d > r0+r1+EPS) return []; if(d < Math.abs(r0-r1)-EPS) return []; const a=(r0*r0 - r1*r1 + d*d)/(2*d); const h2=Math.max(0, r0*r0 - a*a); const xm=x0+a*dx/d, ym=y0+a*dy/d; if(h2 < EPS) return [{x:xm,y:ym}]; const h=Math.sqrt(h2); const rx=-dy*(h/d), ry=dx*(h/d); return [{x:xm+rx,y:ym+ry},{x:xm-rx,y:ym-ry}]; }

  function findIntersections(objA, objB) {
    if (!objA || !objB) return [];
    if (!isNonFilled(objA) || !isNonFilled(objB)) return [];
    const res = [];
    function pushUnique(pt) { for (const p of res) if (dist(p,pt) < DUP_EPS) return; res.push(pt); }
    if (objA.type==='line' && objB.type==='line') intersectSegments(objA,objB).forEach(p=>pushUnique(p));
    if (objA.type==='line' && objB.type==='circle') intersectSegmentCircle(objA,objB).forEach(p=>pushUnique(p));
    if (objB.type==='line' && objA.type==='circle') intersectSegmentCircle(objB,objA).forEach(p=>pushUnique(p));
    if (objA.type==='circle' && objB.type==='circle') intersectCircles(objA,objB).forEach(p=>pushUnique(p));
    function filterByArc(pts, arc){ return pts.filter(pt => angleOnArc(Math.atan2(pt.y-arc.y, pt.x-arc.x), arc)); }
    if (objA.type==='line' && objB.type==='arc') filterByArc(intersectSegmentCircle(objA,objB), objB).forEach(p=>pushUnique(p));
    if (objB.type==='line' && objA.type==='arc') filterByArc(intersectSegmentCircle(objB,objA), objA).forEach(p=>pushUnique(p));
    if (objA.type==='circle' && objB.type==='arc') filterByArc(intersectCircles(objA,objB), objB).forEach(p=>pushUnique(p));
    if (objB.type==='circle' && objA.type==='arc') filterByArc(intersectCircles(objB,objA), objA).forEach(p=>pushUnique(p));
    if (objA.type==='arc' && objB.type==='arc') {
      intersectCircles(objA,objB).forEach(p => {
        if (angleOnArc(Math.atan2(p.y-objA.y,p.x-objA.x), objA) && angleOnArc(Math.atan2(p.y-objB.y,p.x-objB.x), objB)) pushUnique(p);
      });
    }
    return res;
  }

  function createIntersectionPointsBetween(objA, objB) {
    const pts = findIntersections(objA, objB);
    if (!pts.length) return 0;
    let created = 0;
    pts.forEach((p, i) => {
      let exists = false;
      for (const o of objects) if (o.type === 'point' && dist(o,p) < DUP_EPS) { exists = true; break; }
      if (exists) return;
      const name = `I_${(objA.name||objA.id)}_${(objB.name||objB.id)}_${i+1}`;
      objects.push({ id: uid('I_'), type:'point', name, visible:true, x:p.x, y:p.y, color:'#e67e22', showLabel:true });
      created++;
    });
    if (created) { updateObjectsListUI(); refreshFormPointSelect(); requestRender(); }
    return created;
  }

  function removeCreatedIntersectionPoints() {
    let removed = 0;
    for (let i = objects.length-1; i >= 0; i--) {
      const o = objects[i];
      if (o.type === 'point' && ((o.id && o.id.startsWith('I_')) || (o.name && o.name.startsWith('I_')))) { objects.splice(i,1); removed++; }
    }
    if (removed) { updateObjectsListUI(); refreshFormPointSelect(); requestRender(); }
    return removed;
  }

  // ---------- form submit ----------
  createForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = new FormData(createForm);
    const name = data.get('name') || '';

    function resolveCenterFromForm() {
      const centerMode = data.get('centerMode') || 'manual';
      if (centerMode === 'fromPoint') {
        const pid = data.get('centerPoint');
        if (pid) {
          const p = objects.find(o => o.id === pid && o.type === 'point');
          if (p) return { x: p.x, y: p.y };
        }
      }
      return { x: parseFloat(data.get('x')) || 0, y: parseFloat(data.get('y')) || 0 };
    }

    function resolveLineEndpointsFromForm() {
      const mode = data.get('endpointsMode') || 'manual';
      if (mode === 'fromPoints') {
        const pid1 = data.get('point1'), pid2 = data.get('point2');
        const p1 = objects.find(o => o.id === pid1 && o.type === 'point');
        const p2 = objects.find(o => o.id === pid2 && o.type === 'point');
        if (p1 && p2) return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      return { x1: parseFloat(data.get('x1')) || 0, y1: parseFloat(data.get('y1')) || 0, x2: parseFloat(data.get('x2')) || 0, y2: parseFloat(data.get('y2')) || 0 };
    }

    if (currentTab === 'perp') {
      const lineId = data.get('line'), pointId = data.get('point');
      if (!lineId || !pointId) { alert('Choisir une ligne et un point.'); return; }
      const lineObj = objects.find(o => o.id === lineId && (o.type === 'line' || o.type === 'rline'));
      const pointObj = objects.find(o => o.id === pointId && o.type === 'point');
      if (!lineObj || !pointObj) { alert('Objets introuvables.'); return; }
      createPerpendicularBetween(lineObj, pointObj); createForm.reset(); return;
    }

    if (currentTab === 'triangle') {
      const lineId = data.get('line'), pointId = data.get('point');
      if (!lineId || !pointId) { alert('Choisir un segment et un point.'); return; }
      const segmentObj = objects.find(o => o.id === lineId && o.type === 'line');
      const pointObj = objects.find(o => o.id === pointId && o.type === 'point');
      if (!segmentObj || !pointObj) { alert('Objets introuvables.'); return; }
      createTriangleFromSegmentAndPoint(segmentObj, pointObj); createForm.reset(); return;
    }

    if (currentTab === 'droite') {
      const lineId = data.get('line');
      if (!lineId) { alert('Choisir un segment.'); return; }
      const segmentObj = objects.find(o => o.id === lineId && o.type === 'line');
      if (!segmentObj) { alert('Segment introuvable.'); return; }
      createRLineFromSegment(segmentObj); createForm.reset(); return;
    }

    if (currentTab === 'parallel') {
      const lineId = data.get('line'), pointId = data.get('point');
      if (!lineId || !pointId) { alert('Choisir une ligne et un point.'); return; }
      const lineObj = objects.find(o => o.id === lineId && (o.type === 'line' || o.type === 'rline'));
      const pointObj = objects.find(o => o.id === pointId && o.type === 'point');
      if (!lineObj || !pointObj) { alert('Objets introuvables.'); return; }
      createParallel(lineObj, pointObj); createForm.reset(); return;
    }

    if (currentTab === 'intersections') {
      const idA = data.get('objA'), idB = data.get('objB');
      if (!idA || !idB) { alert('Choisir deux objets.'); return; }
      if (idA === idB) { alert('Choisir deux objets différents.'); return; }
      const objA = objects.find(o => o.id === idA), objB = objects.find(o => o.id === idB);
      if (!objA || !objB) { alert('Objets introuvables.'); return; }
      if (!isNonFilled(objA) || !isNonFilled(objB)) { alert('Objets non éligibles.'); return; }
      const created = createIntersectionPointsBetween(objA, objB);
      alert(created === 0 ? 'Aucune intersection.' : `${created} point(s) créé(s).`); return;
    }

    // edit or create primary types & text
    if (editTargetId) {
      const obj = objects.find(o => o.id === editTargetId);
      if (!obj) { cancelEditMode(); return; }
      obj.name = name || obj.name;
      if (obj.type === 'point') {
        obj.x = parseFloat(data.get('x')) || 0; obj.y = parseFloat(data.get('y')) || 0; obj.color = data.get('color') || obj.color;
      } else if (obj.type === 'line') {
        const e = resolveLineEndpointsFromForm(); obj.x1 = e.x1; obj.y1 = e.y1; obj.x2 = e.x2; obj.y2 = e.y2; obj.thickness = parseFloat(data.get('thickness')) || obj.thickness || 2; obj.color = data.get('color') || obj.color;
      } else if (obj.type === 'circle') {
        const c = resolveCenterFromForm(); obj.x = c.x; obj.y = c.y; obj.radius = Math.abs(parseFloat(data.get('radius')) || obj.radius || 1); obj.strokeColor = data.get('strokeColor') || obj.strokeColor; obj.strokeWidth = parseFloat(data.get('strokeWidth')) || obj.strokeWidth || 2; obj.fill = data.get('fill') ? true : false; obj.fillColor = data.get('fillColor') || obj.fillColor;
      } else if (obj.type === 'arc') {
        const c = resolveCenterFromForm(); obj.x = c.x; obj.y = c.y; obj.radius = Math.abs(parseFloat(data.get('radius')) || obj.radius || 1); obj.startDeg = parseFloat(data.get('startDeg')) || obj.startDeg || 0; obj.endDeg = parseFloat(data.get('endDeg')) || obj.endDeg || 90; obj.anticlockwise = data.get('anticlockwise') ? true : false; obj.strokeColor = data.get('strokeColor') || obj.strokeColor; obj.strokeWidth = parseFloat(data.get('strokeWidth')) || obj.strokeWidth || 2; obj.fill = data.get('fill') ? true : false; obj.fillColor = data.get('fillColor') || obj.fillColor;
      } else if (obj.type === 'text') {
        obj.x = parseFloat(data.get('x')) || 0; obj.y = parseFloat(data.get('y')) || 0; obj.text = data.get('text') || ''; obj.fontSize = parseInt(data.get('fontSize')) || 12; obj.color = data.get('color') || '#111'; obj.stroke = data.get('stroke') ? true : false; obj.strokeColor = data.get('strokeColor') || '#000'; obj.bold = data.get('bold') ? true : false; obj.italic = data.get('italic') ? true : false; obj.underline = data.get('underline') ? true : false; obj.strike = data.get('strike') ? true : false; obj.align = data.get('align') || 'left';
      }
      cancelEditMode();
    } else {
      // create
      if (currentTab === 'point') {
        const x = parseFloat(data.get('x')) || 0; const y = parseFloat(data.get('y')) || 0; const color = data.get('color') || '#c0392b';
        objects.push({ id: uid('o_'), type: 'point', name, visible: true, x, y, color, showLabel: true });
      } else if (currentTab === 'line') {
        const e = resolveLineEndpointsFromForm(); const thickness = parseFloat(data.get('thickness')) || 2; const color = data.get('color') || '#1f75fe';
        objects.push({ id: uid('o_'), type: 'line', name, visible: true, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, thickness, color, showLabel: true });
      } else if (currentTab === 'circle') {
        const c = resolveCenterFromForm(); const radius = Math.abs(parseFloat(data.get('radius')) || 1); const strokeColor = data.get('strokeColor') || '#1c7a3b'; const strokeWidth = parseFloat(data.get('strokeWidth')) || 2; const fill = data.get('fill') ? true : false; const fillColor = data.get('fillColor') || '#cfead9';
        objects.push({ id: uid('o_'), type: 'circle', name, visible: true, x: c.x, y: c.y, radius, strokeColor, strokeWidth, fill, fillColor, showLabel: true });
      } else if (currentTab === 'arc') {
        const c = resolveCenterFromForm(); const radius = Math.abs(parseFloat(data.get('radius')) || 1); const startDeg = parseFloat(data.get('startDeg')) || 0; const endDeg = parseFloat(data.get('endDeg')) || 90; const anticlockwise = data.get('anticlockwise') ? true : false; const strokeColor = data.get('strokeColor') || '#7b2cbf'; const strokeWidth = parseFloat(data.get('strokeWidth')) || 2; const fill = data.get('fill') ? true : false; const fillColor = data.get('fillColor') || '#ffd9e8';
        objects.push({ id: uid('o_'), type: 'arc', name, visible: true, x: c.x, y: c.y, radius, startDeg, endDeg, anticlockwise, strokeColor, strokeWidth, fill, fillColor, showLabel: true });
      } else if (currentTab === 'text') {
        const x = parseFloat(data.get('x')) || 0, y = parseFloat(data.get('y')) || 0; const text = data.get('text') || ''; const fontSize = parseInt(data.get('fontSize')) || 12; const color = data.get('color') || '#111'; const stroke = data.get('stroke') ? true : false; const strokeColor = data.get('strokeColor') || '#000'; const bold = data.get('bold') ? true : false; const italic = data.get('italic') ? true : false; const underline = data.get('underline') ? true : false; const strike = data.get('strike') ? true : false; const align = data.get('align') || 'left';
        objects.push({ id: uid('o_'), type: 'text', name, visible: true, x, y, text, fontSize, color, stroke, strokeColor, bold, italic, underline, strike, align, showLabel:false });
      }
    }

    updateObjectsListUI();
    refreshFormPointSelect();
    requestRender();
    createForm.reset();
    renderFormForType(currentTab);
  });

  createReset.addEventListener('click', () => { cancelEditMode(); renderFormForType(currentTab); });

  // ---------- Objects list UI ---------- 
  
  function iconButton(className, title, svgInner, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `icon-btn ${className}`;
    b.title = title;
    b.innerHTML = svgInner;
    b.addEventListener('click', onClick);
    return b;
  }
  
  function updateObjectsListUI() {
    objectsList.innerHTML = '';
    for (const obj of objects) {
      const li = document.createElement('li');
      const meta = document.createElement('div'); meta.className = 'obj-meta';
      meta.innerHTML = `<strong>${escapeHtml(obj.name || '('+obj.type+')')}</strong><small>${escapeHtml(obj.type)}</small>`;
      const actions = document.createElement('div'); actions.className = 'obj-actions';

      //original
      //const eyeBtn = iconButton('icon-eye', obj.visible ? 'Cacher' : 'Afficher', SVG_EYE, () => { obj.visible = !obj.visible; updateObjectsListUI(); requestRender(); });
      
      const eyeBtn = iconButton('icon-eye', obj.visible ? 'Cacher' : 'Afficher', obj.visible ? SVG_EYE : SVG_EYE_CLOSED, () => { obj.visible = !obj.visible; updateObjectsListUI(); requestRender(); } );      
      
      if (!obj.visible) eyeBtn.classList.add('hidden');


      const labelSvg = (obj.showLabel === false) ? SVG_LABEL_OFF : SVG_LABEL_ON;       
     
      const labelBtn = iconButton('icon-label ' + (obj.showLabel === false ? 'off' : 'on'), obj.showLabel === false ? 'Afficher le nom' : 'Cacher le nom', labelSvg, () => {
        obj.showLabel = !obj.showLabel; updateObjectsListUI(); requestRender();
      });
           

      const editBtn = iconButton('icon-edit', 'Éditer', SVG_PEN, () => openEditFormForObject(obj));

      // convert button
      /*
      const convBtn = iconButton('icon-convert', 'Convertir rline ↔ segment', SVG_CONVERT, () => {
        if (obj.type === 'rline') {
          const rect = canvasRectWorld();
          const pts = intersectLineWithRect({x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2}, rect);
          if (pts.length === 2) {
            const seg = { id: uid('o_'), type: 'line', name: `seg_${obj.name||obj.id}`, visible:true, x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y, thickness: obj.thickness || 1.5, color: obj.color || '#1f75fe', showLabel: obj.showLabel };
            seg._fromRLine = obj.id;
            obj._convertedLine = seg.id;
            obj.visible = false;
            objects.push(seg);
            updateObjectsListUI(); refreshFormPointSelect(); requestRender();
          } else alert('La droite n\'intersecte pas les bords visibles du canevas (conversion impossible).');
        } else if (obj.type === 'line') {
          if (obj._fromRLine) {
            const orig = objects.find(o => o.id === obj._fromRLine && o.type === 'rline');
            if (orig) {
              orig.visible = true; const idx = objects.indexOf(obj); if (idx >= 0) objects.splice(idx, 1); updateObjectsListUI(); refreshFormPointSelect(); requestRender(); return;
            }
          }
          const r = { id: uid('o_'), type: 'rline', name: `r_${obj.name||obj.id}`, visible:true, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, thickness: obj.thickness || 1.5, color: obj.color || '#9b2c2c', showLabel: obj.showLabel };
          r._fromLine = obj.id; obj._convertedRLine = r.id; obj.visible = false;
          objects.push(r);
          updateObjectsListUI(); refreshFormPointSelect(); requestRender();
        } else alert('Conversion disponible seulement pour segment <-> droite infinie.');
      });
      */
      
      const delBtn = iconButton('icon-delete', 'Supprimer', SVG_TRASH, () => {
        if (!confirm(`Supprimer ${obj.name || obj.type} ?`)) return;
        const idx = objects.indexOf(obj); if (idx >= 0) { objects.splice(idx, 1); updateObjectsListUI(); refreshFormPointSelect(); requestRender(); }
      });

      actions.appendChild(eyeBtn);
      actions.appendChild(labelBtn);
      actions.appendChild(editBtn);
      //actions.appendChild(convBtn);
      actions.appendChild(delBtn);

      li.appendChild(meta);
      li.appendChild(actions);
      objectsList.appendChild(li);
    }
    refreshFormPointSelect();
  }

  function openEditFormForObject(obj) {
    setActiveTab(obj.type);
    const vals = Object.assign({}, obj);
    if (obj.type === 'line') {
      const pts = getPointsList();
      const p1 = pts.find(p => Math.abs(p.x - obj.x1) < 1e-9 && Math.abs(p.y - obj.y1) < 1e-9);
      const p2 = pts.find(p => Math.abs(p.x - obj.x2) < 1e-9 && Math.abs(p.y - obj.y2) < 1e-9);
      if (p1 && p2) { vals.endpointsMode = 'fromPoints'; vals.point1 = p1.id; vals.point2 = p2.id; } else vals.endpointsMode = 'manual';
    }
    if (obj.type === 'text') {
      vals.x = obj.x; vals.y = obj.y; vals.text = obj.text; vals.fontSize = obj.fontSize; vals.color = obj.color; vals.stroke = obj.stroke; vals.strokeColor = obj.strokeColor; vals.bold = obj.bold; vals.italic = obj.italic; vals.underline = obj.underline; vals.strike = obj.strike; vals.align = obj.align;
    }
    renderFormForType(obj.type, vals);
    editTargetId = obj.id;
    createSubmit.textContent = 'Enregistrer';
  }

  function cancelEditMode() { editTargetId = null; createSubmit.textContent = 'Créer'; }

  // ---------- Initialization ----------
  function init() {
    resizeCanvas(); fitToCanvas(); updateObjectsListUI(); refreshFormPointSelect(); requestRender();
    showAxes = showAxesChk.checked; showGrid = showGridChk.checked; showTicks = showTicksChk.checked; showMM = showMMChk.checked;
  }
  init();

  // ---------- Expose helpers for debugging ----------
  window._sheet = { objects, createPerpendicularBetween, createTriangleFromSegmentAndPoint, createRLineFromSegment, createParallel, worldToScreen, screenToWorld, requestRender };

})();