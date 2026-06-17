import { writeFileSync } from "fs";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1A1D20"/><path d="M17 5L9 17.5h5.5L12 27l10-13H16l2-9h-1z" fill="#FFFFFF"/></svg>';
writeFileSync("artifacts/task-manager/public/favicon.svg", svg);
console.log("Done");