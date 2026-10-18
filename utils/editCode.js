const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const EDIT_CODE_MIN_LENGTH = 8;
const EDIT_CODE_MAX_LENGTH = 128;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function validateEditCode(editCode) {
  if (editCode === undefined || editCode === null) return null;
  if (typeof editCode !== 'string' || editCode.length < EDIT_CODE_MIN_LENGTH || editCode.length > EDIT_CODE_MAX_LENGTH) {
    return {
      status: 400,
      error: `Edit code must be between ${EDIT_CODE_MIN_LENGTH} and ${EDIT_CODE_MAX_LENGTH} characters`
    };
  }
  return null;
}

async function hashEditCode(editCode) {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(editCode, salt, KEY_BYTES);
  return { editCodeSalt: salt.toString('hex'), editCodeHash: hash.toString('hex') };
}

async function verifyEditCode(editCode, saltHex, hashHex) {
  if (typeof editCode !== 'string' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEY_BYTES) return false;
  const actual = await scrypt(editCode, Buffer.from(saltHex, 'hex'), KEY_BYTES);
  return timingSafeEqual(actual, expected);
}

module.exports = { EDIT_CODE_MIN_LENGTH, EDIT_CODE_MAX_LENGTH, validateEditCode, hashEditCode, verifyEditCode };