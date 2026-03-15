# CodeStory on Google Cloud (Cloud Run)

This guide explains how to deploy CodeStory’s backend to **Google Cloud Run** and connect the frontend so the whole app uses GCP.

---

## What runs where

| Component | Where it runs | Notes |
|-----------|----------------|--------|
| **Backend** (server.py + pipeline) | Cloud Run | WebSocket proxy, Content API, pipeline launcher. Uses Vertex AI and Application Default Credentials. |
| **Frontend** (React) | Local or Firebase Hosting | You can run `npm run dev` locally and point it at the Cloud Run URL, or build and host the static app. |
| **Vertex AI** | Google Cloud | Gemini Live API and Gemini for the pipeline; no separate deployment. |

---

## Prerequisites

1. **Google Cloud account** — [console.cloud.google.com](https://console.cloud.google.com)
2. **gcloud CLI** — [Install the Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and run `gcloud init`
3. **Billing** — Cloud Run and Vertex AI require a project with billing enabled (free tier may apply)

---

## 1. Create or select a project

```bash
# Create a new project (optional)
gcloud projects create YOUR_PROJECT_ID --name "CodeStory"

# Or use an existing project
gcloud config set project YOUR_PROJECT_ID
```

---

## 2. Enable required APIs

Enable **Vertex AI API** (for Gemini) and **Cloud Run**:

```bash
gcloud services enable aiplatform.googleapis.com run.googleapis.com
```

If you use a new project, also enable the **Cloud Build API** (used when deploying with `--source`):

```bash
gcloud services enable cloudbuild.googleapis.com
```

---

## 3. Authenticate

Application Default Credentials are used in the container to call Vertex AI. For **local** deploy commands, log in and set ADC:

```bash
gcloud auth login
gcloud auth application-default login
```

For **Cloud Build** (deploy from source), the build runs as your project’s default service account. That account needs permission to push the image to Artifact Registry and to run Cloud Run. If you hit permission errors, grant roles as needed (e.g. `roles/run.admin`, `roles/iam.serviceAccountUser` for the default compute SA).

---

## 4. Deploy the backend to Cloud Run

From the **repository root** (parent of `app/` and `pipeline/`):

```bash
gcloud run deploy codestory-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID"
```

- **`--source .`** — Builds the image using the `Dockerfile` in the repo root; Cloud Build uploads the context (respecting `.gcloudignore`).
- **`--region us-central1`** — Use a region where Vertex AI is available (e.g. `us-central1`).
- **`--allow-unauthenticated`** — Lets the browser connect without IAM auth. For production you can require authentication and use a load balancer or Identity-Aware Proxy.
- **`GOOGLE_CLOUD_PROJECT`** — Optional; your server can also infer the project from the default credentials in the container.

After a successful deploy, the CLI prints the **service URL**, e.g.:

`https://codestory-backend-xxxxx-uc.a.run.app`

---

## 4a. Automate with GitHub Actions

A workflow in `.github/workflows/deploy-cloudrun.yml` deploys to Cloud Run on every push to `main` or when you run it manually (**Actions** → **Deploy to Cloud Run** → **Run workflow**).

**1. Create a service account for GitHub:**

- In Cloud Console: **IAM & Admin** → **Service Accounts** → **Create**. Name it e.g. `github-codestory-deploy`.
- Grant roles: **Cloud Run Admin**, **Storage Admin** (for Cloud Build), **Service Account User**.
- **Keys** → **Add key** → **Create new key** → JSON. Download the JSON file.

**2. Add GitHub secrets (repo → Settings → Secrets and variables → Actions):**

| Secret            | Value |
|-------------------|--------|
| `GCP_SA_KEY`      | Entire contents of the JSON key file (paste as one line). |
| `GCP_PROJECT_ID`  | Your Google Cloud project ID. |

**3. Push to `main` or run the workflow manually.** The workflow runs `gcloud run deploy` from the repo root (same as step 4 above).

---

## 5. Connect the frontend to the Cloud Run backend

The frontend must use the Cloud Run URL for HTTP (content, pipeline, search) and for the WebSocket proxy.

### Option A — Run the frontend locally

1. In the **`app`** directory, create a `.env` file:

   ```bash
   cd app
   echo "VITE_API_BASE=https://codestory-backend-xxxxx-uc.a.run.app" > .env
   ```

   Replace the URL with your actual Cloud Run service URL (no trailing slash).

2. Start the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. In the app UI, open **Configuration** (navbar) and set **Proxy WebSocket URL** to:

   `wss://codestory-backend-xxxxx-uc.a.run.app/ws`

4. Set your **GCP Project ID** in the same Configuration panel, then click **Connect**.

The frontend will call the Content API and run the pipeline on Cloud Run, and voice will go over the WebSocket to the same service.

### Option B — Build and host the frontend (e.g. Firebase Hosting)

1. Set the API base at build time:

   ```bash
   cd app
   echo "VITE_API_BASE=https://codestory-backend-xxxxx-uc.a.run.app" > .env
   npm run build
   ```

2. The built files are in `app/dist/`. Upload them to Firebase Hosting, Cloud Storage + Load Balancer, or any static host.

3. Users must set the **Proxy WebSocket URL** in the UI to `wss://your-cloud-run-url/ws` and the **GCP Project ID** before connecting (or you can prefill these in code/config for your domain).

---

## 6. Verify the deployment

- **Backend:** Open `https://YOUR_SERVICE_URL/content` in a browser. You should get JSON with `docs` and `slides` (possibly empty if no pipeline has run).
- **Logs:** In Google Cloud Console → **Cloud Run** → your service → **Logs**, confirm that requests and (if you use it) pipeline runs appear.
- **Voice:** In the app, connect and start a presentation or ask a question; the agent should respond using the Cloud Run backend and Vertex AI.

---

## 7. Pipeline and content on Cloud Run

Cloud Run instances are **stateless**. Pipeline output (generated `documentation/` and `slides/`) and SQLite/ChromaDB data live only in the container’s filesystem and are lost when the instance stops.

- **Typical usage:** Run the pipeline from the UI (or trigger it via the deployed API); the same instance will serve the generated content until it is scaled down. For a new repo or a fresh instance, run the pipeline again after connect.
- **Optional later:** To persist content and jobs across restarts, you could store pipeline output in **Cloud Storage** and job state in **Firestore** or **Cloud SQL**, and adapt the server to read/write there (not covered in this guide).

---

## 8. Troubleshooting

| Issue | What to check |
|-------|----------------|
| **Deploy fails (permissions)** | Enable Cloud Build and Artifact Registry; ensure the build service account has roles to push images and deploy to Cloud Run. |
| **403 or auth errors in logs** | Confirm Vertex AI API is enabled and the Cloud Run service account (or default credentials in the container) has access to Vertex AI in the same project. |
| **Connect fails / no “Ready!”** | Verify Proxy WebSocket URL is `wss://...` (not `ws://`) and matches the Cloud Run URL; ensure the project ID in the UI is correct. |
| **Empty content** | Run the pipeline once (paste a repo URL and run); content is ephemeral per instance. |
| **CORS** | The server does not send restrictive CORS headers; if you host the frontend on another domain and see CORS errors, you may need to configure CORS on the server or put a proxy in front. |

---

## Summary

1. Enable Vertex AI and Cloud Run (and Cloud Build) in your project.
2. Run `gcloud run deploy codestory-backend --source . --region us-central1 --allow-unauthenticated` from the repo root.
3. Set `VITE_API_BASE` to the Cloud Run URL and, in the app, set the WebSocket URL to `wss://YOUR_SERVICE_URL/ws` and the GCP project ID, then connect.

For local setup and running without GCP, see [Setup](02-setup.md).
