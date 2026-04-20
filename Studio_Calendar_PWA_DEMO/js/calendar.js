import { requireAuthAndRenderUser } from "./auth.js";

import { onValue, ref, update } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { db } from "./firebase-config.js";

await requireAuthAndRenderUser();

// ─── State ────────────────────────────────────────────────
const today = new Date();
let currentYear = today.getFullYear();
let currentMonth = today.getMonth(); // 0-indexed
let selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
let allBookings = {};
let bookingsByDate = new Map();
let activeBookingId = null;
const pageParams = new URLSearchParams(window.location.search);

if (pageParams.has("date")) {
  const requestedDate = pageParams.get("date") || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    selectedDate = requestedDate;
    const requestedDateObj = new Date(`${requestedDate}T00:00:00`);
    if (!Number.isNaN(requestedDateObj.getTime())) {
      currentYear = requestedDateObj.getFullYear();
      currentMonth = requestedDateObj.getMonth();
    }
  }
}

// ─── Element refs ─────────────────────────────────────────
const grid          = document.getElementById("calendar-grid");
const monthLabel    = document.getElementById("month-label");
const prevBtn       = document.getElementById("prev-month");
const nextBtn       = document.getElementById("next-month");
const todayBtn      = document.getElementById("today-btn");
const monthJump     = document.getElementById("month-jump");
const fabBtn        = document.getElementById("new-booking-fab");
const agendaTitle   = document.getElementById("agenda-title");
const agendaSub     = document.getElementById("agenda-subtitle");
const dayEventsEl   = document.getElementById("day-events");

const sheetBackdrop       = document.getElementById("sheet-backdrop");
const bookingSheet        = document.getElementById("booking-sheet");
const sheetContent        = document.getElementById("sheet-content");
const sheetActions        = document.getElementById("sheet-actions");
const btnDeposit          = document.getElementById("btn-deposit");
const btnCancelSession    = document.getElementById("btn-cancel-session");
const btnConfirmEnded     = document.getElementById("btn-confirm-ended");

const cancelReasonWrap    = document.getElementById("cancel-reason-wrap");
const cancelReasonInput   = document.getElementById("cancel-reason");
const cancelError         = document.getElementById("cancel-error");
const btnCancelBack       = document.getElementById("btn-cancel-back");
const btnCancelConfirm    = document.getElementById("btn-cancel-confirm");

const durationConfirmWrap = document.getElementById("duration-confirm-wrap");
const btnDurationYes      = document.getElementById("btn-duration-yes");
const btnDurationNo       = document.getElementById("btn-duration-no");

const timeAdjustPanel     = document.getElementById("time-adjust-panel");
const timeAdjustStart     = document.getElementById("time-adjust-start");
const timeAdjustEnd       = document.getElementById("time-adjust-end");
const timeAdjustError     = document.getElementById("time-adjust-error");
const btnTimeAdjustSave   = document.getElementById("btn-time-adjust-save");
const btnTimeAdjustCancel = document.getElementById("btn-time-adjust-cancel");

// ─── Session color map ────────────────────────────────────
const SESSION_BG = {
  "$25/hr":   "var(--session-25)",
  "$35/hr":   "var(--session-35)",
  "$45/hr":   "var(--session-45)",
  "$60/hr":   "var(--session-60)",
  "Personal": "var(--session-personal)"
};

// ─── Chip helpers ─────────────────────────────────────────
function chipLabel(booking) {
  const first = (booking.engineerName || "Engineer").split(" ")[0];
  if (booking.sessionType === "Personal") return `${first} — Personal`;
  if (booking.status === "cancelled")     return `${first} & ${booking.customerName}`;
  if (booking.depositSent)               return `${first} & ${booking.customerName}`;
  return `${first} & ${booking.customerName} — Pending`;
}

function chipBg(booking) {
  if (booking.status === "cancelled") return "var(--session-cancelled)";
  return SESSION_BG[booking.sessionType] || "var(--session-personal)";
}

// ─── Grid render ──────────────────────────────────────────
const DOW_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

let touchStartX = 0;
let touchStartY = 0;

function updateMonthJumpValue() {
  if (!monthJump) return;
  monthJump.value = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
}

function shiftMonth(delta) {
  const pivot = new Date(currentYear, currentMonth + delta, 1);
  currentYear = pivot.getFullYear();
  currentMonth = pivot.getMonth();
  renderGrid();
}

function goToCurrentMonth() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  selectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  renderGrid();
}

function formatDateForLabel(dateStr) {
  const dt = new Date(`${dateStr}T00:00:00`);
  return dt.toLocaleDateString("default", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function formatTime12h(timeValue = "") {
  const match = String(timeValue).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(timeValue || "");

  const hour24 = Number(match[1]);
  const minute = match[2];
  if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) {
    return String(timeValue || "");
  }

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${period}`;
}

function formatDateShort(dateStr = "") {
  if (!dateStr) return "";
  const dt = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString("default", { month: "short", day: "numeric" });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bookingsForDate(dateStr) {
  const dayEntries = bookingsByDate.get(dateStr) || [];
  return [...dayEntries].sort(([, a], [, b]) => (a.startTime || "").localeCompare(b.startTime || ""));
}

function dateOnly(value = "") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return value;
}

function incrementDateString(ymd) {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function datesCoveredByBooking(booking) {
  const start = dateOnly(booking?.date || "");
  const rawEnd = dateOnly(booking?.endDate || "");
  if (!start) return [];

  const end = rawEnd && rawEnd >= start ? rawEnd : start;
  const covered = [];
  let cursor = start;
  let guard = 0;

  while (cursor && cursor <= end && guard < 370) {
    covered.push(cursor);
    cursor = incrementDateString(cursor);
    guard += 1;
  }

  return covered;
}

function rebuildBookingsByDate() {
  const nextMap = new Map();

  Object.entries(allBookings).forEach(([id, booking]) => {
    datesCoveredByBooking(booking).forEach((dateKey) => {
      if (!nextMap.has(dateKey)) {
        nextMap.set(dateKey, []);
      }
      nextMap.get(dateKey).push([id, booking]);
    });
  });

  bookingsByDate = nextMap;
}

function ensureSelectedDateInCurrentMonth() {
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-`;
  if (selectedDate.startsWith(monthPrefix)) return;
  selectedDate = `${monthPrefix}01`;
}

function renderDayAgenda() {
  if (!dayEventsEl || !agendaTitle || !agendaSub) return;

  agendaTitle.textContent = formatDateForLabel(selectedDate);
  const selectedBookings = bookingsForDate(selectedDate);
  agendaSub.textContent = selectedBookings.length
    ? `${selectedBookings.length} ${selectedBookings.length === 1 ? "session" : "sessions"}`
    : "No sessions";

  dayEventsEl.innerHTML = "";

  if (!selectedBookings.length) {
    const empty = document.createElement("p");
    empty.className = "agenda-empty";
    empty.textContent = "No events for this day.";
    dayEventsEl.appendChild(empty);
    return;
  }

  selectedBookings.forEach(([id, booking]) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "agenda-item";

    const firstName = (booking.engineerName || "Engineer").split(" ")[0];
    const line = booking.sessionType === "Personal"
      ? `${firstName} — Personal`
      : `${firstName} & ${booking.customerName || "Client"}${booking.depositSent || booking.status === "cancelled" ? "" : " — Pending"}`;

    const isOvernight = Boolean(booking.endDate && booking.endDate !== booking.date);
    const agendaTime = isOvernight
      ? `${formatTime12h(booking.startTime)} - ${formatTime12h(booking.endTime)} (${formatDateShort(booking.endDate)})`
      : `${formatTime12h(booking.startTime)} - ${formatTime12h(booking.endTime)}`;

    const safeAgendaTime = escapeHtml(agendaTime);
    const safeLine = escapeHtml(line);
    const safeMeta = escapeHtml(booking.status === "cancelled" ? "Cancelled" : booking.sessionType);

    item.innerHTML = `
      <div class="agenda-time">${safeAgendaTime}</div>
      <div class="agenda-main">${safeLine}</div>
      <div class="agenda-meta">${safeMeta}</div>
    `;

    if (booking.status === "cancelled") {
      item.classList.add("is-cancelled");
    }

    item.addEventListener("click", () => openSheet(id));
    dayEventsEl.appendChild(item);
  });
}

function renderGrid() {
  if (!grid) return;
  grid.innerHTML = "";
  ensureSelectedDateInCurrentMonth();

  if (monthLabel) {
    monthLabel.textContent = new Date(currentYear, currentMonth, 1)
      .toLocaleString("default", { month: "long", year: "numeric" });
  }

  updateMonthJumpValue();

  // Day-of-week header row
  DOW_LABELS.forEach((d) => {
    const el = document.createElement("div");
    el.className = "calendar-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDow     = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth  = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Padding cells before day 1
  for (let i = 0; i < firstDow; i++) {
    const el = document.createElement("div");
    el.className = "calendar-day is-empty";
    grid.appendChild(el);
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("article");
    cell.className = "calendar-day";

    const isToday =
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear();
    if (isToday) cell.classList.add("is-today");

    const numEl = document.createElement("span");
    numEl.className = "day-number";
    numEl.textContent = String(day);
    cell.appendChild(numEl);

    // YYYY-MM-DD string for this cell
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (dateStr === selectedDate) {
      cell.classList.add("is-selected");
    }

    cell.addEventListener("click", () => {
      selectedDate = dateStr;
      renderGrid();
    });

    // Booking chips for this day
    bookingsForDate(dateStr).forEach(([id, booking]) => {

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "booking-chip";
      if (booking.status === "cancelled") chip.classList.add("is-cancelled");
      chip.style.background = chipBg(booking);
      chip.textContent = chipLabel(booking);
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        openSheet(id);
      });
      cell.appendChild(chip);
    });

    grid.appendChild(cell);
  }

  renderDayAgenda();
}

// Render immediately so calendar is visible even before network/data.
renderGrid();

// ─── Firebase subscription ────────────────────────────────
onValue(
  ref(db, "bookings"),
  (snapshot) => {
    allBookings = snapshot.val() || {};
    rebuildBookingsByDate();
    renderGrid();
  },
  (error) => {
    console.error("Bookings subscription failed:", error);
    // Keep the month grid visible even when bookings cannot be loaded.
    allBookings = {};
    bookingsByDate = new Map();
    renderGrid();
  }
);

// ─── Month nav ────────────────────────────────────────────
prevBtn?.addEventListener("click", () => {
  shiftMonth(-1);
});

nextBtn?.addEventListener("click", () => {
  shiftMonth(1);
});

todayBtn?.addEventListener("click", goToCurrentMonth);

monthJump?.addEventListener("change", () => {
  if (!monthJump.value) return;
  const [yearStr, monthStr] = monthJump.value.split("-");
  const nextYear = Number(yearStr);
  const nextMonth = Number(monthStr) - 1;
  if (Number.isNaN(nextYear) || Number.isNaN(nextMonth)) return;
  currentYear = nextYear;
  currentMonth = nextMonth;
  renderGrid();
});

// Swipe between months for mobile-first navigation.
grid?.addEventListener("touchstart", (event) => {
  const firstTouch = event.changedTouches[0];
  touchStartX = firstTouch.clientX;
  touchStartY = firstTouch.clientY;
}, { passive: true });

grid?.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  if (Math.abs(dx) < 40 || Math.abs(dy) > 30) return;
  if (dx < 0) {
    shiftMonth(1);
  } else {
    shiftMonth(-1);
  }
}, { passive: true });

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") shiftMonth(-1);
  if (event.key === "ArrowRight") shiftMonth(1);
});

// If the app stays open across month boundary, automatically follow real month.
let lastObservedMonth = `${today.getFullYear()}-${today.getMonth()}`;
setInterval(() => {
  const now = new Date();
  const observed = `${now.getFullYear()}-${now.getMonth()}`;
  if (observed === lastObservedMonth) return;

  const wasViewingCurrentMonth =
    currentYear === Number(lastObservedMonth.split("-")[0]) &&
    currentMonth === Number(lastObservedMonth.split("-")[1]);

  lastObservedMonth = observed;

  if (wasViewingCurrentMonth) {
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderGrid();
  }
}, 60000);

// ─── FAB ──────────────────────────────────────────────────
fabBtn?.addEventListener("click", () => {
  const dateParam = selectedDate ? `?date=${selectedDate}` : "";
  window.location.href = `booking.html${dateParam}`;
});

// ─── Sheet helpers ────────────────────────────────────────
function hasEndTimePassed(booking) {
  const effectiveEndDate = booking.endDate || booking.date;
  if (!effectiveEndDate || !booking.endTime) return false;
  const endDt = new Date(`${effectiveEndDate}T${booking.endTime}:00`);
  return Date.now() > endDt.getTime();
}

function showPanel(which) {
  sheetActions.hidden        = which !== "actions";
  cancelReasonWrap.hidden    = which !== "cancel";
  durationConfirmWrap.hidden = which !== "duration";
}

function populateSheet(booking) {
  const name = booking.engineerName || "Engineer";
  const sessionLine = booking.sessionType === "Personal"
    ? "Personal session"
    : `${booking.sessionType}${booking.customerName ? ` — ${booking.customerName}` : ""}`;

  const safeName = escapeHtml(name);
  const safeSessionLine = escapeHtml(sessionLine);

  let statusHtml;
  if (booking.status === "cancelled") {
    const safeCancellationReason = escapeHtml(booking.cancellationReason || "");
    statusHtml = `<span class="status-badge is-cancelled">Cancelled</span>`
      + (booking.cancellationReason
          ? `<p class="sheet-cancel-reason">"${safeCancellationReason}"</p>` : "");
  } else if (booking.depositSent) {
    statusHtml = `<span class="status-badge is-confirmed">Deposit Received</span>`;
  } else {
    statusHtml = `<span class="status-badge is-pending">Deposit Pending</span>`;
  }

  const isOvernight = Boolean(booking.endDate && booking.endDate !== booking.date);
  const dateSummary = isOvernight
    ? `${booking.date} → ${booking.endDate}`
    : booking.date;
  const timeSummary = isOvernight
    ? `${formatTime12h(booking.startTime)} – ${formatTime12h(booking.endTime)} (${formatDateShort(booking.endDate)})`
    : `${formatTime12h(booking.startTime)} – ${formatTime12h(booking.endTime)}`;

  const safeDateSummary = escapeHtml(dateSummary);
  const safeTimeSummary = escapeHtml(timeSummary);
  const safeNotes = escapeHtml(booking.notes || "");

  sheetContent.innerHTML = `
    <h3 class="sheet-title">${safeSessionLine}</h3>
    <p class="sheet-engineer">Engineer: ${safeName}</p>
    <div class="sheet-meta">
      <span>${safeDateSummary}</span>
      <span>${safeTimeSummary}</span>
    </div>
    ${statusHtml}
    ${booking.notes ? `<p class="sheet-notes">${safeNotes}</p>` : ""}
    ${booking.durationConfirmed ? `<p class="sheet-confirmed">✓ Duration confirmed</p>` : ""}
  `;
}

function openSheet(id) {
  const booking = allBookings[id];
  if (!booking) return;
  activeBookingId = id;

  // Reset
  cancelReasonInput.value  = "";
  cancelError.textContent  = "";
  btnCancelConfirm.disabled = false;
  btnDurationYes.disabled   = false;

  populateSheet(booking);
  showPanel("actions");

  const isCancelled = booking.status === "cancelled";
  btnDeposit.hidden       = booking.depositSent || isCancelled;
  btnCancelSession.hidden = isCancelled;
  btnConfirmEnded.hidden  = isCancelled || booking.durationConfirmed || !hasEndTimePassed(booking);

  sheetBackdrop.hidden = false;
  bookingSheet.hidden  = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  sheetBackdrop.hidden = true;
  bookingSheet.hidden  = true;
  document.body.style.overflow = "";
  activeBookingId = null;
}

sheetBackdrop?.addEventListener("click", closeSheet);

// ─── Deposit Sent ─────────────────────────────────────────
btnDeposit?.addEventListener("click", async () => {
  if (!activeBookingId) return;
  btnDeposit.disabled = true;
  try {
    await update(ref(db, `bookings/${activeBookingId}`), { depositSent: true });
    closeSheet();
  } catch (err) {
    btnDeposit.disabled = false;
    console.error("Deposit update failed:", err);
  }
});

// ─── Cancel Session ───────────────────────────────────────
btnCancelSession?.addEventListener("click", () => {
  showPanel("cancel");
  cancelReasonInput.focus();
});

btnCancelBack?.addEventListener("click", () => {
  showPanel("actions");
  cancelReasonInput.value = "";
  cancelError.textContent = "";
});

btnCancelConfirm?.addEventListener("click", async () => {
  const reason = cancelReasonInput.value.trim();
  if (!reason) {
    cancelError.textContent = "A reason is required to cancel this session.";
    return;
  }
  btnCancelConfirm.disabled = true;
  try {
    await update(ref(db, `bookings/${activeBookingId}`), {
      status: "cancelled",
      cancellationReason: reason
    });
    closeSheet();
  } catch (err) {
    btnCancelConfirm.disabled = false;
    cancelError.textContent = "Could not cancel. Try again.";
    console.error("Cancel update failed:", err);
  }
});

// ─── Confirm Session Ended → navigate to confirm.html ─────
btnConfirmEnded?.addEventListener("click", () => {
  if (!activeBookingId) return;
  window.location.href = `confirm.html?id=${activeBookingId}`;
});

// Duration Yes/No are on confirm.html — kept here for direct
// time-adjust access via btnDurationNo (unreachable via normal
// flow now but wired if sheet is reused in future)
btnDurationNo?.addEventListener("click", () => {
  const booking = allBookings[activeBookingId];
  if (!booking) return;
  timeAdjustStart.value = booking.startTime || "";
  timeAdjustEnd.value   = booking.endTime   || "";
  timeAdjustError.textContent = "";
  closeSheet();
  timeAdjustPanel.hidden = false;
  document.body.style.overflow = "hidden";
});

// ─── Time Adjust panel ────────────────────────────────────
btnTimeAdjustCancel?.addEventListener("click", () => {
  timeAdjustPanel.hidden = true;
  document.body.style.overflow = "";
  activeBookingId = null;
  history.replaceState(null, "", window.location.pathname);
});

btnTimeAdjustSave?.addEventListener("click", async () => {
  const newStart = timeAdjustStart.value;
  const newEnd   = timeAdjustEnd.value;
  if (!newStart || !newEnd) {
    timeAdjustError.textContent = "Both times are required.";
    return;
  }
  btnTimeAdjustSave.disabled = true;
  try {
    await update(ref(db, `bookings/${activeBookingId}`), {
      startTime: newStart,
      endTime: newEnd,
      durationConfirmed: true
    });
    timeAdjustPanel.hidden = true;
    document.body.style.overflow = "";
    activeBookingId = null;
    history.replaceState(null, "", window.location.pathname);
  } catch (err) {
    btnTimeAdjustSave.disabled = false;
    timeAdjustError.textContent = "Could not save. Try again.";
    console.error("Time adjust failed:", err);
  }
});

// ─── Handle ?edit= URL param on load ─────────────────────
const params = new URLSearchParams(window.location.search);
const editId = params.get("edit");
if (editId) {
  // Wait for bookings to load, then open time adjust (max 10 s)
  let waited = 0;
  const waitForBooking = setInterval(() => {
    waited += 100;
    if (allBookings[editId]) {
      clearInterval(waitForBooking);
      const booking = allBookings[editId];
      activeBookingId = editId;
      timeAdjustStart.value = booking.startTime || "";
      timeAdjustEnd.value   = booking.endTime   || "";
      timeAdjustError.textContent = "";
      timeAdjustPanel.hidden = false;
      document.body.style.overflow = "hidden";
    } else if (waited >= 10000) {
      clearInterval(waitForBooking);
      history.replaceState(null, "", window.location.pathname);
    }
  }, 100);
}