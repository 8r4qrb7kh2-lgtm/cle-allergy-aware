# Kitchen Tablet Allergy Workflow Simulation

This walkthrough explains how to exercise the end-to-end allergy acknowledgement workflow that now ships with the Clarivore web experience.

## Where to find it
- Page: `public/tablet-simulation.html`
- Navigation label: **Tablet simulation**
- Entry point: `https://<your-host>/tablet-simulation.html`

## What it demonstrates
- Diner submits an allergy-safe order
- Server tablet generates the 4-digit release code and approves after syncing the POS order
- Kitchen tablet receives the order, walks through the rugged button panel, runs FaceID, and acknowledges the allergies
- Kitchen can send an optional dictated yes/no question back to the diner and receive their answer
- Live activity timelines for diner, server, and kitchen roles

## Running locally
```bash
npm install        # once
npm run dev        # serves the static site at http://localhost:8080
```

Navigate to `/tablet-simulation.html` to interact with the simulation. All state is client-side only—no Supabase or backend calls are required.

## Automated verification
The UI logic is also covered by a deterministic Node test suite that uses jsdom to exercise the flow without a browser:
```bash
npm run test:tablet-sim
```

The tests cover:
- Full diner→server→kitchen acknowledgement sequence (including FaceID scan delay)
- Kitchen sending a follow-up question and the diner replying with a yes/no response
