import * as xlsx from "xlsx";

const wb = xlsx.utils.book_new();
const ws = xlsx.utils.aoa_to_sheet([
  ["username", "followers"],
  ["user1", 100],
  ["user2", 200],
]);
xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

const workbook = xlsx.read(buf, { type: "buffer" });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const data = xlsx.utils.sheet_to_json<string[]>(worksheet, {
  header: 1,
  defval: "",
});

console.log("data:", data);

const headers = (data[0] || []).map((h) => String(h).trim());
let usernameIndex = headers.findIndex((h) => h.toLowerCase() === "username");

let dataRows = data.slice(1);

if (usernameIndex === -1) {
  usernameIndex = 0;
  dataRows = data;
}

const rawUsernames = dataRows
  .map((row) => {
    return String(row[usernameIndex] || "").trim();
  })
  .filter(Boolean);

console.log("rawUsernames:", rawUsernames);
