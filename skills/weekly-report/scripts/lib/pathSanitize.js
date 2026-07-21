'use strict';

function sanitizeProjectPath(absPath) {
  return absPath.replace(/[^A-Za-z0-9]/g, '-');
}

function normalizeScanRoot(root) {
  return root.replace(/\\/g, '/');
}

module.exports = { sanitizeProjectPath, normalizeScanRoot };
