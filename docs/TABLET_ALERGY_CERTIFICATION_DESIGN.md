## Kitchen Allergy Certification Tablets — Simulation Design

### Goals
- Model the complete workflow for Clarivore diners who need allergy acknowledgements from restaurants.
- Surface synchronized tablet experiences for the server station and the kitchen prep line, alongside the diner’s own ordering flow.
- Demonstrate hardware affordances (physical button panel + FaceID enrolment) in a tappable, simulation-friendly UI.

### Core Actors
- **Diner** (mobile/web app) – captures allergy information, requests submission code, monitors acknowledgement, answers yes/no follow-ups.
- **Server Tablet** – generates short-lived submission codes, holds diner-authored orders until the staff approves the timing for kitchen delivery.
- **Kitchen Tablet** – receives server-approved orders, enables FaceID-certified acknowledgement via physical buttons, can send dictated yes/no questions.
- **Chef Registry** – list of FaceID-enrolled chefs available for assignment during acknowledgement.

### State Model
Orders move through the following lifecycle:
1. `draft` – diner has not yet requested a server code.
2. `awaiting_user_submission` – server code generated; diner must enter it to push order.
3. `awaiting_server_approval` – server tablet holds the order until POS entry is done.
4. `queued_for_kitchen` – server staged the order; ready to dispatch to kitchen when timing matches.
5. `with_kitchen` – kitchen tablet shows order on deck.
6. `acknowledged` – a FaceID-enrolled chef confirmed allergies via hardware button + scan.
7. `awaiting_user_response` – kitchen sent a dictated yes/no question.
8. `question_answered` – diner replied yes/no; closes loop.

All transitions append timestamped `history` entries shared across all tablet views.

### Data Shape
Each order contains:
- `id` (UUID), `customerName`, `restaurantName`, `diningMode`, `tableOrPickup`, `deliveryInfo`
- `allergies` (string[]), `customNotes`
- `serverCode` (4-digit string), `status`, `history` (array of `{at, actor, message}` objects)
- `kitchenQuestion` (`{ text, response: 'yes' | 'no' | null } | null`)
- `faceIdAudit` (array of `{chefId, chefName, at}`)

The shared state keeps parallel queues:
- `draftOrder` (current diner form)
- `serverQueue` (orders by status `awaiting_server_approval` or `queued_for_kitchen`)
- `kitchenQueue` (status `with_kitchen`, `awaiting_user_response`, `question_answered`)
- `completedOrders`
- `chefs` registry

### UI Layout
- **Primary column (diner view)** – form to craft order, select allergies (chip selector), request server code, submit order, track live status, answer yes/no prompts.
- **Docked sidebar (right edge)** – sticky simulation of both tablets:
  - Collapsible panels for *Server Station* and *Kitchen Line*.
  - Each “tablet” includes:
    - order list with current status badges,
    - action strips styled as physical hardware buttons (`hardware-btn`),
    - contextual timelines and metadata.
- **FaceID simulation** – modal-like card inside the kitchen tablet prompting for an enrolled chef; selecting one logs an acknowledgement event.

### Interaction Contracts
- `requestServerCode()` – diner triggers creation of an order record and random four-digit code; server tablet displays it immediately.
- `submitOrderToServer(code)` – validates diner input matches active code, moves order to server queue (`awaiting_server_approval`).
- `serverApprove(orderId)` – moves to `queued_for_kitchen`.
- `serverDispatch(orderId)` – moves to `with_kitchen`.
- `kitchenAcknowledge(orderId, chefId)` – FaceID check; logs acknowledgement, moves to `acknowledged`.
- `kitchenAskQuestion(orderId, text)` – sets `kitchenQuestion`, moves to `awaiting_user_response`.
- `userRespond(orderId, yesNo)` – records diner response, updates status `question_answered`.

### Technical Approach
- Implement pure state management helpers in `public/js/tablet-simulation-logic.mjs` for deterministic tests.
- Build DOM controller in `public/js/tablet-simulation.js` that imports logic helpers, manages rendering, and wires event listeners.
- Create dedicated page `public/tablet-simulation.html` with `type="module"` scripts, reusing shared navigation.
- Extend `public/css/styles.css` with layout, sidebar, hardware button, and status badge styles.
- Add Node-based smoke tests in `tests/tablet-simulation.flow.test.mjs` covering critical lifecycle transitions.

### Testing Plan
- Unit-like script (runnable via `npm test` extension) asserting the happy path and edge cases (incorrect code rejection, duplicate acknowledgements blocked, question-response loop).
- Manual browser verification checklist documented in page footer to confirm interactive pieces (code generation, timeline updates, faceID prompt, yes/no answer propagation).
