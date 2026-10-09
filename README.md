# OfferJing / offer-track

OfferJing is a mobile-first AI job search review and interview improvement system.

## Current Direction

The active product surface is the React Native mobile app in `apps/mobile`.

The existing Vite Web prototype under the repository root is kept as a reference only. Do not continue Web scope unless it is explicitly reopened.

## Mobile MVP Scope

- Home: today's interview, key metrics, pending actions.
- Jobs: job list, application status, platform, city, salary, resume version, keywords.
- Interviews: interview switcher, detail page, preparation checklist, compliance prompt, real recording through Expo Audio, local audio upload, saved-audio actions, transcript editing, basic review.
- Me: resume versions and privacy controls.

Current implementation uses local mock data. It does not connect to backend services, cloud storage, ASR, OCR, LLM APIs, analytics, or telemetry.

## Project overview

OfferJing is a mobile-first local workspace for organizing job applications and interview review. It addresses the gap between collecting job information and actually preparing, recording, reviewing, and preserving interview evidence in one place.

The main flow is: review today's interviews → inspect a job or interview → follow a preparation checklist → record or import audio → edit the transcript → review notes and next actions. The current mobile app is a local prototype using mock data. Credentials, when configured by the user, are kept in device secure storage rather than source files or backups.

The app is built with React Native, Expo, TypeScript, and local state/persistence. AI, OCR, and speech features are explicit user-triggered boundaries with editable results; they are not connected to external services in this version. There is no claim of recruitment outcomes, interview pass rates, users, or production usage.

Current boundary: no backend synchronization, cloud file storage, real ASR/OCR/LLM provider, analytics, telemetry, or account system.

## Commands

```bash
cd apps/mobile
npm install
npm run start
npm run typecheck
```

The app runs through Expo. Use Expo Go, an emulator, or a development build depending on the device workflow.

## Project Rules

Repository rules are in `AGENTS.md`. Mobile-specific rules are in `apps/mobile/AGENTS.md`.
