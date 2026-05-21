const crypto = require('crypto');
const readline = require('readline');

const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

function readVisible(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return readVisible(prompt);
  }

  return new Promise((resolve) => {
    let value = '';

    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function finish() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value);
    }

    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\u0003') {
          process.stdout.write('\nMegszakitva.\n');
          process.exit(130);
        }

        if (char === '\r' || char === '\n') {
          finish();
          return;
        }

        if (char === '\u0008' || char === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }

        if (char >= ' ') {
          value += char;
        }
      }
    }

    process.stdin.on('data', onData);
  });
}

async function main() {
  console.log('MGM Reporting Codex - tartalek SA jelszo hash keszito');
  console.log('A program csak hash-t keszit, nem ir at fajlt es nem ment jelszot.');
  console.log('');

  const first = await readHidden('Jelszo: ');
  const second = await readHidden('Jelszo meg egyszer: ');

  if (!first) {
    console.error('Hiba: ures jelszo nem hasznalhato.');
    process.exit(1);
  }

  if (first !== second) {
    console.error('Hiba: a ket jelszo nem egyezik.');
    process.exit(1);
  }

  console.log('');
  console.log('Kesz hash:');
  console.log(hashPassword(first));
  console.log('');
  console.log('Ezt az erteket kell beirni a server.js GLOBAL_SA_PASSWORD_HASH konstansba.');
}

main().catch((error) => {
  console.error('Varatlan hiba:', error.message);
  process.exit(1);
});
