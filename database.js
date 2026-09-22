import fs from "node:fs";

const FILE = "./data.json";

export function loadData() {
  if (!fs.existsSync(FILE)) {
    return {
      users: [],
      messages: [],
      groups: []
    };
  }

  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

export function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
