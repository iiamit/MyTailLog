# Deploy prerequisites

## Signed upload URLs (GCS)

With `STORAGE_BACKEND=gcs`, the phones' page uploads (`POST /api/aircraft/{id}/uploads`) hand out V4 signed URLs. On App Hosting there is no key file, so the client library signs through `iam.serviceAccounts.signBlob` as the runtime service account.

The App Hosting runtime service account needs **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) **on itself**, in every project that uses GCS (production included):

```sh
SA=<runtime service account email>
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --project <project-id> \
  --member "serviceAccount:$SA" \
  --role roles/iam.serviceAccountTokenCreator
```

Without it, every phone upload fails. The API logs the signer's error (`[uploads] couldn't sign an upload URL ...`) and answers the phone with `{ code: "upload_unavailable" }` and "Couldn't prepare the upload. It will try again."
