# Department workflows

| Department | Inputs | Approves | Workspace highlights |
|---|---|---|---|
| Account Management | Project brief, client scope/requirements, participants, budget | — (PM approves account submissions) | Client projects, scope, department progress, pending client artwork approvals, scope changes |
| Project Management | Department assignment, schedule edits, what-ifs, change requests | Integrated master plan, change requests | Readiness, missing submissions, approvals, critical path, delays, risks, conflicts, procurement, budget |
| Production | 10-step form (category, dimensions, materials, construction, finishing, drawings, installation) or conversational input + drawings | Production technical submissions | Scope & specs, awaiting specifications, BOQ, cutting plans, workshop & installation schedule, manpower, validation |
| AV & Technical | AV form with inventory models, quantities, backups | AV technical submissions | Allocation vs inventory, rentals, power vs venue, technician hours, install/test/rehearsal schedule, bookings across projects |
| Logistics | Extra cargo; vehicles/routes in knowledge base | Logistics submissions | Fleet allocation (weight & volume), backup vehicle, loading/travel/unloading windows, availability calendar, drivers, route approval status |
| Accommodation | Rooming entries (guest, dept, hotel, room type, shared label, dates, status, confirmation) | Accommodation submissions | Rooming list, room nights, check-in schedule, missing names, overlaps, capacity, confirmations |
| Creative & Branding | Branding items (size, quantity, material, method, vendor, lead time, approval & delivery deadlines) + client approval status | Creative submissions | Printing BOQ, approval tracking, print & install tasks |
| Procurement | RFQ preparation, quotations, supplier comparison, ordering, deliveries | — (Finance approves purchases) | Purchase requests, order-by dates & slack, vendor database |
| Finance | — | Purchase requests, budgets | Budget utilisation, currencies & rates |
| Super Admin | Users, roles | Company standards proposals | Knowledge base, permission matrix |

## Statuses
Submission: DRAFT → (EXTRACTING) → NEEDS_INFORMATION / SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED / REVISED. Department status in a project mirrors its open submissions.

## Notifications
Assignment, missing inputs (per department after each plan generation), approval requests, decisions, schedule changes, delays (critical flagged), blocked tasks, unexpected consumption, triggered risks, procurement decisions. Optional fan-out to n8n (`N8N_WEBHOOK_URL`).
