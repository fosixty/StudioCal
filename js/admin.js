import { onValue, ref, remove, set } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { db } from "./firebase-config.js";
import { isOwner, requireAuthAndRenderUser } from "./auth.js";

// Ensure the session is authenticated before loading admin data.
const user = await requireAuthAndRenderUser();
if (!user || !isOwner(user)) {
  window.location.replace("calendar.html");
  throw new Error("Admin access denied: owner role required.");
}

// ─── Element refs ─────────────────────────────────────────
const listEl     = document.getElementById("allowlist-entries");
const addForm    = document.getElementById("add-engineer-form");
const uidInput   = document.getElementById("engineer-uid");
const labelInput = document.getElementById("engineer-label");
const addError   = document.getElementById("add-error");
const addSuccess = document.getElementById("add-success");

// ─── Helpers ──────────────────────────────────────────────
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Firebase UIDs are 28 alphanumeric characters.
const VALID_UID_RE = /^[A-Za-z0-9]{20,40}$/;

// ─── Render allowlist ─────────────────────────────────────
function renderAllowlist(entries) {
  listEl.innerHTML = "";
  const uids = Object.keys(entries);

  if (!uids.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = "No engineers allowlisted yet.";
    listEl.appendChild(empty);
    return;
  }

  uids.forEach((uid) => {
    const val = entries[uid];
    const label = (val && typeof val === "object" ? val.label : "") || "";
    const active =
      val === true ||
      (val && typeof val === "object" && (val.approved === true || val.enabled === true));

    const row = document.createElement("div");
    row.className = "admin-entry";

    const info = document.createElement("div");
    info.className = "admin-entry-info";

    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "admin-entry-label";
      labelEl.textContent = label;
      info.appendChild(labelEl);
    }

    const uidEl = document.createElement("span");
    uidEl.className = "admin-entry-uid";
    uidEl.textContent = uid;
    info.appendChild(uidEl);

    const statusEl = document.createElement("span");
    statusEl.className = `admin-entry-status ${active ? "is-active" : "is-inactive"}`;
    statusEl.textContent = active ? "Active" : "Inactive";
    info.appendChild(statusEl);

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-ghost btn-sm";
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => handleRemove(uid, removeBtn));

    row.appendChild(info);
    row.appendChild(removeBtn);
    listEl.appendChild(row);
  });
}

// ─── Remove engineer ─────────────────────────────────────
async function handleRemove(uid, btn) {
  const displayName = escapeHtml(uid);
  if (!window.confirm(`Remove "${displayName}" from the allowlist?\n\nThey will no longer be able to sign in.`)) {
    return;
  }
  btn.disabled = true;
  try {
    await remove(ref(db, `allowlist/${uid}`));
  } catch (err) {
    btn.disabled = false;
    console.error("Remove engineer failed:", err);
    alert("Could not remove engineer. Check your connection and try again.");
  }
}

// ─── Real-time allowlist subscription ────────────────────
onValue(
  ref(db, "allowlist"),
  (snap) => {
    renderAllowlist(snap.val() || {});
  },
  (err) => {
    const isPermissionDenied = err?.code === "PERMISSION_DENIED" || String(err?.message || "").includes("PERMISSION_DENIED");
    if (isPermissionDenied) {
      window.location.replace("calendar.html");
      return;
    }

    listEl.innerHTML = "";
    const errEl = document.createElement("p");
    errEl.className = "form-error";
    errEl.textContent = "Could not load allowlist. Make sure the updated database rules have been deployed.";
    listEl.appendChild(errEl);
    console.error("Allowlist subscription failed:", err);
  }
);

// ─── Add engineer form ────────────────────────────────────
addForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  addError.textContent = "";
  addSuccess.textContent = "";

  const uid   = uidInput.value.trim();
  const label = labelInput.value.trim();

  if (!uid) {
    addError.textContent = "UID is required.";
    return;
  }

  if (!VALID_UID_RE.test(uid)) {
    addError.textContent = "That doesn't look like a valid Firebase UID. It should be ~28 alphanumeric characters with no spaces or symbols.";
    return;
  }

  if (label.length > 80) {
    addError.textContent = "Display label must be 80 characters or fewer.";
    return;
  }

  const saveBtn = event.submitter || addForm.querySelector("button[type='submit']");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const payload = label ? { approved: true, label } : true;
    await set(ref(db, `allowlist/${uid}`), payload);
    addSuccess.textContent = "Engineer added. They can now sign in.";
    uidInput.value   = "";
    labelInput.value = "";
  } catch (err) {
    const isPermission =
      err?.message?.includes("PERMISSION_DENIED") ||
      err?.code === "PERMISSION_DENIED";
    addError.textContent = isPermission
      ? "Permission denied. Deploy the updated database.rules.json to Firebase first."
      : "Could not add engineer. Check your connection and try again.";
    console.error("Add engineer failed:", err);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
});
