'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function isoWeekLabel(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function appendLogEntry({ logsDir, date, project, content }) {
  fs.mkdirSync(logsDir, { recursive: true });
  const filePath = path.join(logsDir, `${isoWeekLabel(date)}.md`);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const heading = `## ${dateStr} (${WEEKDAY_KO[date.getDay()]})`;

  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (!text.includes(heading)) {
    text += (text.length && !text.endsWith('\n') ? '\n' : '') + `${heading}\n`;
  }
  text += `- [${project}] ${content}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

function main() {
  const [project, ...rest] = process.argv.slice(2);
  const content = rest.join(' ');
  if (!project || !content) {
    process.stderr.write('Usage: node append.js <project> <content>\n');
    process.exit(1);
  }
  const logsDir = path.join(os.homedir(), '.claude', 'weekly-report', 'logs');
  const filePath = appendLogEntry({ logsDir, date: new Date(), project, content });
  process.stdout.write(`appended to ${filePath}\n`);
}

if (require.main === module) main();

module.exports = { appendLogEntry, isoWeekLabel };
