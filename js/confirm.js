import { requireAuthAndRenderUser } from "./auth.js";
import { get, ref, update } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { db } from "./firebase-config.js";

await requireAuthAndRenderUser();

const loadingEl     = document.getElementById("confirm-loading");
const confirmView   = document.getElementById("confirm-view");
const noBookingView = document.getElementById("no-booking-view");
const sessionInfo   = document.getElementById("confirm-session-info");
const confirmError  = document.getElementById("confirm-error");
const btnYes        = document.getElementById("btn-yes");
const btnNo         = document.getElementById("btn-no");

const params    = new URLSearchParams(window.location.search);
const bookingId = params.get("id");

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

function escapeHtml(value = "") {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

if (!bookingId) {
	loadingEl.hidden     = true;
	noBookingView.hidden = false;
} else {
	try {
		const snap    = await get(ref(db, `bookings/${bookingId}`));
		loadingEl.hidden = true;

		if (!snap.exists()) {
			noBookingView.hidden = false;
		} else {
			const booking = snap.val();
			const isOvernight = Boolean(booking.endDate && booking.endDate !== booking.date);
			const dateSummary = isOvernight
				? `${booking.date} → ${booking.endDate}`
				: booking.date;
			const timeSummary = isOvernight
				? `${formatTime12h(booking.startTime)} – ${formatTime12h(booking.endTime)} (${booking.endDate})`
				: `${formatTime12h(booking.startTime)} – ${formatTime12h(booking.endTime)}`;
			const sessionLine = booking.sessionType === "Personal"
				? "Personal session"
				: `${booking.sessionType}${booking.customerName ? ` — ${booking.customerName}` : ""}`;

			const safeSessionLine = escapeHtml(sessionLine);
			const safeEngineerName = escapeHtml(booking.engineerName || "—");
			const safeDateSummary = escapeHtml(dateSummary);
			const safeTimeSummary = escapeHtml(timeSummary);

			sessionInfo.innerHTML = `
				<div>
					<p class="confirm-label">Session</p>
					<p class="confirm-value">${safeSessionLine}</p>
				</div>
				<div>
					<p class="confirm-label">Engineer</p>
					<p class="confirm-value">${safeEngineerName}</p>
				</div>
				<div>
					<p class="confirm-label">Date</p>
					<p class="confirm-value">${safeDateSummary}</p>
				</div>
				<div>
					<p class="confirm-label">Scheduled time</p>
					<p class="confirm-value">${safeTimeSummary}</p>
				</div>
			`;

			confirmView.hidden = false;

			// Yes — duration confirmed as-is
			btnYes?.addEventListener("click", async () => {
				btnYes.disabled = true;
				btnNo.disabled  = true;
				confirmError.textContent = "";
				try {
					await update(ref(db, `bookings/${bookingId}`), { durationConfirmed: true });
					window.location.href = "calendar.html";
				} catch (err) {
					btnYes.disabled = false;
					btnNo.disabled  = false;
					confirmError.textContent = "Could not save. Try again.";
					console.error("Confirm duration failed:", err);
				}
			});

			// No — go to calendar time-adjust view
			btnNo?.addEventListener("click", () => {
				window.location.href = `calendar.html?edit=${bookingId}`;
			});
		}
	} catch (err) {
		loadingEl.hidden     = true;
		noBookingView.hidden = false;
		console.error("Failed to load booking:", err);
	}
}