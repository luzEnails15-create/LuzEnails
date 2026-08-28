import { db } from "./firebase-init.js";
import {
  collection, getDocs, getDoc, query, where, doc, writeBatch, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  WEEKDAY_KEYS, MONTH_LABELS, WEEKDAY_SHORT,
  defaultBusinessConfig, dateKey, todayKey,
  formatMoney, formatDuration, formatFriendlyDate, formatTime12h,
  generateCandidateSlots, overlaps, timeToMinutes, colorForIndex
} from "./utils.js";

// ---------- Estado ----------
let businessConfig = defaultBusinessConfig();
let services = [];
let selectedService = null;
let viewYear, viewMonth; // mes que se muestra en el calendario
let selectedDateStr = null;
let selectedSlot = null;
let bookedSlotsForDate = [];

const today = new Date();
viewYear = today.getFullYear();
viewMonth = today.getMonth();

// ---------- Referencias DOM ----------
const serviceGridEl = document.getElementById("serviceGrid");
const swatchStripEl = document.getElementById("swatchStrip");
const calendarSection = document.getElementById("calendarSection");
const timeSection = document.getElementById("timeSection");
const monthLabelEl = document.getElementById("monthLabel");
const calendarGridEl = document.getElementById("calendarGrid");
const slotGridEl = document.getElementById("slotGrid");
const stepServiceEl = document.getElementById("stepService");
const stepDateEl = document.getElementById("stepDate");
const stepTimeEl = document.getElementById("stepTime");
const modalBackdrop = document.getElementById("bookingModalBackdrop");
const modalSummary = document.getElementById("modalSummary");
const bookingForm = document.getElementById("bookingForm");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const confirmPanel = document.getElementById("confirmPanel");
const confirmDetails = document.getElementById("confirmDetails");
const newBookingBtn = document.getElementById("newBookingBtn");
const businessNameEls = document.querySelectorAll(".js-business-name");

// Código de cancelación (panel de confirmación)
const cancelCodeText = document.getElementById("cancelCodeText");
const copyCancelCodeBtn = document.getElementById("copyCancelCodeBtn");
const copyCancelCodeMsg = document.getElementById("copyCancelCodeMsg");

// Sección "Cancelar una cita"
const showCancelLink = document.getElementById("showCancelLink");
const cancelSection = document.getElementById("cancelSection");
const cancelLookupForm = document.getElementById("cancelLookupForm");
const cancelLookupMsg = document.getElementById("cancelLookupMsg");
const cancelResult = document.getElementById("cancelResult");
const cancelResultDetails = document.getElementById("cancelResultDetails");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
let foundAppointment = null; // { id, ...data } de la cita encontrada para cancelar

init();

async function init() {
  await loadConfig();
  await loadServices();
  renderServices();
  checkCancelCodeInUrl();
}

function checkCancelCodeInUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("cancelCode");
  if (!code) return;

  document.getElementById("bookingFlow").hidden = true;
  confirmPanel.hidden = true;
  cancelSection.hidden = false;
  cancelLookupForm.cancelCode.value = code;
  cancelLookupForm.cancelPhone.focus();
  cancelSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadConfig() {
  try {
    const snap = await getDocs(collection(db, "config"));
    snap.forEach((d) => {
      if (d.id === "business") businessConfig = { ...defaultBusinessConfig(), ...d.data() };
    });
  } catch (e) {
    console.warn("No se pudo cargar la configuración, usando valores por defecto.", e);
  }
  businessNameEls.forEach((el) => (el.textContent = businessConfig.name));
  document.title = `Reserva tu cita — ${businessConfig.name}`;
}

async function loadServices() {
  try {
    const snap = await getDocs(collection(db, "services"));
    services = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.active !== false) services.push({ id: d.id, ...data });
    });
    services.sort((a, b) => (a.name || "").localeCompare(b.name));
  } catch (e) {
    console.error(e);
    serviceGridEl.innerHTML = `<p class="empty-state">No se pudieron cargar los servicios. Intenta más tarde.</p>`;
  }
}

function renderServices() {
  swatchStripEl.innerHTML = services
    .map((_, i) => `<div class="swatch" style="--service-color:${colorForIndex(i)}"></div>`)
    .join("");

  if (services.length === 0) {
    serviceGridEl.innerHTML = `<p class="empty-state">Aún no hay servicios configurados.</p>`;
    return;
  }

  serviceGridEl.innerHTML = services
    .map(
      (s, i) => `
      <button class="service-card" data-id="${s.id}">
        <div class="cap" style="--service-color:${colorForIndex(i)}"></div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="meta">
          <span>${formatMoney(s.price)}</span>
          <span>${formatDuration(s.duration)}</span>
        </div>
      </button>`
    )
    .join("");

  serviceGridEl.querySelectorAll(".service-card").forEach((btn) => {
    btn.addEventListener("click", () => selectService(btn.dataset.id));
  });
}

function selectService(id) {
  selectedService = services.find((s) => s.id === id);
  selectedDateStr = null;
  selectedSlot = null;

  serviceGridEl.querySelectorAll(".service-card").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.id === id);
  });

  stepServiceEl.classList.remove("active");
  stepDateEl.classList.add("active");

  calendarSection.hidden = false;
  timeSection.hidden = true;
  renderCalendar();
  calendarSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Calendario ----------

function renderCalendar() {
  monthLabelEl.textContent = `${MONTH_LABELS[viewMonth]} ${viewYear}`;

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = firstDay.getDay(); // 0=dom
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = todayKey();

  let html = WEEKDAY_SHORT.map((d) => `<div class="dow">${d}</div>`).join("");

  for (let i = 0; i < startOffset; i++) {
    html += `<div class="day-cell empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(viewYear, viewMonth, day);
    const key = dateKey(d);
    const weekdayKey = WEEKDAY_KEYS[d.getDay()];
    const hoursForDay = businessConfig.hours?.[weekdayKey];
    const isPast = key < todayStr;
    const isClosed = !hoursForDay || hoursForDay.closed;
    const isClosedDate = (businessConfig.closedDates || []).includes(key);
    const disabled = isPast || isClosed || isClosedDate;
    const selected = key === selectedDateStr;

    const classes = ["day-cell"];
    if (disabled) classes.push("disabled");
    else classes.push("available");
    if (selected) classes.push("selected");

    html += `<button class="${classes.join(" ")}" ${disabled ? "disabled" : ""} data-date="${key}">${day}</button>`;
  }

  calendarGridEl.innerHTML = html;

  calendarGridEl.querySelectorAll(".day-cell.available").forEach((btn) => {
    btn.addEventListener("click", () => selectDate(btn.dataset.date));
  });

  document.getElementById("prevMonthBtn").disabled =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();
}

document.getElementById("prevMonthBtn").addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});

document.getElementById("nextMonthBtn").addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});

async function selectDate(key) {
  selectedDateStr = key;
  selectedSlot = null;
  renderCalendar();

  stepDateEl.classList.remove("active");
  stepTimeEl.classList.add("active");

  timeSection.hidden = false;
  slotGridEl.innerHTML = `<p class="empty-state">Buscando horarios disponibles…</p>`;
  timeSection.scrollIntoView({ behavior: "smooth", block: "start" });

  await loadBookedSlots(key);
  renderTimeSlots();
}

async function loadBookedSlots(key) {
  try {
    const q = query(collection(db, "slots"), where("date", "==", key));
    const snap = await getDocs(q);
    bookedSlotsForDate = [];
    snap.forEach((d) => bookedSlotsForDate.push(d.data()));
  } catch (e) {
    console.error(e);
    bookedSlotsForDate = [];
  }
}

function renderTimeSlots() {
  const d = new Date(...selectedDateStr.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const weekdayKey = WEEKDAY_KEYS[d.getDay()];
  const hoursForDay = businessConfig.hours?.[weekdayKey];
  const interval = businessConfig.slotInterval || 30;

  let candidates = generateCandidateSlots(hoursForDay, selectedService.duration, interval);

  // Si el día seleccionado es hoy, quita horas ya pasadas.
  if (selectedDateStr === todayKey()) {
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    candidates = candidates.filter((t) => timeToMinutes(t) > nowMinutes);
  }

  const free = candidates.filter((t) => {
    const startMin = timeToMinutes(t);
    return !bookedSlotsForDate.some((b) =>
      overlaps(startMin, selectedService.duration, timeToMinutes(b.time), b.duration)
    );
  });

  if (free.length === 0) {
    slotGridEl.innerHTML = `<p class="empty-state">No hay horarios disponibles ese día para este servicio. Prueba otra fecha.</p>`;
    return;
  }

  slotGridEl.innerHTML = free
    .map((t) => `<button class="slot-ticket" data-time="${t}">${formatTime12h(t)}</button>`)
    .join("");

  slotGridEl.querySelectorAll(".slot-ticket").forEach((btn) => {
    btn.addEventListener("click", () => openBookingModal(btn.dataset.time));
  });
}

// ---------- Modal de reserva ----------

function openBookingModal(time) {
  selectedSlot = time;
  modalSummary.innerHTML = `
    <div class="row"><span>Servicio</span><span>${escapeHtml(selectedService.name)}</span></div>
    <div class="row"><span>Fecha</span><span>${formatFriendlyDate(selectedDateStr)}</span></div>
    <div class="row"><span>Hora</span><span>${formatTime12h(time)}</span></div>
    <div class="row"><span>Duración</span><span>${formatDuration(selectedService.duration)}</span></div>
    <div class="row total"><span>Total</span><span>${formatMoney(selectedService.price)}</span></div>
  `;
  bookingForm.reset();
  modalBackdrop.hidden = false;
}

cancelModalBtn.addEventListener("click", () => {
  modalBackdrop.hidden = true;
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) modalBackdrop.hidden = true;
});

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Reservando…";

  const clientName = bookingForm.clientName.value.trim();
  const clientPhone = bookingForm.clientPhone.value.trim();

  try {
    const batch = writeBatch(db);
    const slotRef = doc(collection(db, "slots"));
    const apptRef = doc(collection(db, "appointments"));

    batch.set(slotRef, {
      date: selectedDateStr,
      time: selectedSlot,
      duration: selectedService.duration,
      serviceId: selectedService.id,
      appointmentId: apptRef.id
    });

    batch.set(apptRef, {
      date: selectedDateStr,
      time: selectedSlot,
      duration: selectedService.duration,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      price: selectedService.price,
      clientName,
      clientPhone,
      status: "confirmed",
      slotId: slotRef.id,
      source: "client",
      createdAt: serverTimestamp()
    });

    await batch.commit();

    modalBackdrop.hidden = true;
    showConfirmation(clientName, apptRef.id);
  } catch (err) {
    console.error(err);
    alert("No se pudo completar la reserva. Por favor intenta de nuevo.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirmar cita";
  }
});

function showConfirmation(clientName, appointmentId) {
  document.getElementById("bookingFlow").hidden = true;
  confirmPanel.hidden = false;
  confirmDetails.innerHTML = `
    <div class="row"><span>Nombre</span><span>${escapeHtml(clientName)}</span></div>
    <div class="row"><span>Servicio</span><span>${escapeHtml(selectedService.name)}</span></div>
    <div class="row"><span>Fecha</span><span>${formatFriendlyDate(selectedDateStr)}</span></div>
    <div class="row"><span>Hora</span><span>${formatTime12h(selectedSlot)}</span></div>
  `;
  cancelCodeText.textContent = appointmentId;
  confirmPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

copyCancelCodeBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(cancelCodeText.textContent);
  } catch (e) {
    // Si el navegador bloquea el portapapeles, seleccionamos el texto para que lo copien manualmente.
    const range = document.createRange();
    range.selectNodeContents(cancelCodeText);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  copyCancelCodeMsg.hidden = false;
  setTimeout(() => (copyCancelCodeMsg.hidden = true), 2500);
});

// ---------- Cancelar una cita ----------

showCancelLink.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("bookingFlow").hidden = true;
  confirmPanel.hidden = true;
  cancelSection.hidden = false;
  cancelSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

function normalizePhone(str) {
  return (str || "").replace(/\D/g, "");
}

cancelLookupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  cancelLookupMsg.hidden = true;
  cancelResult.hidden = true;
  foundAppointment = null;

  const code = cancelLookupForm.cancelCode.value.trim();
  const phone = cancelLookupForm.cancelPhone.value.trim();
  const submitBtn = cancelLookupForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Buscando…";

  try {
    const apptSnap = await getDoc(doc(db, "appointments", code));

    if (!apptSnap.exists() || normalizePhone(apptSnap.data().clientPhone) !== normalizePhone(phone)) {
      showCancelLookupMsg("No encontramos ninguna cita con ese código y teléfono. Revisa que estén escritos igual que al reservar.", "error");
      return;
    }

    const appt = { id: apptSnap.id, ...apptSnap.data() };

    if (appt.status === "cancelled") {
      showCancelLookupMsg("Esta cita ya estaba cancelada.", "error");
      return;
    }

    if (appt.date < todayKey()) {
      showCancelLookupMsg("Esta cita ya pasó, no se puede cancelar.", "error");
      return;
    }

    foundAppointment = appt;
    cancelResultDetails.innerHTML = `
      <div class="row"><span>Nombre</span><span>${escapeHtml(appt.clientName || "")}</span></div>
      <div class="row"><span>Servicio</span><span>${escapeHtml(appt.serviceName || "")}</span></div>
      <div class="row"><span>Fecha</span><span>${formatFriendlyDate(appt.date)}</span></div>
      <div class="row"><span>Hora</span><span>${formatTime12h(appt.time)}</span></div>
    `;
    cancelResult.hidden = false;
  } catch (err) {
    console.error(err);
    showCancelLookupMsg("No pudimos buscar tu cita. Intenta de nuevo en un momento.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Buscar mi cita";
  }
});

confirmCancelBtn.addEventListener("click", async () => {
  if (!foundAppointment) return;
  if (!confirm(`¿Seguro que quieres cancelar tu cita del ${formatFriendlyDate(foundAppointment.date)} a las ${formatTime12h(foundAppointment.time)}?`)) return;

  confirmCancelBtn.disabled = true;
  confirmCancelBtn.textContent = "Cancelando…";

  try {
    await updateDoc(doc(db, "appointments", foundAppointment.id), { status: "cancelled" });
    if (foundAppointment.slotId) {
      try { await deleteDoc(doc(db, "slots", foundAppointment.slotId)); } catch (e) { /* ya no existe */ }
    }
    cancelResult.hidden = true;
    cancelLookupForm.reset();
    showCancelLookupMsg("Tu cita fue cancelada correctamente. ¡Gracias por avisarnos!", "ok");
    foundAppointment = null;
  } catch (err) {
    console.error(err);
    showCancelLookupMsg("No se pudo cancelar la cita. Intenta de nuevo.", "error");
  } finally {
    confirmCancelBtn.disabled = false;
    confirmCancelBtn.textContent = "Cancelar esta cita";
  }
});

function showCancelLookupMsg(text, type) {
  cancelLookupMsg.textContent = text;
  cancelLookupMsg.className = `msg ${type}`;
  cancelLookupMsg.hidden = false;
}

newBookingBtn.addEventListener("click", () => {
  location.reload();
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
