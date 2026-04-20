import { get, push, ref, set, update } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { db } from "./firebase-config.js";
import { engineerFullName, requireAuthAndRenderUser } from "./auth.js";

const user = await requireAuthAndRenderUser();

const form = document.getElementById("booking-form");
const sessionTypeEl = document.getElementById("session-type");
const customerWrap = document.getElementById("customer-field-wrap");
const customerInput = document.getElementById("customer-name");
const errorEl = document.getElementById("booking-error");
const headingEl = document.getElementById("booking-heading");
const dateEl = document.getElementById("date");
const endDateEl = document.getElementById("end-date");
const repeatWeeklyEl = document.getElementById("repeat-weekly");
const repeatUntilWrapEl = document.getElementById("repeat-until-wrap");
const repeatUntilDateEl = document.getElementById("repeat-until-date");
const startTimeEl = document.getElementById("start-time");
const endTimeEl = document.getElementById("end-time");
const saveButton = document.getElementById("save-booking-btn");

function setSaveButtonState(isSaving) {
  if (!saveButton) {
    return;
  }

  saveButton.disabled = isSaving;
  saveButton.textContent = isSaving
    ? (editId ? "Saving..." : "Creating...")
    : "Save Booking";
}

function saveTimeoutMessage() {
  return "Saving took too long. Check Realtime Database rules and your connection, then try again.";
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error("save-timeout"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

async function writeBookings(payloads) {
  if (!Array.isArray(payloads) || payloads.length < 1) {
    throw new Error("No booking payloads were provided.");
  }

  if (editId) {
    return withTimeout(update(ref(db, `bookings/${editId}`), payloads[0]), 12000);
  }

  const writes = payloads.map((payload) => {
    const bookingRef = push(ref(db, "bookings"));
    return set(bookingRef, payload);
  });

  return withTimeout(Promise.all(writes), 12000);
}

function formatDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimeInput(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildBookingPayloads(basePayload, startDateTime, endDateTime, repeatWeekly, repeatUntilDate) {
  if (!repeatWeekly) {
    return [basePayload];
  }

  const durationMs = endDateTime.getTime() - startDateTime.getTime();
  const recurrencePayloads = [];
  const occurrenceStart = new Date(startDateTime);
  const maxOccurrences = 260;

  while (formatDateInput(occurrenceStart) <= repeatUntilDate) {
    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
    recurrencePayloads.push({
      ...basePayload,
      date: formatDateInput(occurrenceStart),
      endDate: formatDateInput(occurrenceEnd),
      startTime: formatTimeInput(occurrenceStart),
      endTime: formatTimeInput(occurrenceEnd),
      recurrence: "weekly",
      recurrenceStart: basePayload.date,
      recurrenceUntil: repeatUntilDate
    });

    occurrenceStart.setDate(occurrenceStart.getDate() + 7);

    if (recurrencePayloads.length >= maxOccurrences) {
      throw new Error("Too many repeated sessions. Please shorten the repeat-until date.");
    }
  }

  return recurrencePayloads;
}

// ─── Populate time selects with 30-min increments ─────────
function buildTimeOptions(selectEl) {
  const orderedHours = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  for (const h of orderedHours) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const period = h < 12 ? "AM" : "PM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${h12}:${String(m).padStart(2, "0")} ${period}`;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      selectEl.appendChild(opt);
    }
  }
}

buildTimeOptions(startTimeEl);
buildTimeOptions(endTimeEl);

// ─── Edit mode detection ──────────────────────────────────
const params = new URLSearchParams(window.location.search);
const editId = params.get("id");
const requestedDate = params.get("date") || "";
let lastStartDateValue = dateEl?.value || "";

// Pre-fill date from calendar selection (new bookings only)
if (!editId) {
  if (requestedDate) {
    if (dateEl) dateEl.value = requestedDate;
    if (endDateEl) endDateEl.value = requestedDate;
  } else if (dateEl && endDateEl && dateEl.value) {
    endDateEl.value = dateEl.value;
  }
}

if (editId) {
  if (headingEl) headingEl.textContent = "Edit Booking";
  if (repeatWeeklyEl) repeatWeeklyEl.checked = false;
  if (repeatWeeklyEl) repeatWeeklyEl.disabled = true;
  if (repeatUntilDateEl) repeatUntilDateEl.value = "";
  if (repeatUntilDateEl) repeatUntilDateEl.required = false;
  if (repeatUntilWrapEl) repeatUntilWrapEl.hidden = true;
  try {
    const snap = await get(ref(db, `bookings/${editId}`));
    if (snap.exists()) {
      const b = snap.val();
      const notesInput = document.getElementById("notes");
      if (dateEl)        dateEl.value        = b.date       || "";
      if (endDateEl)     endDateEl.value     = b.endDate    || b.date || "";
      if (startTimeEl)   startTimeEl.value   = b.startTime  || "";
      if (endTimeEl)     endTimeEl.value     = b.endTime    || "";
      if (sessionTypeEl) sessionTypeEl.value = b.sessionType || "$25/hr";
      if (customerInput) customerInput.value = b.customerName || "";
      if (notesInput)    notesInput.value    = b.notes      || "";
      syncCustomerVisibility();
    }
  } catch (err) {
    console.error("Failed to load booking for edit:", err);
  }
}

function syncCustomerVisibility() {
  const isPersonal = sessionTypeEl?.value === "Personal";
  if (!customerWrap || !customerInput) {
    return;
  }

  customerWrap.hidden = isPersonal;
  customerInput.required = !isPersonal;

  if (isPersonal) {
    customerInput.value = "";
  }
}

function syncRepeatVisibility() {
  const shouldRepeat = Boolean(repeatWeeklyEl?.checked) && !editId;
  if (repeatUntilWrapEl) {
    repeatUntilWrapEl.hidden = !shouldRepeat;
  }
  if (repeatUntilDateEl) {
    repeatUntilDateEl.required = shouldRepeat;
    if (!shouldRepeat) {
      repeatUntilDateEl.value = "";
    } else if (!repeatUntilDateEl.value && dateEl?.value) {
      repeatUntilDateEl.value = dateEl.value;
    }
  }
}

sessionTypeEl?.addEventListener("change", syncCustomerVisibility);
repeatWeeklyEl?.addEventListener("change", syncRepeatVisibility);
syncCustomerVisibility();
syncRepeatVisibility();

dateEl?.addEventListener("change", () => {
  if (!endDateEl || !dateEl) {
    return;
  }

  const currentStartDate = dateEl.value;
  if (!endDateEl.value || endDateEl.value === lastStartDateValue) {
    endDateEl.value = currentStartDate;
  }

  if (repeatWeeklyEl?.checked && repeatUntilDateEl && !repeatUntilDateEl.value) {
    repeatUntilDateEl.value = currentStartDate;
  }

  lastStartDateValue = currentStartDate;
});

let isSubmitting = false;

async function handleBookingSave() {
  if (isSubmitting) {
    return;
  }

  errorEl.textContent = "";
  isSubmitting = true;

  setSaveButtonState(true);

  const formData = new FormData(form);
  const sessionType = String(formData.get("sessionType") || "");
  const isPersonal = sessionType === "Personal";
  const customerName = isPersonal ? "" : String(formData.get("customerName") || "").trim();
  const bookingDate = String(formData.get("date") || "");
  const bookingEndDate = String(formData.get("endDate") || "");
  const repeatWeekly = Boolean(formData.get("repeatWeekly")) && !editId;
  const repeatUntilDate = String(formData.get("repeatUntilDate") || "");
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");

  if (!isPersonal && !customerName) {
    errorEl.textContent = "Customer name is required for paid sessions.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (!bookingDate) {
    errorEl.textContent = "Please select a date.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (!startTime) {
    errorEl.textContent = "Please select a start time.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (!endTime) {
    errorEl.textContent = "Please select an end time.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (!bookingEndDate) {
    errorEl.textContent = "Please select an end date.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (repeatWeekly && !repeatUntilDate) {
    errorEl.textContent = "Please choose a repeat-until date for weekly sessions.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (repeatWeekly && repeatUntilDate < bookingDate) {
    errorEl.textContent = "Repeat-until date must be on or after the booking date.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  const startDateTime = new Date(`${bookingDate}T${startTime}:00`);
  const endDateTime = new Date(`${bookingEndDate}T${endTime}:00`);

  if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
    errorEl.textContent = "Please choose a valid date and time range.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (endDateTime <= startDateTime) {
    errorEl.textContent = "End date/time must be after start date/time.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  if (!user?.uid) {
    errorEl.textContent = "You are not signed in. Return to login and try again.";
    setSaveButtonState(false);
    isSubmitting = false;
    return;
  }

  const payload = {
    engineerName: engineerFullName(user),
    engineerUid: user.uid,
    customerName,
    sessionType,
    date: bookingDate,
    endDate: bookingEndDate,
    startTime,
    endTime,
    notes: String(formData.get("notes") || "").trim(),
    status: "pending",
    depositSent: false,
    cancellationReason: "",
    durationConfirmed: false
  };

  try {
    const payloads = buildBookingPayloads(payload, startDateTime, endDateTime, repeatWeekly, repeatUntilDate);
    await writeBookings(payloads);
    window.location.assign(`calendar.html?date=${bookingDate}`);
  } catch (error) {
    if (error?.message === "save-timeout") {
      errorEl.textContent = saveTimeoutMessage();
    } else if (error?.code === "PERMISSION_DENIED" || error?.message === "Permission denied") {
      errorEl.textContent = "Firebase blocked the save. Update Realtime Database rules to allow signed-in users.";
    } else if (error?.code === "auth/network-request-failed" || error?.message === "Failed to fetch") {
      errorEl.textContent = "Network error while saving. Check your connection and try again.";
    } else {
      errorEl.textContent = error?.message
        ? `Could not save booking: ${error.message}`
        : "Could not save booking. Please try again.";
    }
    console.error("Save booking failed:", error);
    setSaveButtonState(false);
    isSubmitting = false;
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleBookingSave();
});

saveButton?.addEventListener("click", async () => {
  await handleBookingSave();
});