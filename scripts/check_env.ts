import "dotenv/config";
const k = process.env.RESEND_API_KEY || "";
const f = process.env.RESEND_FROM_EMAIL || "";
console.log("RESEND_API_KEY length:", k.length, "· starts:", k.slice(0, 3), "· placeholder:", k.includes("xxxx"));
console.log("RESEND_FROM_EMAIL:", f);
