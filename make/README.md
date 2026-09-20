# Connecting Make.com as the Primary AI Orchestrator

This guide provides end-to-end instructions for configuring your **Make.com Scenario** to orchestrate the entire PS-06 Voice Service Booking platform.

---

## 1. Create the Custom Webhook in Make.com

1. Log into your [Make.com](https://make.com) workspace.
2. Click **Create a new scenario**.
3. Add the initial trigger module: search for **Webhooks** and select **Custom webhook**.
4. Click **Add**, name it `PS06-Voice-Agent-Webhook`, and save.
5. Copy the generated Webhook URL (e.g., `https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
6. Paste this URL into your local environment:
   - In `PS06-Service-Booking-Agent/frontend/.env`:
     ```env
     VITE_MAKE_WEBHOOK_URL=https://hook.eu1.make.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
     ```
   - Or paste it directly into the frontend UI **Settings & Webhook** panel.

---

## 2. Configure the Make AI Agent Module

1. In your scenario, connect the webhook to the **Make AI Agent** module.
2. Set the model to your preferred LLM (e.g. OpenAI GPT-4o / Claude 3.5 Sonnet / Gemini 1.5 Pro).
3. Copy the system prompt from [make/ai-agent-prompt.md](file:///d:/var-codes/voice-to-shop/PS06-Service-Booking-Agent/make/ai-agent-prompt.md) into the **System Instructions** field.
4. Set **Temperature** to `0.2` for deterministic tool invocation and objective provider comparisons.

---

## 3. Attach AI Agent Tools (HTTP Modules)

Configure the tools defined in [make/tool-definitions.md](file:///d:/var-codes/voice-to-shop/PS06-Service-Booking-Agent/make/tool-definitions.md):

### Tool 1: `search_providers`
- **Method**: `POST`
- **URL**: `{{HOST}}/api/providers/search` (Use your deployed API or ngrok tunnel, e.g. `https://your-ngrok.ngrok-free.app/api/providers/search`)
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "service": "{{service}}",
    "problem": "{{problem}}",
    "pincode": "{{pincode}}",
    "date": "{{date}}",
    "preferred_time": "{{preferred_time}}"
  }
  ```

### Tool 2: `create_booking`
- **Method**: `POST`
- **URL**: `{{HOST}}/api/bookings`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "customer_id": "{{customer_id}}",
    "provider_id": "{{provider_id}}",
    "service": "{{service}}",
    "problem": "{{problem}}",
    "date": "{{date}}",
    "start_time": "{{start_time}}",
    "end_time": "{{end_time}}",
    "price": {{price}}
  }
  ```

### Tool 3: `check_availability`
- **Method**: `GET`
- **URL**: `{{HOST}}/api/providers/{{provider_id}}/availability?date={{date}}`

### Tool 4: `cancel_booking`
- **Method**: `POST`
- **URL**: `{{HOST}}/api/bookings/{{booking_id}}/cancel`
- **Body**: `{ "reason": "{{reason}}" }`

### Tool 5: `reschedule_booking`
- **Method**: `POST`
- **URL**: `{{HOST}}/api/bookings/{{booking_id}}/reschedule`
- **Body**: `{ "date": "{{date}}", "start_time": "{{start_time}}" }`

---

## 4. Configure Make Data Store (Session State Persistence)

1. Add a **Data Store** module (`Make Data Store`) to retain context across multi-turn voice dialogs.
2. Structure the Data Store with:
   - `Key`: `{{session_id}}`
   - `service`: Text
   - `problem`: Text
   - `pincode`: Text
   - `date`: Text
   - `time`: Text
   - `selected_provider`: Text
   - `booking_id`: Text
3. When the AI Agent updates state, persist the record using the **Data Store > Add/replace a record** module.

---

## 5. Configure Notifications

1. Add a router after the `create_booking` tool call.
2. If `create_booking` succeeded:
   - Route to **Email** module or **Twilio / WhatsApp** module.
   - Format:
     ```text
     BOOKING CONFIRMED
     Booking ID: {{booking_id}}
     Provider: {{provider_name}}
     Service: {{service}}
     Date: {{date}}
     Time: {{time}}
     Estimated Cost: ₹{{price}}
     ```

---

## 6. Configure the Webhook Response

1. Add a **Webhook > Webhook response** module as the terminal step.
2. **Status**: `200`
3. **Body**:
   ```json
   {
     "session_id": "{{session_id}}",
     "response_type": "voice",
     "text": "{{ai_agent_response_text}}",
     "state": {
       "service": "{{state.service}}",
       "problem": "{{state.problem}}",
       "pincode": "{{state.pincode}}",
       "date": "{{state.date}}",
       "time": "{{state.time}}"
     },
     "options": {{tool_search_providers_results}}
   }
   ```

---

## 7. Zero-Setup Local Fallback Mode
When developing locally without setting up the Make scenario immediately, the frontend connects seamlessly to the built-in **Make Webhook Simulator** at:
`http://localhost:8000/api/make-simulator`
which implements the exact same state machine and response JSON contract.
