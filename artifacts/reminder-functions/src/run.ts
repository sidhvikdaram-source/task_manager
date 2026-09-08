import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

type ReminderUser = {
  email?: string;
  firstName?: string;
  timezone?: string;
  reminderEmails?: unknown;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function dateKeyPlusDays(date: Date, timezone: string, days: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days)).toISOString().slice(0, 10);
}

function localHour(date: Date, timezone: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(date));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

const serviceAccount = JSON.parse(required("FIREBASE_SERVICE_ACCOUNT_JSON")) as { project_id: string; client_email: string; private_key: string };
initializeApp({ credential: cert({ projectId: serviceAccount.project_id, clientEmail: serviceAccount.client_email, privateKey: serviceAccount.private_key }) });

const transporter = nodemailer.createTransport({
  host: required("SMTP_HOST"),
  port: Number(required("SMTP_PORT")),
  secure: Number(required("SMTP_PORT")) === 465,
  auth: { user: required("SMTP_USER"), pass: required("SMTP_PASSWORD") },
});

const db = getFirestore();
const now = new Date();
const users = await db.collection("users").where("emailRemindersEnabled", "==", true).get();
let deliveries = 0;

for (const userSnapshot of users.docs) {
  const user = userSnapshot.data() as ReminderUser;
  const timezone = user.timezone || "UTC";
  if (localHour(now, timezone) !== 8) continue;
  const dueDate = dateKeyPlusDays(now, timezone, 2);
  const deliveryRef = userSnapshot.ref.collection("emailReminderDeliveries").doc(dueDate);
  if ((await deliveryRef.get()).exists) continue;

  const taskSnapshots = await userSnapshot.ref.collection("tasks").where("dueDate", "==", dueDate).get();
  const tasks = taskSnapshots.docs
    .map((snapshot) => snapshot.data())
    .filter((task) => task.status !== "completed" && task.archived !== true)
    .map((task) => String(task.title || "Untitled task"));
  if (!tasks.length) continue;

  const recipients = [...new Set((Array.isArray(user.reminderEmails) ? user.reminderEmails : [user.email])
    .filter((email): email is string => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
    .slice(0, 5);
  if (!recipients.length) continue;

  await transporter.sendMail({
    from: required("SMTP_FROM"),
    to: recipients,
    subject: `${tasks.length} Nimbus ${tasks.length === 1 ? "task is" : "tasks are"} due in two days`,
    text: `Hi ${user.firstName || "there"},\n\nDue ${dueDate}:\n${tasks.map((task) => `- ${task}`).join("\n")}\n\nOpen Nimbus: https://nimbusdo.web.app/`,
    html: `<p>Hi ${escapeHtml(user.firstName || "there")},</p><p>These tasks are due in two days:</p><ul>${tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ul><p><a href="https://nimbusdo.web.app/">Open Nimbus</a></p>`,
  });
  await deliveryRef.set({ dueDate, recipients, taskCount: tasks.length, sentAt: Timestamp.now() });
  deliveries += 1;
}

console.log(`Nimbus reminder scan complete: ${deliveries} ${deliveries === 1 ? "digest" : "digests"} sent.`);
