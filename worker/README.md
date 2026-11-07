# Eligibility Worker

Deploy with Cloudflare Wrangler. Create a Google Cloud project with YouTube Data API v3 enabled, then add the key as a Worker secret:

```sh
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler deploy
```

The endpoint `GET /v1/videos/{id}/eligibility` checks video existence, public visibility, Made for Kids status, and whether embedding is enabled. The API key remains in the Worker secret store. Configure a Google Cloud API key restriction to YouTube Data API v3 and monitor quota usage in Cloud Console.

The Worker allows 60 eligibility checks per client IP per minute in each Cloudflare location. Cloudflare's built-in limit is approximate and may be exceeded briefly while its regional counters update. The namespace ID must be unique within the Cloudflare account.
