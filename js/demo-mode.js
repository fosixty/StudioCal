const params = new URLSearchParams(window.location.search);
const host = String(window.location.hostname || "").toLowerCase();
const isGitHubPagesHost = host.endsWith(".github.io");
const explicitDemoOff = params.get("demo") === "0";
const explicitDemoOn = params.get("demo") === "1";

export const DEMO_MODE = explicitDemoOn || (isGitHubPagesHost && !explicitDemoOff);

export const DEMO_USER = {
  uid: "demo-user",
  email: "demo@studiocal.local",
  displayName: "Demo Engineer"
};

function formatYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromNow(daysFromToday) {
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + daysFromToday);
  return dt;
}

export function getDemoBookings() {
  const today = dateFromNow(0);
  const tomorrow = dateFromNow(1);
  const nextDay = dateFromNow(2);

  return {
    demoA: {
      engineerName: "Mitchell Gendron",
      engineerUid: "demo-owner",
      customerName: "Demo Artist A",
      sessionType: "$60/hr",
      date: formatYmd(today),
      endDate: formatYmd(today),
      startTime: "14:00",
      endTime: "17:00",
      notes: "Portfolio demo booking.",
      status: "pending",
      depositSent: true,
      cancellationReason: "",
      durationConfirmed: false
    },
    demoB: {
      engineerName: "Alex Rivera",
      engineerUid: "demo-user-2",
      customerName: "Demo Artist B",
      sessionType: "$45/hr",
      date: formatYmd(tomorrow),
      endDate: formatYmd(tomorrow),
      startTime: "18:00",
      endTime: "21:00",
      notes: "",
      status: "pending",
      depositSent: false,
      cancellationReason: "",
      durationConfirmed: false
    },
    demoC: {
      engineerName: "Sam Lee",
      engineerUid: "demo-user-3",
      customerName: "",
      sessionType: "Personal",
      date: formatYmd(nextDay),
      endDate: formatYmd(nextDay),
      startTime: "12:00",
      endTime: "13:30",
      notes: "Arrangement session.",
      status: "cancelled",
      depositSent: false,
      cancellationReason: "Demo cancellation example.",
      durationConfirmed: false
    }
  };
}

export function withDemoParam(path) {
  if (!DEMO_MODE) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}demo=1`;
}

export function showDemoBanner(message) {
  if (!DEMO_MODE) return;
  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.textContent = message;
  document.body.prepend(banner);
}
