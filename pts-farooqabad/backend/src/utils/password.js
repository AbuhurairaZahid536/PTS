const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [algorithm, salt, storedHex] = String(stored).split('$');
    if (algorithm !== 'scrypt' || !salt || !storedHex) return resolve(false);
    crypto.scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      const actual = Buffer.from(derivedKey.toString('hex'), 'utf8');
      const expected = Buffer.from(storedHex, 'utf8');
      resolve(actual.length === expected.length && crypto.timingSafeEqual(actual, expected));
    });
  });
}

module.exports = { hashPassword, verifyPassword };
