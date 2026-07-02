'use strict';

function sanitizeProjectPath(absPath) {
  return absPath.replace(/[^A-Za-z0-9]/g, '-');
}

module.exports = { sanitizeProjectPath };
