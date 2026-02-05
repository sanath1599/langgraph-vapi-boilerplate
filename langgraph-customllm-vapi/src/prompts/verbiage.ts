/**
 * Verbiage repository: all user-facing sentences from PrimaryRules.
 * Nodes and flows MUST import from here; no hardcoded copy in graph nodes.
 */

// ─── Greetings ─────────────────────────────────────────────────────────────

export function greetPersonalized(userName: string): string {
  return `Hello ${userName}, thank you for calling! This is your scheduling assistant. Please confirm your date of birth to continue.`;
}

export const GREET_GENERAL =
  "Thank you for calling! This is your scheduling assistant. How may I help you today?";

export const MENTION_SERVICES =
  "How may I help you today—would you like to book an appointment, reschedule, cancel, or register?";

// ─── Verify user ─────────────────────────────────────────────────────────

export const ASK_CURRENT_OR_FIRST =
  "Are you already registered with us, or is this your first time calling?";

export const ASK_NAME = "May I have your name please?";

export const NAME_NOT_FOUND_ASK_SPELL =
  "I couldn't find that name in our system. Could you please spell your last name for me?";

export function searchingForSpelled(name: string): string {
  return `Thank you. Let me search for ${name}...`;
}

export function confirmSpellingLetters(letters: string): string {
  return `That's ${letters}, correct?`;
}

export const ASK_DOB_CONFIRM = "To confirm, may I have your date of birth?";

export const DOB_MISMATCH_TRY_PHONE =
  "That doesn't match our records. Let me try with your phone number.";

export const ASK_PHONE = "What's your phone number?";

export const NOT_FOUND_OFFER_REGISTER_OR_TRANSFER =
  "I can't find an existing record under that name or phone number. Would you like to register as a new user?";

export const TRANSFER_LOCATE_RECORD =
  "Let me transfer you to our staff who can help locate your record.";

export const CONFIRM_THEN_SERVICES =
  "Thanks for confirming. How would you like to proceed—book an appointment, reschedule, cancel?";

// ─── Identity (when repurposed) ────────────────────────────────────────────

/** When we found the user by caller ID but couldn't verify DOB — transfer, don't ask phone. */
export const DOB_VERIFY_FAIL_TRANSFER =
  "I couldn't verify your date of birth. I'll connect you with our staff to help.";

export const IDENTITY_FAILED_GOODBYE =
  "The data in our systems doesn't match. Goodbye.";

// ─── Registration ──────────────────────────────────────────────────────────

export const CLINIC_NOT_ACCEPTING =
  "I'm sorry, we're not accepting new registrations at this time. Would you like me to add you to our waitlist?";

export const ADD_WAITLIST_YES =
  "You've been added. We'll contact you when spots open up.";

export const ADD_WAITLIST_NO = "I understand. Is there anything else I can help with?";

export const REGISTER_INTRO =
  "Wonderful! I can help you register. This will take about 2 minutes. I'll need some information for your record.";

export const REGISTER_FULL_NAME =
  "What is your full legal name?";

export const REGISTER_DOB = "What is your date of birth?";

export const REGISTER_PHN =
  "Do you have an ID number we have on file? If yes, what is it?";

export const REGISTER_NO_BC_CARD =
  "No problem. We can continue without it.";

export const REGISTER_GENDER =
  "What is your gender?";

export const REGISTER_PHONE = "What's the best phone number to reach you?";

export const REGISTER_EMAIL =
  "And your email address? This is optional but helps us send appointment reminders.";

export const REGISTER_EMAIL_SKIP = "That's fine, we can skip that.";

export const REGISTER_ADDRESS =
  "What is your mailing address, including city and postal code?";

export function confirmRegistration(params: {
  name: string;
  dob: string;
  phn: string;
  phone: string;
  address: string;
}): string {
  return `Let me confirm your information:
- Name: ${params.name}
- Date of birth: ${params.dob}
- PHN: ${params.phn}
- Phone: ${params.phone}
- Address: ${params.address}

Is everything correct?`;
}

/** Summary of collected registration fields for final confirmation (no PHN/address). */
export function confirmRegistrationCollected(params: {
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email?: string;
}): string {
  const lines = [
    `- Name: ${params.name}`,
    `- Date of birth: ${params.dob}`,
    `- Gender: ${params.gender}`,
    `- Phone: ${params.phone}`,
  ];
  if (params.email) lines.push(`- Email: ${params.email}`);
  return `Let me confirm your information:\n${lines.join("\n")}\n\nIs everything correct?`;
}

export const REGISTER_SUCCESS =
  "You're all registered! Welcome. Would you like to book your first appointment now?";

export const REGISTER_SUCCESS_NO_BOOK =
  "You can call us anytime to book. Is there anything else I can help with?";

export const REGISTER_ERROR_TRANSFER =
  "I'm sorry, I wasn't able to complete your registration. Let me transfer you to our staff who can help.";

/** When user wants to correct something: transfer instead of re-verifying. */
export const REGISTER_CORRECTION_TRANSFER =
  "No problem. Let me connect you with our staff to make those changes.";

export const ALREADY_REGISTERED_MESSAGE =
  "You're already registered. Is there anything else I can help with—book, reschedule, or cancel an appointment?";

// ─── Booking ───────────────────────────────────────────────────────────────

export const ASK_VISIT_TYPE =
  "Would you prefer an in-person visit or a phone consultation?";

export const ASK_REASON =
  "What is the reason for your visit?";

export const BOOK_CHECK_SCHEDULE = "Let me check the schedule for you...";

export function earliestAvailable(day: string, date: string, time: string, name: string): string {
  return `The earliest available is ${day}, ${date} at ${time} with ${name}. Does that work for you?`;
}

export const DECLINE_PREFER_DAY_OR_TIME =
  "No problem! Would you prefer a different day, or a specific time of day?";

export function confirmBook(day: string, date: string, time: string, name: string): string {
  return `I'll book you for ${day}, ${date} at ${time} with ${name}. Is that correct?`;
}

export function bookSuccess(day: string, time: string, name: string): string {
  return `You're all set! Your appointment is confirmed for ${day} at ${time} with ${name}.`;
}

export const BOOK_INSTRUCTIONS_BC_CARD =
  "Please arrive 5 minutes early. Is there anything else I can help you with?";

export const BOOK_INSTRUCTIONS_FASTING =
  "If any preparation is needed, we'll let you know. Is there anything else?";

export const BOOK_INSTRUCTIONS_PHONE =
  "The provider will call you at the number we have on file.";

/** When there is only one slot: ask if that's the one they want to book (don't read as a list). */
export function singleSlotOffer(dateWords: string): string {
  return `I have ${dateWords} available. Is that the one you'd like to book?`;
}

/** After user picks an option: confirm the refetched date/time with the user before booking. */
export function confirmSlotWithUser(dateWords: string): string {
  return `I have ${dateWords}. Is that the one you'd like to book?`;
}

// ─── Reschedule ────────────────────────────────────────────────────────────

export const FIND_UPCOMING = "Let me find your upcoming appointments...";

export function oneAppt(date: string, time: string, name: string): string {
  return `I see your appointment on ${date} at ${time} with ${name}. Is this the one you'd like to change?`;
}

export function multipleAppt(date1: string, date2: string): string {
  return `I see appointments on ${date1} and ${date2}. Which one would you like to reschedule?`;
}

export const WHEN_WORK_BETTER = "When would work better for you?";

export function moveApptOffer(day: string, date: string, time: string, name: string): string {
  return `I have ${day}, ${date} at ${time} available. Shall I move your appointment to that time?`;
}

export function rescheduleDone(day: string, time: string, name: string): string {
  return `Done! Your appointment has been moved to ${day} at ${time} with ${name}. Is there anything else I can help with?`;
}

// ─── Cancel ────────────────────────────────────────────────────────────────

export function wouldLikeCancel(date: string, time: string, name: string): string {
  return `I see your appointment on ${date} at ${time} with ${name}. Would you like me to cancel this?`;
}

export const SURE_CANCEL = "Are you sure you'd like to cancel?";

export const CANCEL_DONE =
  "Your appointment has been cancelled. Would you like to schedule for another day?";

export const CANCEL_DONE_NO =
  "Thank you for letting us know. Is there anything else I can help with?";

// ─── Emergency / transfer / close ───────────────────────────────────────────

export const EMERGENCY_911 =
  "This sounds like a medical emergency. Please hang up and call 911 immediately. Do not wait for an appointment.";

export const TRANSFER_STAFF =
  "Let me transfer you to our staff. One moment please.";

export const MEDICAL_TRANSFER =
  "I handle scheduling only. Let me transfer you to our staff.";

export const CLOSE_EN = "Thank you for calling! Have a wonderful day.";

export const CLOSE_ZH = " ";

export const ANYTHING_ELSE = "Is there anything else I can help you with?";

/** Intro when listing upcoming appointments (get appointments flow). */
export const YOUR_UPCOMING_APPOINTMENTS = "Here are your upcoming appointments:";
export const NO_UPCOMING_APPOINTMENTS = "You have no upcoming appointments.";

// ─── Error ────────────────────────────────────────────────────────────────

export const TOOL_RETRY = "I'm sorry, let me try that again...";

export const NO_OPENINGS_TRY_OTHER_DAY =
  "I don't see any openings for that date. Would you like to try a different day?";

export const REGISTRATION_FAILED_TRANSFER =
  "I wasn't able to complete your registration. Let me transfer you to our staff.";

// ─── Language courtesy (EN + Mandarin) ──────────────────────────────────────

export const THANK_PATIENCE_EN = "Thank you for your patience!";
export const THANK_PATIENCE_ZH = "感谢您的耐心等待！";

export const APPRECIATE_HOLDING_EN = "I appreciate you holding.";
export const APPRECIATE_HOLDING_ZH = "请稍等，我帮您查一下。" as const;

export const LET_ME_CHECK_EN = "Let me check on that for you.";
export const LET_ME_CHECK_ZH = "请稍等，我帮您查一下.";

export const SORRY_WAIT_EN = "I'm sorry for the brief wait.";
export const SORRY_WAIT_ZH = "抱歉让您久等了。";

export const ANYTHING_ELSE_ZH = "请问还有什么可以帮您的吗？";

// ─── Phone confirmation (PrimaryRules) ──────────────────────────────────────

export function confirmPhoneFormatted(formatted: string): string {
  return `That's ${formatted}, correct?`;
}
