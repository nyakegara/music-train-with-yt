# Eligibility Worker

Deploy with Cloudflare Wrangler. Create a Google Cloud project with YouTube Data API v3 enabled, then add the key as a Worker secret:

```sh
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler deploy
```

The endpoint `GET /v1/videos/{id}/eligibility` checks video existence, public visibility, Made for Kids status, and whether embedding is enabled. The API key remains in the Worker secret store. Configure a Google Cloud API key restriction to YouTube Data API v3 and monitor quota usage in Cloud Console.

The current version relies on YouTube API quota controls. Add Cloudflare rate limiting before sharing the endpoint broadly.
