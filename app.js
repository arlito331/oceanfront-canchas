import { db } from './firebase-config.js';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── Constants ───────────────────────────────────────────────────────────────
const COURTS = {
  grande: { id: 'grande', name: 'Cancha Grande', emoji: '⚽', desc: 'Fútbol / Multipropósito' },
  chica:  { id: 'chica',  name: 'Cancha Chica',  emoji: '🏀', desc: 'Basketball (medio campo)' }
};

const SLOT_START = 7;   // 7am
const SLOT_END   = 24;  // 12am (midnight)
const SLOT_HOURS = 2;
const ADMIN_PASSWORD = 'oceanfront2024';

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  tab: 'reservar',        // 'reservar' | 'mis-reservas' | 'admin'
  step: 1,               // 1 | 2 | 3
  selectedCourt: null,
  selectedDate: null,
  selectedSlot: null,
  residentName: '',
  apartmentNumber: '',
  adminLoggedIn: false,
  adminTab: 'reservations', // 'reservations' | 'apartments'
  allReservations: [],
  approvedApartments: [],
  myReservations: [],
  myAptInput: '',
  loading: false,
  error: '',
  success: ''
};

// ─── Firestore helpers ────────────────────────────────────────────────────────
async function getApprovedApartments() {
  const snap = await getDocs(collection(db, 'apartments'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getAllReservations() {
  const q = query(collection(db, 'reservations'), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getReservationsByApt(apt) {
  const q = query(collection(db, 'reservations'), where('apartment', '==', apt));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function addReservation(data) {
  return await addDoc(collection(db, 'reservations'), {
    ...data,
    createdAt: Timestamp.now()
  });
}

async function removeReservation(id) {
  await deleteDoc(doc(db, 'reservations', id));
}

async function addApartment(apt) {
  return await addDoc(collection(db, 'apartments'), { number: apt });
}

async function removeApartment(id) {
  await deleteDoc(doc(db, 'apartments', id));
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
function getTimeSlots() {
  const slots = [];
  for (let h = SLOT_START; h < SLOT_END; h += SLOT_HOURS) {
    const start = formatHour(h);
    const end   = formatHour(h + SLOT_HOURS);
    slots.push({ label: `${start} – ${end}`, startHour: h });
  }
  return slots;
}

function formatHour(h) {
  if (h === 0 || h === 24) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function isSlotTaken(reservations, courtId, dateStr, startHour) {
  return reservations.some(r =>
    r.court === courtId &&
    r.date  === dateStr &&
    r.startHour === startHour
  );
}

function isPast(dateStr, startHour) {
  const now = new Date();
  const slot = new Date(`${dateStr}T${String(startHour).padStart(2,'0')}:00:00`);
  return slot < now;
}

function isFutureReservation(r) {
  const slot = new Date(`${r.date}T${String(r.startHour).padStart(2,'0')}:00:00`);
  return slot >= new Date();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  document.getElementById('app').innerHTML = buildApp();
  attachListeners();
}

function buildApp() {
  return `
    <div class="app-shell">
      ${buildHeader()}
      <div class="tab-bar">
        ${tabBtn('reservar',     '＋',  'Reservar')}
        ${tabBtn('mis-reservas', '📋', 'Mis Reservas')}
        ${tabBtn('admin',        '⚙️',  'Admin')}
      </div>
      <div class="content">
        ${state.tab === 'reservar'     ? buildReservar()    : ''}
        ${state.tab === 'mis-reservas' ? buildMisReservas() : ''}
        ${state.tab === 'admin'        ? buildAdmin()       : ''}
      </div>
    </div>
  `;
}

function buildHeader() {
  return `
    <header class="header">
      <div class="logo-wrap">
        <div class="logo-o">O</div>
        <div class="header-text">
          <span class="header-title">Ocean Front</span>
          <span class="header-sub">Reserva de Canchas</span>
        </div>
      </div>
    </header>
  `;
}

function tabBtn(id, icon, label) {
  const active = state.tab === id ? 'active' : '';
  return `<button class="tab-btn ${active}" data-tab="${id}">${icon} ${label}</button>`;
}

// ─── Reservar ─────────────────────────────────────────────────────────────────
function buildReservar() {
  if (state.step === 1) return buildStep1();
  if (state.step === 2) return buildStep2();
  if (state.step === 3) return buildStep3();
  return '';
}

function buildStep1() {
  return `
    <div class="section fade-in">
      <h2 class="section-title">Selecciona una cancha</h2>
      <div class="court-cards">
        ${Object.values(COURTS).map(c => `
          <button class="court-card" data-court="${c.id}">
            <span class="court-emoji">${c.emoji}</span>
            <span class="court-name">${c.name}</span>
            <span class="court-desc">${c.desc}</span>
          </button>
        `).join('')}
      </div>
      ${state.error ? `<p class="error-msg">${state.error}</p>` : ''}
    </div>
  `;
}

function buildStep2() {
  const court = COURTS[state.selectedCourt];
  const slots = getTimeSlots();
  const today = todayStr();
  const reservations = state.allReservations;

  // Next 14 days
  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const selDate = state.selectedDate || today;

  return `
    <div class="section fade-in">
      <button class="back-btn" data-action="back-step">← Volver</button>
      <h2 class="section-title">${court.emoji} ${court.name}</h2>
      <div class="date-scroll">
        ${dates.map(d => {
          const dt = new Date(d + 'T12:00:00');
          const label = dt.toLocaleDateString('es-PA', { weekday:'short', day:'numeric', month:'short' });
          return `<button class="date-btn ${d === selDate ? 'active' : ''}" data-date="${d}">${label}</button>`;
        }).join('')}
      </div>
      <div class="slots-grid">
        ${slots.map(s => {
          const taken = isSlotTaken(reservations, state.selectedCourt, selDate, s.startHour);
          const past  = isPast(selDate, s.startHour);
          const sel   = state.selectedSlot === s.startHour;
          const cls   = taken ? 'slot taken' : past ? 'slot past' : sel ? 'slot selected' : 'slot available';
          return `<button class="${cls}" data-slot="${s.startHour}" ${taken||past?'disabled':''}>${s.label}</button>`;
        }).join('')}
      </div>
      ${state.error ? `<p class="error-msg">${state.error}</p>` : ''}
      <button class="btn-primary" data-action="confirm-slot">Continuar →</button>
    </div>
  `;
}

function buildStep3() {
  const court = COURTS[state.selectedCourt];
  const slotLabel = getTimeSlots().find(s => s.startHour === state.selectedSlot)?.label || '';
  const dateLabel = new Date(state.selectedDate + 'T12:00:00').toLocaleDateString('es-PA', {
    weekday:'long', day:'numeric', month:'long'
  });

  return `
    <div class="section fade-in">
      <button class="back-btn" data-action="back-step">← Volver</button>
      <h2 class="section-title">Confirmar reserva</h2>
      <div class="summary-card">
        <div class="summary-row"><span>Cancha</span><strong>${court.emoji} ${court.name}</strong></div>
        <div class="summary-row"><span>Fecha</span><strong>${dateLabel}</strong></div>
        <div class="summary-row"><span>Horario</span><strong>${slotLabel}</strong></div>
      </div>
      <div class="form-group">
        <label>Nombre del residente</label>
        <input type="text" id="residentName" placeholder="Tu nombre completo" value="${state.residentName}" />
      </div>
      <div class="form-group">
        <label>Número de apartamento</label>
        <input type="text" id="apartmentNumber" placeholder="Ej: 12A" value="${state.apartmentNumber}" />
      </div>
      ${state.error   ? `<p class="error-msg">${state.error}</p>`     : ''}
      ${state.success ? `<p class="success-msg">${state.success}</p>` : ''}
      <button class="btn-primary" data-action="submit-reservation" ${state.loading?'disabled':''}>
        ${state.loading ? 'Reservando...' : 'Confirmar Reserva ✓'}
      </button>
    </div>
  `;
}

// ─── Mis Reservas ─────────────────────────────────────────────────────────────
function buildMisReservas() {
  const future = state.myReservations.filter(isFutureReservation);

  return `
    <div class="section fade-in">
      <h2 class="section-title">Mis Reservas</h2>
      <div class="form-group row">
        <input type="text" id="myAptInput" placeholder="Número de apartamento" value="${state.myAptInput}" />
        <button class="btn-secondary" data-action="load-my-reservations">Buscar</button>
      </div>
      ${state.loading ? `<p class="loading-msg">Cargando...</p>` : ''}
      ${state.myAptInput && !state.loading ? (
        future.length === 0
          ? `<p class="empty-msg">No tienes reservas activas.</p>`
          : future.map(r => buildReservationCard(r, true)).join('')
      ) : ''}
    </div>
  `;
}

function buildReservationCard(r, canCancel = false) {
  const court = COURTS[r.court];
  const slotLabel = getTimeSlots().find(s => s.startHour === r.startHour)?.label || '';
  const dateLabel = new Date(r.date + 'T12:00:00').toLocaleDateString('es-PA', {
    weekday:'short', day:'numeric', month:'short'
  });
  return `
    <div class="res-card">
      <div class="res-card-top">
        <span class="res-emoji">${court?.emoji}</span>
        <div>
          <div class="res-court">${court?.name}</div>
          <div class="res-detail">${dateLabel} · ${slotLabel}</div>
          <div class="res-detail">Apto ${r.apartment} · ${r.name}</div>
        </div>
        ${canCancel ? `<button class="cancel-btn" data-cancel="${r.id}">✕</button>` : ''}
      </div>
    </div>
  `;
}

// ─── Admin ────────────────────────────────────────────────────────────────────
function buildAdmin() {
  if (!state.adminLoggedIn) return buildAdminLogin();
  return buildAdminPanel();
}

function buildAdminLogin() {
  return `
    <div class="section fade-in">
      <h2 class="section-title">Panel de Administración</h2>
      <div class="form-group">
        <label>Contraseña</label>
        <input type="password" id="adminPassword" placeholder="Contraseña" />
      </div>
      ${state.error ? `<p class="error-msg">${state.error}</p>` : ''}
      <button class="btn-primary" data-action="admin-login">Ingresar</button>
    </div>
  `;
}

function buildAdminPanel() {
  return `
    <div class="section fade-in">
      <div class="admin-tabs">
        <button class="admin-tab-btn ${state.adminTab==='reservations'?'active':''}" data-admin-tab="reservations">Reservas</button>
        <button class="admin-tab-btn ${state.adminTab==='apartments'?'active':''}" data-admin-tab="apartments">Apartamentos</button>
      </div>
      ${state.adminTab === 'reservations' ? buildAdminReservations() : buildAdminApartments()}
    </div>
  `;
}

function buildAdminReservations() {
  const future = state.allReservations.filter(isFutureReservation);
  return `
    <div>
      <h3 class="admin-subtitle">Reservas activas (${future.length})</h3>
      ${future.length === 0
        ? `<p class="empty-msg">No hay reservas activas.</p>`
        : future.map(r => buildReservationCard(r, true)).join('')}
    </div>
  `;
}

function buildAdminApartments() {
  return `
    <div>
      <h3 class="admin-subtitle">Apartamentos aprobados</h3>
      <div class="form-group row">
        <input type="text" id="newAptInput" placeholder="Ej: 12A" />
        <button class="btn-secondary" data-action="add-apartment">Agregar</button>
      </div>
      ${state.error   ? `<p class="error-msg">${state.error}</p>`     : ''}
      ${state.success ? `<p class="success-msg">${state.success}</p>` : ''}
      <div class="apt-list">
        ${state.approvedApartments.map(a => `
          <div class="apt-item">
            <span>Apto ${a.number}</span>
            <button class="cancel-btn" data-remove-apt="${a.id}">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function attachListeners() {
  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', async () => {
      state.tab = el.dataset.tab;
      state.error = ''; state.success = '';
      if (state.tab === 'admin' && state.adminLoggedIn) {
        state.loading = true; render();
        state.allReservations = await getAllReservations();
        state.approvedApartments = await getApprovedApartments();
        state.loading = false;
      }
      render();
    });
  });

  // Court selection
  document.querySelectorAll('[data-court]').forEach(el => {
    el.addEventListener('click', async () => {
      state.selectedCourt = el.dataset.court;
      state.selectedDate  = todayStr();
      state.selectedSlot  = null;
      state.error = '';
      state.loading = true; render();
      state.allReservations = await getAllReservations();
      state.loading = false;
      state.step = 2;
      render();
    });
  });

  // Date selection
  document.querySelectorAll('[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedDate = el.dataset.date;
      state.selectedSlot = null;
      render();
    });
  });

  // Slot selection
  document.querySelectorAll('[data-slot]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.disabled) return;
      state.selectedSlot = parseInt(el.dataset.slot);
      render();
    });
  });

  // Back
  document.querySelectorAll('[data-action="back-step"]').forEach(el => {
    el.addEventListener('click', () => {
      state.step--;
      state.error = '';
      render();
    });
  });

  // Confirm slot
  document.querySelectorAll('[data-action="confirm-slot"]').forEach(el => {
    el.addEventListener('click', () => {
      if (state.selectedSlot === null) {
        state.error = 'Por favor selecciona un horario.';
        render(); return;
      }
      state.step = 3; state.error = '';
      render();
    });
  });

  // Submit reservation
  document.querySelectorAll('[data-action="submit-reservation"]').forEach(el => {
    el.addEventListener('click', async () => {
      const name = document.getElementById('residentName')?.value.trim();
      const apt  = document.getElementById('apartmentNumber')?.value.trim().toUpperCase();
      state.residentName = name; state.apartmentNumber = apt;

      if (!name || !apt) { state.error = 'Por favor completa todos los campos.'; render(); return; }

      // Check apartment approved
      const approved = await getApprovedApartments();
      const isApproved = approved.some(a => a.number.toUpperCase() === apt);
      if (!isApproved) { state.error = 'Este apartamento no está registrado. Contacta al administrador.'; render(); return; }

      // Check one active reservation per apt
      const myRes = await getReservationsByApt(apt);
      const hasActive = myRes.some(isFutureReservation);
      if (hasActive) { state.error = 'Tu apartamento ya tiene una reserva activa.'; render(); return; }

      state.loading = true; state.error = ''; render();

      try {
        await addReservation({
          court: state.selectedCourt,
          date: state.selectedDate,
          startHour: state.selectedSlot,
          name,
          apartment: apt
        });
        state.success = '¡Reserva confirmada! 🎉';
        state.step = 1; state.selectedCourt = null; state.selectedSlot = null;
        state.residentName = ''; state.apartmentNumber = '';
      } catch(e) {
        state.error = 'Error al guardar la reserva. Intenta de nuevo.';
      }
      state.loading = false;
      render();
    });
  });

  // Load my reservations
  document.querySelectorAll('[data-action="load-my-reservations"]').forEach(el => {
    el.addEventListener('click', async () => {
      const apt = document.getElementById('myAptInput')?.value.trim().toUpperCase();
      state.myAptInput = apt;
      if (!apt) return;
      state.loading = true; render();
      state.myReservations = await getReservationsByApt(apt);
      state.loading = false; render();
    });
  });

  // Cancel reservation
  document.querySelectorAll('[data-cancel]').forEach(el => {
    el.addEventListener('click', async () => {
      if (!confirm('¿Cancelar esta reserva?')) return;
      await removeReservation(el.dataset.cancel);
      state.allReservations = state.allReservations.filter(r => r.id !== el.dataset.cancel);
      state.myReservations  = state.myReservations.filter(r => r.id !== el.dataset.cancel);
      render();
    });
  });

  // Admin login
  document.querySelectorAll('[data-action="admin-login"]').forEach(el => {
    el.addEventListener('click', async () => {
      const pw = document.getElementById('adminPassword')?.value;
      if (pw !== ADMIN_PASSWORD) { state.error = 'Contraseña incorrecta.'; render(); return; }
      state.adminLoggedIn = true; state.loading = true; render();
      state.allReservations   = await getAllReservations();
      state.approvedApartments = await getApprovedApartments();
      state.loading = false; render();
    });
  });

  // Admin tabs
  document.querySelectorAll('[data-admin-tab]').forEach(el => {
    el.addEventListener('click', () => {
      state.adminTab = el.dataset.adminTab;
      state.error = ''; state.success = '';
      render();
    });
  });

  // Add apartment
  document.querySelectorAll('[data-action="add-apartment"]').forEach(el => {
    el.addEventListener('click', async () => {
      const apt = document.getElementById('newAptInput')?.value.trim().toUpperCase();
      if (!apt) return;
      const exists = state.approvedApartments.some(a => a.number.toUpperCase() === apt);
      if (exists) { state.error = 'Ese apartamento ya está registrado.'; render(); return; }
      await addApartment(apt);
      state.approvedApartments = await getApprovedApartments();
      state.success = `Apto ${apt} agregado.`; state.error = '';
      render();
    });
  });

  // Remove apartment
  document.querySelectorAll('[data-remove-apt]').forEach(el => {
    el.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este apartamento?')) return;
      await removeApartment(el.dataset.removeApt);
      state.approvedApartments = await getApprovedApartments();
      render();
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
render();
