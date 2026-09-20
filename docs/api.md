# PS-06 Service Booking REST API Specification

This document provides complete documentation for the mock REST APIs powering the service booking platform.

**Base URL (Local)**: `http://localhost:8000`

---

## 1. Health Check

### `GET /health`
Returns service status and version.

**Response (200 OK)**:
```json
{
  "status": "ok",
  "service": "PS06 Mock Service API",
  "version": "1.0.0"
}
```

---

## 2. Provider Endpoints

### `GET /api/providers`
Returns a list of providers with optional filtering.

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `service` | string | Filter by service name or category (e.g. `AC Repair`) |
| `pincode` | string | Filter by 6-digit PIN code (e.g. `560064`) |
| `date` | string | Filter by date `YYYY-MM-DD` |
| `start_time` | string | Filter by start time `HH:MM` |

**Example Request**:
```http
GET /api/providers?service=AC%20Repair&pincode=560064&date=2026-09-21&start_time=18:00
```

**Response (200 OK)**:
```json
{
  "success": true,
  "count": 2,
  "providers": [
    {
      "provider_id": "AC001",
      "name": "Rahul Kumar",
      "category": "AC Repair",
      "location": {
        "pincode": "560064",
        "area": "Yelahanka",
        "city": "Bengaluru"
      },
      "rating": 4.7,
      "review_count": 128,
      "experience_years": 6,
      "price": 399,
      "currency": "INR",
      "eta_minutes": 25,
      "phone": "+919876543210",
      "services": ["AC Repair", "AC Not Cooling", "AC Maintenance"],
      "availability": [
        { "date": "2026-09-21", "start": "18:00", "end": "19:00", "available": true }
      ],
      "status": "active"
    }
  ]
}
```

---

### `POST /api/providers/search`
Searches for suitable providers deterministically matching user parameters.

**Request Body**:
```json
{
  "service": "AC Repair",
  "problem": "AC not cooling",
  "pincode": "560064",
  "date": "2026-09-21",
  "preferred_time": "18:00"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "count": 2,
  "providers": [
    {
      "provider_id": "AC001",
      "name": "Rahul Kumar",
      "category": "AC Repair",
      "price": 399,
      "rating": 4.7,
      "eta_minutes": 25,
      "availability": [
        { "date": "2026-09-21", "start": "18:00", "end": "19:00", "available": true }
      ]
    },
    {
      "provider_id": "AC002",
      "name": "Arun Services",
      "category": "AC Repair",
      "price": 349,
      "rating": 4.5,
      "eta_minutes": 35,
      "availability": [
        { "date": "2026-09-21", "start": "19:00", "end": "20:00", "available": true }
      ]
    }
  ]
}
```

---

### `GET /api/providers/:id`
Retrieves full details for a single provider.

**Response (200 OK)**:
```json
{
  "success": true,
  "provider": {
    "provider_id": "AC001",
    "name": "Rahul Kumar",
    "category": "AC Repair",
    "rating": 4.7,
    "price": 399
  }
}
```

---

### `GET /api/providers/:id/availability`
Inspects real-time slot availability for a provider.

**Query Parameters**:
- `date`: (Optional) `YYYY-MM-DD`

**Response (200 OK)**:
```json
{
  "success": true,
  "provider_id": "AC001",
  "date": "2026-09-21",
  "slots": [
    { "date": "2026-09-21", "start": "18:00", "end": "19:00", "available": true },
    { "date": "2026-09-21", "start": "19:00", "end": "20:00", "available": true }
  ]
}
```

---

## 3. Booking Endpoints

### `POST /api/bookings`
Creates a confirmed booking and locks the requested time slot.

**Request Body**:
```json
{
  "customer_id": "C001",
  "provider_id": "AC001",
  "service": "AC Repair",
  "problem": "AC not cooling",
  "date": "2026-09-21",
  "start_time": "18:00",
  "end_time": "19:00",
  "price": 399
}
```

**Success Response (201 Created)**:
```json
{
  "success": true,
  "booking_id": "AC2841",
  "status": "confirmed",
  "provider": {
    "id": "AC001",
    "name": "Rahul Kumar"
  },
  "service": "AC Repair",
  "date": "2026-09-21",
  "time": "18:00-19:00",
  "price": 399
}
```

**Double Booking Error Response (409 Conflict)**:
```json
{
  "success": false,
  "error": "SLOT_UNAVAILABLE"
}
```

---

### `GET /api/bookings/:id`
Retrieves an existing booking by booking ID.

**Response (200 OK)**:
```json
{
  "success": true,
  "booking": {
    "booking_id": "AC2841",
    "customer_id": "C001",
    "provider_id": "AC001",
    "provider_name": "Rahul Kumar",
    "service": "AC Repair",
    "date": "2026-09-21",
    "start_time": "18:00",
    "end_time": "19:00",
    "price": 399,
    "status": "confirmed"
  }
}
```

---

### `POST /api/bookings/:id/cancel`
Cancels an active booking and releases the slot.

**Request Body**:
```json
{
  "reason": "Customer conflict with evening schedule"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Booking successfully cancelled",
  "booking": {
    "booking_id": "AC2841",
    "status": "cancelled"
  }
}
```

---

### `POST /api/bookings/:id/reschedule`
Reschedules a booking to a new date and time.

**Request Body**:
```json
{
  "date": "2026-09-22",
  "start_time": "18:00"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Booking successfully rescheduled",
  "booking": {
    "booking_id": "AC2841",
    "date": "2026-09-22",
    "start_time": "18:00",
    "end_time": "19:00",
    "status": "rescheduled"
  }
}
```
