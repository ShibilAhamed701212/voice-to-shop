# Make.com AI Agent Tool Definitions

These tool definitions specify the exact OpenAPI / JSON Schemas configured in the Make.com AI Agent module to interact with the local/cloud mock REST API endpoints.

---

## 1. `search_providers`
Used to query deterministic provider matches based on problem category, PIN code, date, and preferred time.

```json
{
  "name": "search_providers",
  "description": "Searches for suitable service providers filtered deterministically by service category, PIN code, and date/time availability.",
  "parameters": {
    "type": "object",
    "properties": {
      "service": {
        "type": "string",
        "description": "The category of service (e.g., 'AC Repair', 'Plumbing', 'Electrical', 'Cleaning')."
      },
      "problem": {
        "type": "string",
        "description": "Natural language description of the problem (e.g., 'AC not cooling', 'kitchen tap leak')."
      },
      "pincode": {
        "type": "string",
        "description": "6-digit postal code of the customer location (e.g., '560064')."
      },
      "date": {
        "type": "string",
        "format": "date",
        "description": "Requested date in YYYY-MM-DD format (e.g., '2026-09-21')."
      },
      "preferred_time": {
        "type": "string",
        "description": "Preferred start time in 24-hour HH:MM format (e.g., '18:00')."
      }
    },
    "required": ["service", "pincode", "date"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `POST`
- **URL**: `{{HOST}}/api/providers/search`
- **Body**: JSON mapped from tool arguments

---

## 2. `get_provider_details`
Retrieves detailed profile, reviews, and experience for a specific provider.

```json
{
  "name": "get_provider_details",
  "description": "Retrieves comprehensive profile details, experience, and pricing for a specific provider ID.",
  "parameters": {
    "type": "object",
    "properties": {
      "provider_id": {
        "type": "string",
        "description": "Unique provider ID (e.g., 'AC001')."
      }
    },
    "required": ["provider_id"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `GET`
- **URL**: `{{HOST}}/api/providers/{{provider_id}}`

---

## 3. `check_availability`
Inspects real-time slot availability for a provider on a specific date.

```json
{
  "name": "check_availability",
  "description": "Checks available time slots for a provider on a given date.",
  "parameters": {
    "type": "object",
    "properties": {
      "provider_id": {
        "type": "string",
        "description": "Unique provider ID (e.g., 'AC001')."
      },
      "date": {
        "type": "string",
        "description": "Date in YYYY-MM-DD format (e.g., '2026-09-21')."
      }
    },
    "required": ["provider_id", "date"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `GET`
- **URL**: `{{HOST}}/api/providers/{{provider_id}}/availability?date={{date}}`

---

## 4. `create_booking`
Executes an explicit booking, locks the time slot, and returns a confirmed booking ID.

```json
{
  "name": "create_booking",
  "description": "Creates a confirmed service booking and locks the provider slot. ONLY CALL AFTER EXPLICIT USER CONFIRMATION.",
  "parameters": {
    "type": "object",
    "properties": {
      "customer_id": {
        "type": "string",
        "description": "Customer identifier (e.g., 'C001')."
      },
      "provider_id": {
        "type": "string",
        "description": "Chosen provider identifier (e.g., 'AC001')."
      },
      "service": {
        "type": "string",
        "description": "Service name (e.g., 'AC Repair')."
      },
      "problem": {
        "type": "string",
        "description": "Issue description."
      },
      "date": {
        "type": "string",
        "description": "Booking date YYYY-MM-DD."
      },
      "start_time": {
        "type": "string",
        "description": "Start time HH:MM (e.g., '18:00')."
      },
      "end_time": {
        "type": "string",
        "description": "End time HH:MM (e.g., '19:00')."
      },
      "price": {
        "type": "number",
        "description": "Quoted price in INR."
      }
    },
    "required": ["customer_id", "provider_id", "date", "start_time"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `POST`
- **URL**: `{{HOST}}/api/bookings`
- **Body**: JSON mapped from tool arguments

---

## 5. `get_booking`
Retrieves existing booking status by booking ID.

```json
{
  "name": "get_booking",
  "description": "Retrieves the status, provider, and schedule of an existing booking ID.",
  "parameters": {
    "type": "object",
    "properties": {
      "booking_id": {
        "type": "string",
        "description": "Booking reference code (e.g., 'AC2841')."
      }
    },
    "required": ["booking_id"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `GET`
- **URL**: `{{HOST}}/api/bookings/{{booking_id}}`

---

## 6. `cancel_booking`
Cancels an active booking and automatically releases the locked provider slot.

```json
{
  "name": "cancel_booking",
  "description": "Cancels an existing booking after user confirmation and frees the provider slot.",
  "parameters": {
    "type": "object",
    "properties": {
      "booking_id": {
        "type": "string",
        "description": "Booking ID to cancel (e.g., 'AC2841')."
      },
      "reason": {
        "type": "string",
        "description": "Reason for cancellation."
      }
    },
    "required": ["booking_id"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `POST`
- **URL**: `{{HOST}}/api/bookings/{{booking_id}}/cancel`

---

## 7. `reschedule_booking`
Reschedules a booking to a new date/time slot, validating slot availability.

```json
{
  "name": "reschedule_booking",
  "description": "Reschedules an existing booking to a new date and time slot.",
  "parameters": {
    "type": "object",
    "properties": {
      "booking_id": {
        "type": "string",
        "description": "Booking ID to reschedule."
      },
      "date": {
        "type": "string",
        "description": "New requested date YYYY-MM-DD."
      },
      "start_time": {
        "type": "string",
        "description": "New start time HH:MM (e.g., '19:00')."
      }
    },
    "required": ["booking_id", "date", "start_time"]
  }
}
```

*HTTP Implementation in Make:*
- **Method**: `POST`
- **URL**: `{{HOST}}/api/bookings/{{booking_id}}/reschedule`

---

## 8. `send_notification`
Dispatches an SMS/Email/WhatsApp notification to customer and provider upon booking actions.

```json
{
  "name": "send_notification",
  "description": "Triggers multi-channel customer confirmation notifications.",
  "parameters": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string" },
      "booking_id": { "type": "string" },
      "channel": { "type": "string", "enum": ["sms", "email", "whatsapp", "in_app"] },
      "message": { "type": "string" }
    },
    "required": ["customer_id", "booking_id", "message"]
  }
}
```
