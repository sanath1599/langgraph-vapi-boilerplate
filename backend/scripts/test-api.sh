#!/usr/bin/env bash
# Manual API test script - run with backend up: npm run dev
BASE="${1:-http://localhost:4000}"

echo "=== Caller ID ==="
echo "GET /caller-id/normalize?rawNumber=+15551234567 (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/caller-id/normalize?rawNumber=%2B15551234567"

echo "GET /caller-id/normalize (failure - missing param)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/caller-id/normalize"

echo ""
echo "=== Users by-phone ==="
echo "GET /users/by-phone?phone=+15551234567 (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/users/by-phone?phone=%2B15551234567"

echo "GET /users/by-phone (failure - missing phone)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/users/by-phone"

echo ""
echo "=== User by ID ==="
echo "GET /users/1 (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/users/1"

echo "GET /users/99999 (failure - not found)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/users/99999"

echo ""
echo "=== User search ==="
echo "GET /users/search?name=Alice&fuzzy=true (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/users/search?name=Alice&fuzzy=true"

echo ""
echo "=== Organizations ==="
echo "GET /organizations/1/booking-rules (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/organizations/1/booking-rules"

echo "GET /organizations/99999/booking-rules (failure - not found)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/organizations/99999/booking-rules"

echo ""
echo "=== Providers ==="
echo "GET /providers?organizationId=1 (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/providers?organizationId=1"

echo ""
echo "=== Availability ==="
echo "GET /availability?organizationId=1 (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/availability?organizationId=1"

echo "GET /availability (failure - missing organizationId)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/availability"

echo ""
echo "=== Appointments list ==="
echo "GET /appointments?userId=1&status=upcoming (success)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/appointments?userId=1&status=upcoming"

echo ""
echo "=== Appointment by ID ==="
echo "GET /appointments/2 (success - seed creates one appointment, id may be 2)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/appointments/2"

echo "GET /appointments/99999 (failure - not found)"
curl -s -w "\nstatus:%{http_code}\n" "$BASE/appointments/99999"

echo ""
echo "=== POST appointments/preview ==="
echo "POST /appointments/preview (success)"
curl -s -w "\nstatus:%{http_code}\n" -X POST "$BASE/appointments/preview" \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"providerId":1,"visitType":"follow_up","desiredTime":"2026-02-01T14:00:00.000Z"}'

echo ""
echo "=== POST appointments/cancel-options ==="
echo "POST /appointments/cancel-options (success)"
curl -s -w "\nstatus:%{http_code}\n" -X POST "$BASE/appointments/cancel-options" \
  -H "Content-Type: application/json" \
  -d '{"userId":1}'

echo ""
echo "=== POST /users (success) ==="
curl -s -w "\nstatus:%{http_code}\n" -X POST "$BASE/users" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"Flow","dob":"1985-06-10","gender":"other","phone":"+15557779999"}'

echo ""
echo "=== POST /users (failure - missing required) ==="
curl -s -w "\nstatus:%{http_code}\n" -X POST "$BASE/users" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Only"}'

echo ""
echo "=== POST /appointments/:id/cancel (failure - not confirmed) ==="
curl -s -w "\nstatus:%{http_code}\n" -X POST "$BASE/appointments/2/cancel" \
  -H "Content-Type: application/json" \
  -d '{"confirmed":false}'

echo ""
echo "Done."
