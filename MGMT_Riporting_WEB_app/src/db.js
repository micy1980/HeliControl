const { DatabaseSync, backup: sqliteBackup } = require('node:sqlite');
const { DB_PATH } = require('./config');

const db = new DatabaseSync(DB_PATH);

module.exports = {
  db,
  sqliteBackup,
};
