# Backend Infrastructure – Accounts & Workers Setup

This README explains how the backend workers are structured, what each one does, and which service accounts and IAM roles are required.

The goal was to follow a least-privilege approach, meaning each worker only has access to what it strictly needs.

---

## General Architecture

The backend is event-driven and mostly based on:

- Google Cloud Pub/Sub (for events between services)
- Firestore (database)
- Cloud Storage (snapshots)
- Secret Manager (Discord keys and secrets)

Each worker runs with its own dedicated service account.

---

# Service Accounts Overview

Each worker has a separate service account to avoid giving global permissions to everything.

---

## 1. placePixel Worker

Service Account:
sa-place-pixel-worker

### What it does

- Handles pixel placement events
- Enforces rate limiting
- Updates chunk data in Firestore
- Updates user info
- Stores metadata (who placed which pixel)

### Firestore collections used

- chunks
- users
- ratelimits
- sessions
- userHashes

### Required IAM Roles

- Cloud Datastore User (`roles/datastore.user`)

Optional:
- Logs Writer (if required by environment)

No delete permission needed.

---

## 2. resetBoardWorker

Service Account:
sa-reset-board-worker

### What it does

- Deletes all chunk documents
- Updates session reset metadata

### Firestore collections used

- chunks (delete)
- sessions (update)

### Required IAM Roles

- Cloud Datastore User (`roles/datastore.user`)

Delete permission is required here because it removes chunks.

Optional:
- Logs Writer

---

## 3. snapshotWorker

Service Account:
sa-snapshot-worker

### What it does

- Reads chunks from Firestore
- Builds a PNG image
- Uploads snapshot to Cloud Storage
- Writes snapshot metadata to Firestore

### Firestore collections used

- chunks (read)
- snapshots (write)

### Required IAM Roles

- Cloud Datastore User (`roles/datastore.user`)
- Storage Object Creator (`roles/storage.objectCreator`) on the snapshot bucket

Optional:
- Logs Writer

Storage permission should ideally be granted at bucket level only.

---

## 4. sessionWorker

Service Account:
sa-session-worker

### What it does

- Starts or pauses the current session
- Updates session state document

### Firestore collections used

- sessions

### Required IAM Roles

- Cloud Datastore User (`roles/datastore.user`)

No delete required.

Optional:
- Logs Writer

---

## 5. dispatcher

Service Account:
sa-dispatcher

### What it does

- Listens to Pub/Sub events
- If event type is PING, republishes it to a specific topic

### Required IAM Roles

- Pub/Sub Publisher (`roles/pubsub.publisher`) on the ping topic

Optional:
- Logs Writer

---

## 6. ping Worker

Service Account:
sa-ping-worker

### What it does

- Only logs the received ping event

### Required IAM Roles

None (except runtime defaults)

Optional:
- Logs Writer

---

## 7. proxy (HTTP endpoint)

Service Account:
sa-proxy

### What it does

- Verifies Discord signatures
- Verifies admin roles
- Publishes validated events to Pub/Sub
- Reads Discord public key from Secret Manager

### Required IAM Roles

- Pub/Sub Publisher (`roles/pubsub.publisher`) on EVENTS_TOPIC
- Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`) on Discord public key secret

Optional:
- Logs Writer

---

## 8. oauthExchange

Service Account:
sa-oauth-exchange

### What it does

- Exchanges Discord OAuth code for access token
- Reads client secret from Secret Manager

### Required IAM Roles

- Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`) on Discord client secret

Optional:
- Logs Writer

---

# Security Notes

- Roles should be scoped as narrowly as possible.
- Pub/Sub Publisher should be assigned at topic level if possible.
- Secret Manager access should be granted per secret, not project-wide.
- Storage permissions should be bucket-level, not project-level.
- Firestore permissions are project-scoped due to how Admin SDK works.

---

# Why Separate Service Accounts?

The idea is that if one worker is compromised, it cannot:

- Access secrets it doesn’t need
- Modify unrelated Firestore collections
- Publish to unrelated topics
- Access storage buckets outside its scope

This reduces blast radius and makes auditing easier.

---

# Final Note

The system is built around event-driven workers. Each worker is small and does one thing only. Permissions were assigned based strictly on what the code actually calls (Firestore, Pub/Sub, Storage, Secret Manager), nothing more.
