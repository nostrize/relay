export const isOneOf = <T>(x: T, xs: T[]) => {
  return xs.some((e) => e === x);
}

export const not = (b: Boolean) => !b;

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isValidTimestamp(createdAt: unknown) {
  if (!isInteger(createdAt)) {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000); // Get current server time in seconds
  const oneHourAgo = currentTime - 3600;            // 1 hour ago in seconds
  const thirtyMinutesLater = currentTime + 1800;    // 30 minutes in the future in seconds

  return createdAt >= oneHourAgo && createdAt <= thirtyMinutesLater;
}

export function parseAmountTag(strAmount: string) {
  // all digit
  if (/^\d+$/.test(strAmount)) {
    return null;
  }

  const parsedInt = parseInt(strAmount);

  // integer
  if (isNaN(parsedInt)) {
    return null;
  }

  // positive
  if (Math.sign(parsedInt) !== 1) {
    return null;
  }

  return parsedInt;
}

export function parseTag(tagName: string, tags: string[]) {
  const tag = tags.find(([key, value]) => key === tagName && !!value);

  if (tag) {
    return tag[1];
  }

  return null;
}

export function is32ByteHex(str: unknown): str is string{
  if (typeof str !== "string") {
    return false;
  }

  // Check if the string has 64 characters (32 bytes in hex)
  if (str.length !== 64) {
    return false;
  }
  
  // Check if the string is lowercase and hex-encoded
  const hexRegex = /^[a-f0-9]{64}$/;
  return hexRegex.test(str);
}
