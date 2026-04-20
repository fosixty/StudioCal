import {
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const OWNER_EMAILS = new Set([
  "owner@example.com"
]);

const OWNER_UIDS = new Set([
  "YOUR_OWNER_UID_1",
  "YOUR_OWNER_UID_2"
]);

const FALLBACK_ALLOWED_UIDS = new Set([
  "YOUR_OWNER_UID_1",
  "YOUR_OWNER_UID_2"
]);

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function fallbackNameFromEmail(email = "") {
  const raw = email.split("@")[0] || "Engineer";
  return raw
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Engineer";
}

export function isOwner(user = null) {
  const normalizedEmail = normalizeEmail(user?.email || "");
  const uid = String(user?.uid || "").trim();
  if (uid && OWNER_UIDS.has(uid)) {
    return true;
  }
  return Boolean(normalizedEmail && OWNER_EMAILS.has(normalizedEmail));
}

export function engineerFullName(user) {
  return user?.displayName || fallbackNameFromEmail(user?.email || "");
}

export function engineerFirstName(user) {
  return engineerFullName(user).split(" ")[0] || "Engineer";
}

export async function isAllowlisted(user = null) {
  const uid = user?.uid || "";
  const normalizedEmail = normalizeEmail(user?.email || "");

  if (!uid) {
    return false;
  }

  if (FALLBACK_ALLOWED_UIDS.has(uid)) {
    return true;
  }

  if (normalizedEmail && OWNER_EMAILS.has(normalizedEmail)) {
    return true;
  }

  const resolveAllowlistValue = (value) => {
    if (value === true) {
      return true;
    }
    if (value && typeof value === "object") {
      return value.approved === true || value.enabled === true;
    }
    return false;
  };

  try {
    const snap = await get(ref(db, `allowlist/${uid}`));
    return resolveAllowlistValue(snap.val());
  } catch (error) {
    console.error("Allowlist check failed:", error);

    // Retry once after forcing a fresh token to avoid transient auth-rule races.
    try {
      await user?.getIdToken(true);
      const retrySnap = await get(ref(db, `allowlist/${uid}`));
      return resolveAllowlistValue(retrySnap.val());
    } catch (retryError) {
      console.error("Allowlist retry failed:", retryError);
      return false;
    }
  }
}

function redirectUnauthorized() {
  window.location.href = "index.html?error=not-allowlisted";
}

export function requireAuthAndRenderUser() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        resolve(null);
        return;
      }

      const allowed = await isAllowlisted(user);
      if (!allowed) {
        try {
          await signOut(auth);
        } catch (error) {
          console.error("Sign out after allowlist rejection failed:", error);
        }
        redirectUnauthorized();
        resolve(null);
        return;
      }

      const fullName = engineerFullName(user);
      const firstName = engineerFirstName(user);

      document.querySelectorAll("[data-engineer-name]").forEach((el) => {
        el.textContent = fullName;
      });

      document.querySelectorAll("[data-engineer-first-name]").forEach((el) => {
        el.textContent = firstName;
      });

      const owner = isOwner(user);
      document.querySelectorAll("[data-owner-only]").forEach((el) => {
        el.hidden = !owner;
      });

      resolve(user);
    });
  });
}

function bindLogoutButtons() {
  document.querySelectorAll("[data-logout-btn]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await signOut(auth);
        window.location.href = "index.html";
      } catch (error) {
        console.error("Logout failed:", error);
      }
    });
  });
}

async function initIndexPage() {
  const btn = document.getElementById("google-login-btn");
  if (!btn) {
    return;
  }

  const errorEl = document.getElementById("login-error");
  const params = new URLSearchParams(window.location.search);
  if (params.get("error") === "not-allowlisted") {
    errorEl.textContent = "Your account is not approved yet. Ask an admin to add you to the allowlist.";
  }

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error("Could not set auth persistence:", error);
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }

    const allowed = await isAllowlisted(user);
    if (allowed) {
      window.location.href = "calendar.html";
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out after allowlist rejection failed:", error);
    }
    errorEl.textContent = "Your account is not approved yet. Ask an admin to add you to the allowlist.";
    btn.disabled = false;
    btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google`;
  });

  btn.addEventListener("click", async () => {
    errorEl.textContent = "";
    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      btn.textContent = "Checking access...";
    } catch (error) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google`;
      if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") {
        return;
      }
      if (error?.code === "auth/network-request-failed") {
        errorEl.textContent = "Network error. Check your connection and try again.";
      } else if (error?.code === "auth/unauthorized-domain") {
        errorEl.textContent = "This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.";
      } else {
        errorEl.textContent = "Sign in failed. Try again.";
      }
      console.error("Google sign in error:", error);
    }
  });
}

bindLogoutButtons();
initIndexPage();