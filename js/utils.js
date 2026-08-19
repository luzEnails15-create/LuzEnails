// Utilidades compartidas entre el panel de clientes y el de administración.

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const WEEKDAY_LABELS = {
  sun: "Domingo",
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado"
};

export const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// Paleta cíclica para los "esmaltes" que identifican cada servicio.
export const SWATCH_COLORS = [
  "#B23A48", "#C9A24B", "#7A8B69", "#9C6B98",
  "#C97C5D", "#4C7A93", "#B85C7A", "#8A7B4C"
];

export function colorForIndex(i) {
  return SWATCH_COLORS[i % SWATCH_COLORS.length];
}

export function defaultBusinessConfig() {
  return {
    name: "Estudio de Uñas",
    slotInterval: 30,
    hours: {
      mon: { closed: false, open: "09:00", close: "18:00" },
      tue: { closed: false, open: "09:00", close: "18:00" },
      wed: { closed: false, open: "09:00", close: "18:00" },
      thu: { closed: false, open: "09:00", close: "18:00" },
      fri: { closed: false, open: "09:00", close: "18:00" },
      sat: { closed: false, open: "09:00", close: "14:00" },
      sun: { closed: true, open: "09:00", close: "14:00" }
    },
    closedDates: []
  };
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey() {
  return dateKey(new Date());
}

export function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m} min`;
}

export function formatFriendlyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = WEEKDAY_SHORT[date.getDay()];
  return `${weekday} ${d} de ${MONTH_LABELS[m - 1]}`;
}

// Genera los horarios de inicio posibles para un día dado el horario de
// apertura/cierre, el intervalo de la agenda y la duración del servicio,
// asegurando que el servicio termine antes (o justo) del cierre.
export function generateCandidateSlots(hoursForDay, durationMinutes, interval) {
  if (!hoursForDay || hoursForDay.closed) return [];
  const open = timeToMinutes(hoursForDay.open);
  const close = timeToMinutes(hoursForDay.close);
  const slots = [];
  for (let t = open; t + durationMinutes <= close; t += interval) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

// Comprueba si dos intervalos [startA, startA+durA) y [startB, startB+durB)
// se traslapan.
export function overlaps(startA, durA, startB, durB) {
  const endA = startA + durA;
  const endB = startB + durB;
  return startA < endB && startB < endA;
}
