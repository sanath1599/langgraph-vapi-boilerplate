import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js";

export type PhoneType = "mobile" | "landline" | "unknown";

export interface NormalizedPhone {
  normalizedNumber: string;
  country: string;
  type: PhoneType;
}

const MOBILE_TYPES = ["MOBILE", "FIXED_LINE_OR_MOBILE"];
const LANDLINE_TYPES = ["FIXED_LINE", "FIXED_LINE_OR_MOBILE"];

/**
 * Normalize raw phone input to E.164 and infer country/type.
 * Strips spaces, dashes, parentheses; uses +CC or default country.
 */
export function normalizePhone(rawNumber: string, defaultCountry: string = "US"): NormalizedPhone {
  const digitsOnly = rawNumber.replace(/\D/g, "");
  if (digitsOnly.length < 10) {
    return {
      normalizedNumber: rawNumber.replace(/\s/g, ""),
      country: defaultCountry,
      type: "unknown",
    };
  }

  let country: string = defaultCountry;
  let withPlus = rawNumber.trim();
  if (/^\+[1-9]/.test(withPlus)) {
    const match = withPlus.match(/^\+(\d{1,3})/);
    if (match) {
      const cc = match[1];
      if (cc.length === 1 && cc >= "1" && cc <= "7") country = cc === "1" ? "US" : "US";
      else if (cc.length === 2) {
        const map: Record<string, string> = { "1": "US", "44": "GB", "91": "IN", "49": "DE", "33": "FR", "81": "JP", "86": "CN" };
        country = map[cc] ?? defaultCountry;
      }
    }
  }

  try {
    const parsed = parsePhoneNumberWithError(withPlus.startsWith("+") ? withPlus : `+${country === "US" ? "1" : ""}${digitsOnly}`, country as CountryCode);
    const normalized = parsed.number;
    const ptype = parsed.getType() ?? "";
    let type: PhoneType = "unknown";
    if (ptype && MOBILE_TYPES.includes(ptype)) type = "mobile";
    else if (ptype && LANDLINE_TYPES.includes(ptype)) type = "landline";
    return {
      normalizedNumber: normalized,
      country: parsed.country ?? country,
      type,
    };
  } catch {
    const fallback = withPlus.startsWith("+") ? withPlus : `+1${digitsOnly}`;
    return {
      normalizedNumber: fallback.replace(/\D/g, "").length >= 10 ? fallback : rawNumber,
      country,
      type: "unknown",
    };
  }
}
