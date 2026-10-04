# Duck Club Event Dashboard

Event management and readiness dashboard for Duck Club events.

## Current build

- Event tabs
- Add new event
- Event readiness percentage
- Categories for Paperwork, Equipment, People, Payments, Venue, Promotion, Logistics and Other
- Add, edit, delete and complete checklist items
- Due dates and priorities
- Local browser storage for the prototype
- Azure Functions `/api/health` endpoint

## Architecture

Frontend and Azure Functions API are deployed together through Azure Static Web Apps.

Azure Storage (`rdceventstorage`) will be connected after the API deployment is confirmed.
