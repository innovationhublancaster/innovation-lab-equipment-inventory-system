# Innovation Lab Equipment & Inventory System — Architecture Overview

This document describes an opinionated, pragmatic architecture designed to meet the product specification: an offline-capable, mobile-first equipment & booking system with strong audit trails, fast scan workflows (QR/NFC), reservations, maintenance, procurement workflows and integrations.

Key high-level choices (summary):
- Offline-first mobile sync using PouchDB (mobile) <-> CouchDB (server) replication to provide robust offline sync, attachments handling and conflict resolution.
- A canonical relational store (PostgreSQL / Amazon Aurora) populated by a change-processor for normalized queries, reporting, and integration with analytics/finance tools.
- Backend API, admin UI and background workers implemented in Node.js + NestJS (TypeScript). Mobile & web clients use React Native and React (TypeScript).
- Hosted SaaS on AWS (EKS), with S3 for large binary storage, Redis for queues, OpenSearch for search, and ClickHouse for analytics.

System Context (C4-style)

```mermaid
graph TD
  %% Actors
  A[Lab User (engineer / designer)]
  B[Lab Technician / Admin]
  C[Procurement / Finance]
  D[External Contractor]
  E[CI/CD / Ops]

  %% System
  S(Innovation Lab Inventory System)

  %% External Integrations
  X1[Jira / GitLab]
  X2[Slack / Microsoft Teams]
  X3[ERP / Procurement (Coupa/Workday/NetSuite)]
  X4[Auth Provider (Auth0 / Keycloak)]
  X5[AWS S3 / Object Storage]

  %% Relationships
  A -->|use mobile app: scan, checkout, reserve| S
  A -->|use web app: search, request procurement| S
  B -->|manage maintenance, audits, tags| S
  C -->|approve procurement requests, export spend reports| S
  D -->|borrow assets (limited access)| S
  S -->|push notifications / approvals| X2
  S -->|create Jira/GitLab link| X1
  S -->|export / webhook / ERP sync| X3
  S -->|SSO / auth| X4
  S -->|store photos / attachments| X5
  E -->|deploy / monitor| S

  click S href "#" "Innovation Lab Inventory System"
```

Container / Component Diagram

- This diagram shows mobile + web clients, sync layer, API, background workers, data stores and integrations.

```mermaid
graph TD
  subgraph Clients
    M[Mobile App (React Native + PouchDB)]
    W[Web App (React + TypeScript)]
  end

  subgraph Cloud
    API[Backend API (NestJS, REST, OpenAPI)]
    SyncSvc[Sync/Replication Gateway (CouchDB cluster)]
    AttachSvc[Attachment Upload Worker]
    ChangeProc[Change Processor & Event Bus]
    Jobs[Background Jobs (BullMQ / Redis)]
    Auth[Authn / Authz (Auth0 or Keycloak)]
    Search[OpenSearch (search & filtering)]
    PG[PostgreSQL (normalized store; Aurora)]
    Couch[CouchDB Cluster (primary store for sync)]
    Analytics[ClickHouse (analytics & dashboards)]
    S3[AWS S3 / MinIO (object storage for photos)]
    Notif[Notification Service (SendGrid, FCM, Slack API)]
  end

  %% interactions
  M ---|PouchDB replication| Couch
  W ---|REST / GraphQL| API
  M ---|REST (non-replication endpoints, auth)| API
  API -->|read/write| Couch
  API -->|read/write| PG
  Couch -->|changes feed| ChangeProc
  ChangeProc -->|normalize| PG
  ChangeProc -->|events| Analytics
  AttachSvc -->|upload/serve| S3
  Couch -->|attachment metadata| S3
  Jobs -->|process| AttachSvc
  Jobs -->|send| Notif
  API -->|search queries| Search
  API -->|authn/SSO| Auth
  API -->|webhooks / ERP sync| Notif
  Notif -->|deliver| Slack
  Notif -->|deliver| Email/FCM

  Search -->|index from| ChangeProc
  Analytics -->|ingest from| ChangeProc

  Auth -.->|issue tokens| M
  Auth -.->|issue tokens| W
```

Deployment Topology

```mermaid
graph TD
  subgraph AWS Region
    subgraph K8s[EKS Cluster]
      apiPod[api-service: NestJS pods]
      workerPod[worker: change-processor & jobs]
      couchStateful[CouchDB StatefulSet (3 replicas)]
      opensearch[OpenSearch StatefulSet]
      redis[Redis (cluster) - cache & BullMQ]
      clickhouse[ClickHouse StatefulSet]
    end

    rds[(Amazon Aurora PostgreSQL)]
    s3[(S3 Buckets: assets, backups, attachments)]
    secrets[(KMS + Secrets Manager)]
    alb[(ALB / Ingress)]
    cognito[(Auth0 or Keycloak - managed or self-hosted)]
    cloudwatch[(CloudWatch / Prometheus + Grafana)]
    backups[(Automated backups -> S3 snapshots)]
  end

  Users[Users: Mobile / Web] -->|HTTPS / WebSocket| alb
  alb --> apiPod
  apiPod --> couchStateful
  apiPod --> rds
  apiPod --> redis
  apiPod --> opensearch
  workerPod --> couchStateful
  workerPod --> rds
  workerPod --> clickhouse
  couchStateful --> s3
  secrets -->|keys| apiPod
  cloudwatch --> apiPod
  backups --> rds
  backups --> couchStateful
```

Notes on offline & attachments: mobile uses PouchDB local DB for document store (assets, checkouts, reservations, etc.). Photos and large attachments are stored as local files until sync: the client uploads them to S3 via presigned URLs provided by the API and stores the URL in the CouchDB doc during replication. CouchDB continues to be the source-of-truth for mobile sync and the change-processor feeds normalized data to PostgreSQL and analytics.

Component breakdown and ADRs follow.
