import { db, auth } from "./firebase-init.js";
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp,
  writeBatch, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  WEEKDAY_KEYS, WEEKDAY_LABELS, defaultBusinessConfig,
  formatMoney, formatDuration, formatFriendlyDate, formatTime12h, colorForIndex, todayKey,
  overlaps, timeToMinutes
} from "./utils.js";

// ---------- Elementos ----------
const loginCard = document.getElementById("loginCard");
const adminShell = document.getElementById("adminShell");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

// Servicios
const serviceForm = document.getElementById("serviceForm");
const servicesTableBody = document.querySelector("#servicesTable tbody");
const serviceMsg = document.getElementById("serviceMsg");

// Horario
const scheduleForm = document.getElementById("scheduleForm");
const hoursGridEl = document.getElementById("hoursGrid");
const closedDatesList = document.getElementById("closedDatesList");
const addClosedDateBtn = document.getElementById("addClosedDateBtn");
const closedDateInput = document.getElementById("closedDateInput");
const scheduleMsg = document.getElementById("scheduleMsg");

// Citas
const manualBookingForm = document.getElementById("manualBookingForm");
const manualServiceSelect = document.getElementById("manualService");
const manualBookingMsg = document.getElementById("manualBookingMsg");
const appointmentsTableBody = document.querySelector("#appointmentsTable tbody");
const showPastCheckbox = document.getElementById("showPastCheckbox");
const showTodayOnlyCheckbox = document.getElementById("showTodayOnlyCheckbox");
const hideCancelledCheckbox = document.getElementById("hideCancelledCheckbox");
const searchDateInput = document.getElementById("searchDateInput");
const clearSearchDateBtn = document.getElementById("clearSearchDateBtn");
const appointmentsMsg = document.getElementById("appointmentsMsg");

let currentConfig = defaultBusinessConfig();
let allAppointments = [];
let allServices = [];

// ---------- Auth ----------

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginCard.hidden = true;
    adminShell.hidden = false;
    loadEverything();
  } else {
    loginCard.hidden = false;
    adminShell.hidden = true;
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "Correo o contraseña incorrectos.";
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

// ---------- Tabs ----------

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---------- Carga inicial ----------

async function loadEverything() {
  await loadConfig();
  await loadServices();
  await loadAppointments();
}

// ================= SERVICIOS =================

async function loadServices() {
  const snap = await getDocs(collection(db, "services"));
  const services = [];
  snap.forEach((d) => services.push({ id: d.id, ...d.data() }));
  services.sort((a, b) => (a.name || "").localeCompare(b.name));
  allServices = services;
  renderServices(services);
  renderManualServiceOptions();
}

function renderManualServiceOptions() {
  const active = allServices.filter((s) => s.active !== false);
  if (active.length === 0) {
    manualServiceSelect.innerHTML = `<option value="">Añade un servicio primero</option>`;
    manualServiceSelect.disabled = true;
    return;
  }
  manualServiceSelect.disabled = false;
  manualServiceSelect.innerHTML = active
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)} — ${formatMoney(s.price)} (${formatDuration(s.duration)})</option>`)
    .join("");
}

function renderServices(services) {
  if (services.length === 0) {
    servicesTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">Aún no has añadido servicios.</td></tr>`;
    return;
  }

  servicesTableBody.innerHTML = services
    .map(
      (s, i) => `
      <tr data-id="${s.id}">
        <td><span class="cap" style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${colorForIndex(i)};margin-right:8px;"></span>${escapeHtml(s.name)}</td>
        <td>${formatMoney(s.price)}</td>
        <td>${formatDuration(s.duration)}</td>
        <td>${s.active === false ? '<span class="pill cancelled">Inactivo</span>' : '<span class="pill confirmed">Activo</span>'}</td>
        <td class="row-actions">
          <button data-action="edit">Editar</button>
          <button data-action="toggle">${s.active === false ? "Activar" : "Desactivar"}</button>
          <button data-action="delete" class="danger">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");

  servicesTableBody.querySelectorAll("tr").forEach((row) => {
    const id = row.dataset.id;
    const service = services.find((s) => s.id === id);

    row.querySelector('[data-action="edit"]').addEventListener("click", () => editServiceRow(row, service));
    row.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
      await updateDoc(doc(db, "services", id), { active: service.active === false });
      loadServices();
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`¿Eliminar el servicio "${service.name}"? Esta acción no se puede deshacer.`)) return;
      await deleteDoc(doc(db, "services", id));
      loadServices();
    });
  });
}

function editServiceRow(row, service) {
  row.innerHTML = `
    <td><input type="text" value="${escapeAttr(service.name)}" class="edit-name" style="width:100%"></td>
    <td><input type="number" value="${service.price}" class="edit-price" min="0" step="1000" style="width:100%"></td>
    <td><input type="number" value="${service.duration}" class="edit-duration" min="5" step="5" style="width:100%"></td>
    <td>—</td>
    <td class="row-actions">
      <button data-action="save">Guardar</button>
      <button data-action="cancel">Cancelar</button>
    </td>
  `;
  row.querySelector('[data-action="cancel"]').addEventListener("click", loadServices);
  row.querySelector('[data-action="save"]').addEventListener("click", async () => {
    const name = row.querySelector(".edit-name").value.trim();
    const price = Number(row.querySelector(".edit-price").value);
    const duration = Number(row.querySelector(".edit-duration").value);
    if (!name || price < 0 || duration <= 0) {
      alert("Revisa los datos: el nombre no puede estar vacío y los números deben ser válidos.");
      return;
    }
    await updateDoc(doc(db, "services", service.id), { name, price, duration });
    loadServices();
  });
}

serviceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = serviceForm.name.value.trim();
  const price = Number(serviceForm.price.value);
  const duration = Number(serviceForm.duration.value);

  if (!name || price < 0 || duration <= 0) {
    showMsg(serviceMsg, "Revisa el nombre, el precio y la duración.", "error");
    return;
  }

  await addDoc(collection(db, "services"), {
    name, price, duration, active: true, createdAt: serverTimestamp()
  });

  serviceForm.reset();
  showMsg(serviceMsg, "Servicio añadido correctamente.", "ok");
  loadServices();
});

// ================= HORARIO =================

async function loadConfig() {
  const ref = doc(db, "config", "business");
  const snap = await getDoc(ref);
  currentConfig = snap.exists() ? { ...defaultBusinessConfig(), ...snap.data() } : defaultBusinessConfig();
  document.querySelectorAll(".js-business-name").forEach((el) => (el.textContent = currentConfig.name));
  document.title = `Administración — ${currentConfig.name}`;
  renderScheduleForm();
}

function renderScheduleForm() {
  scheduleForm.businessName.value = currentConfig.name;
  scheduleForm.slotInterval.value = String(
    currentConfig.slotInterval === undefined || currentConfig.slotInterval === null
      ? 30
      : currentConfig.slotInterval
  );

  hoursGridEl.innerHTML = WEEKDAY_KEYS.map((key) => {
    const h = currentConfig.hours[key] || { closed: true, open: "09:00", close: "18:00" };
    return `
      <div class="hours-grid" data-day="${key}">
        <span class="day-label">${WEEKDAY_LABELS[key]}</span>
        <input type="time" class="open-input" value="${h.open}" ${h.closed ? "disabled" : ""}>
        <input type="time" class="close-input" value="${h.close}" ${h.closed ? "disabled" : ""}>
        <label class="toggle-closed">
          <input type="checkbox" class="closed-check" ${h.closed ? "checked" : ""}>
          Cerrado
        </label>
      </div>`;
  }).join("");

  hoursGridEl.querySelectorAll(".hours-grid").forEach((row) => {
    const openInput = row.querySelector(".open-input");
    const closeInput = row.querySelector(".close-input");
    row.querySelector(".closed-check").addEventListener("change", (e) => {
      openInput.disabled = e.target.checked;
      closeInput.disabled = e.target.checked;
    });
  });

  renderClosedDates();
}

function renderClosedDates() {
  const dates = currentConfig.closedDates || [];
  if (dates.length === 0) {
    closedDatesList.innerHTML = `<p class="empty-state">No hay fechas puntuales cerradas.</p>`;
    return;
  }
  closedDatesList.innerHTML = dates
    .sort()
    .map(
      (d) => `<div class="hours-grid" style="grid-template-columns:1fr auto;">
        <span>${formatFriendlyDate(d)}</span>
        <button data-date="${d}" class="danger" type="button">Quitar</button>
      </div>`
    )
    .join("");

  closedDatesList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentConfig.closedDates = currentConfig.closedDates.filter((d) => d !== btn.dataset.date);
      renderClosedDates();
    });
  });
}

addClosedDateBtn.addEventListener("click", () => {
  const val = closedDateInput.value;
  if (!val) return;
  if (!currentConfig.closedDates.includes(val)) {
    currentConfig.closedDates = [...(currentConfig.closedDates || []), val];
  }
  closedDateInput.value = "";
  renderClosedDates();
});

scheduleForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const hours = {};
  hoursGridEl.querySelectorAll(".hours-grid").forEach((row) => {
    const day = row.dataset.day;
    hours[day] = {
      closed: row.querySelector(".closed-check").checked,
      open: row.querySelector(".open-input").value || "09:00",
      close: row.querySelector(".close-input").value || "18:00"
    };
  });

  const rawInterval = Number(scheduleForm.slotInterval.value);
  currentConfig.name = scheduleForm.businessName.value.trim() || "Estudio de Uñas";
  currentConfig.slotInterval = Number.isFinite(rawInterval) && rawInterval >= 0 ? rawInterval : 30;
  currentConfig.hours = hours;

  await setDoc(doc(db, "config", "business"), currentConfig);
  showMsg(scheduleMsg, "Horario guardado correctamente.", "ok");
});

// ================= CITAS =================

async function loadAppointments() {
  const snap = await getDocs(collection(db, "appointments"));
  allAppointments = [];
  snap.forEach((d) => allAppointments.push({ id: d.id, ...d.data() }));
  allAppointments.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  renderAppointments();
}

showPastCheckbox.addEventListener("change", renderAppointments);
showTodayOnlyCheckbox.addEventListener("change", () => {
  if (showTodayOnlyCheckbox.checked) {
    showPastCheckbox.checked = false;
    showPastCheckbox.disabled = true;
  } else {
    showPastCheckbox.disabled = false;
  }
  renderAppointments();
});
hideCancelledCheckbox.addEventListener("change", renderAppointments);

searchDateInput.addEventListener("change", () => {
  if (searchDateInput.value) {
    // Buscar un día concreto tiene prioridad sobre los demás filtros de fecha.
    showTodayOnlyCheckbox.checked = false;
    showPastCheckbox.disabled = false;
  }
  renderAppointments();
});
clearSearchDateBtn.addEventListener("click", () => {
  searchDateInput.value = "";
  renderAppointments();
});

function renderAppointments() {
  const searchDate = searchDateInput.value;
  let list;

  if (searchDate) {
    list = allAppointments.filter((a) => a.date === searchDate);
  } else {
    const showPast = showPastCheckbox.checked;
    const todayOnly = showTodayOnlyCheckbox.checked;
    const tKey = todayKey();
    list = allAppointments.filter((a) => {
      if (todayOnly) return a.date === tKey;
      return showPast || a.date >= tKey;
    });
  }

  if (hideCancelledCheckbox.checked) {
    list = list.filter((a) => a.status !== "cancelled");
  }

  if (list.length === 0) {
    const emptyText = searchDate
      ? `No hay citas para el ${formatFriendlyDate(searchDate)}.`
      : "No hay citas para mostrar.";
    appointmentsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">${emptyText}</td></tr>`;
    return;
  }

  appointmentsTableBody.innerHTML = list
    .map(
      (a) => `
      <tr data-id="${a.id}">
        <td>${formatFriendlyDate(a.date)}</td>
        <td>${formatTime12h(a.time)}</td>
        <td>${escapeHtml(a.serviceName || "")}</td>
        <td>${escapeHtml(a.clientName || "")}${a.source === "admin" ? ' <span class="pill" style="background:#4C7A93;color:#fff;">Exclusiva</span>' : ""}</td>
        <td>${escapeHtml(a.clientPhone || "")}</td>
        <td>${a.status === "cancelled" ? '<span class="pill cancelled">Cancelada</span>' : '<span class="pill confirmed">Confirmada</span>'}</td>
        <td class="row-actions">
          ${a.status === "cancelled" ? '<button data-action="delete" class="danger">Quitar</button>' : '<button data-action="whatsapp">Recordatorio WhatsApp</button>'}
          ${a.status === "cancelled" ? "" : '<button data-action="cancel" class="danger">Cancelar</button>'}
        </td>
      </tr>`
    )
    .join("");

  appointmentsTableBody.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const appt = allAppointments.find((a) => a.id === row.dataset.id);
      if (!confirm(`¿Cancelar la cita de ${appt.clientName} el ${formatFriendlyDate(appt.date)} a las ${formatTime12h(appt.time)}?`)) return;

      await updateDoc(doc(db, "appointments", appt.id), { status: "cancelled" });
      if (appt.slotId) {
        try { await deleteDoc(doc(db, "slots", appt.slotId)); } catch (e) { /* ya no existe */ }
      }
      showMsg(appointmentsMsg, "Cita cancelada. El horario vuelve a estar disponible.", "ok");
      loadAppointments();
    });
  });

  appointmentsTableBody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const appt = allAppointments.find((a) => a.id === row.dataset.id);
      if (!confirm(`¿Quitar definitivamente esta cita cancelada de ${appt.clientName || "el cliente"}? Esta acción no se puede deshacer.`)) return;

      await deleteDoc(doc(db, "appointments", appt.id));
      showMsg(appointmentsMsg, "Cita eliminada de la lista.", "ok");
      loadAppointments();
    });
  });

  appointmentsTableBody.querySelectorAll('[data-action="whatsapp"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest("tr");
      const appt = allAppointments.find((a) => a.id === row.dataset.id);
      const url = buildWhatsAppReminderLink(appt);
      if (!url) {
        showMsg(appointmentsMsg, "Ese cliente no tiene un teléfono válido guardado.", "error");
        return;
      }
      window.open(url, "_blank", "noopener");
    });
  });
}

// ---------- Cita exclusiva (creada por el administrador) ----------

manualBookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const serviceId = manualServiceSelect.value;
  const service = allServices.find((s) => s.id === serviceId);
  const date = manualBookingForm.date.value;
  const time = manualBookingForm.time.value;
  const clientName = manualBookingForm.clientName.value.trim() || "Cita exclusiva";
  const clientPhone = manualBookingForm.clientPhone.value.trim();

  if (!service || !date || !time) {
    showMsg(manualBookingMsg, "Escoge servicio, fecha y hora.", "error");
    return;
  }

  const submitBtn = manualBookingForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Agendando…";

  try {
    // Revisa que no se traslape con otra cita ya agendada ese día (de
    // cliente o exclusiva), igual que hace la página pública.
    const q = query(collection(db, "slots"), where("date", "==", date));
    const snap = await getDocs(q);
    const startMin = timeToMinutes(time);
    const clash = snap.docs.some((d) => {
      const s = d.data();
      return overlaps(startMin, service.duration, timeToMinutes(s.time), s.duration);
    });

    if (clash) {
      showMsg(manualBookingMsg, "Ya hay otra cita en ese horario. Escoge otra hora.", "error");
      return;
    }

    const batch = writeBatch(db);
    const slotRef = doc(collection(db, "slots"));
    const apptRef = doc(collection(db, "appointments"));

    batch.set(slotRef, {
      date,
      time,
      duration: service.duration,
      serviceId: service.id,
      appointmentId: apptRef.id
    });

    batch.set(apptRef, {
      date,
      time,
      duration: service.duration,
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      clientName,
      clientPhone,
      status: "confirmed",
      slotId: slotRef.id,
      source: "admin",
      createdAt: serverTimestamp()
    });

    await batch.commit();

    manualBookingForm.reset();
    showMsg(manualBookingMsg, "Cita exclusiva agendada correctamente.", "ok");
    loadAppointments();
  } catch (err) {
    console.error(err);
    showMsg(manualBookingMsg, "No se pudo agendar la cita. Intenta de nuevo.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Agendar cita exclusiva";
  }
});

// ---------- Recordatorio por WhatsApp ----------

function normalizePhoneForWhatsApp(rawPhone) {
  const digits = (rawPhone || "").replace(/\D/g, "");
  if (!digits) return null;
  // Si ya trae indicativo de país (empieza por 57 y tiene 12 dígitos), se deja igual.
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  // Número celular colombiano típico de 10 dígitos: se le agrega el indicativo 57.
  if (digits.length === 10) return `57${digits}`;
  // Cualquier otro formato: se usa tal cual, por si el negocio opera fuera de Colombia.
  return digits;
}

function buildWhatsAppReminderLink(appt) {
  const phone = normalizePhoneForWhatsApp(appt.clientPhone);
  if (!phone) return null;

  // Se arma a partir de la URL actual del panel admin, cambiando
  // "admin.html" por "index.html", para que funcione sin importar en qué
  // dominio esté publicada la página (GitHub Pages, dominio propio, etc.).
  const clientPageUrl = window.location.href.replace(/admin\.html.*$/, "index.html");
  const cancelLink = `${clientPageUrl}?cancelCode=${encodeURIComponent(appt.id)}`;

  const message =
    `Hola ${appt.clientName || ""}, te recordamos tu cita en ${currentConfig.name} ` +
    `el ${formatFriendlyDate(appt.date)} a las ${formatTime12h(appt.time)} para ${appt.serviceName || "tu servicio"}. ` +
    `Te esperamos.\n\n` +
    `Si necesitas cancelarla, entra aquí:\n` +
    `${cancelLink}`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// ---------- Utilidades ----------

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 3500);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}
