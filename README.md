# n8n-nodes-prolifik

An [n8n](https://n8n.io) community node for [Prolifik](https://getprolifik.com). Prolifik cuts long YouTube, Twitch and Kick videos into vertical clips, makes branded short-form videos for a brand, and posts them to your social accounts. This package lets an n8n workflow do all three and start when a clip or video is ready.

It talks to the Prolifik public REST API (`https://app.getprolifik.com/api/v1`, [API docs](https://getprolifik.com/docs/api)) and covers the same triggers and actions as the Prolifik Zapier integration.

## Installation

In n8n, open **Settings > Community Nodes**, choose **Install**, and enter `n8n-nodes-prolifik`. On self-hosted n8n you can also run `npm install n8n-nodes-prolifik` in your n8n custom nodes folder. See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

The node signs in with a Prolifik API key, sent as `Authorization: Bearer plk_live_...`.

1. In Prolifik, open [Settings > Developer API](https://app.getprolifik.com/home?settings=developer) and create a key. API keys come with a paid plan (or the 7-day free trial) and expire after the 30, 90 or 365 days you pick.
2. Tick the scopes the workflow needs:

   | Scope | Needed by |
   |---|---|
   | `content:read` | the credential test, New Video, Find Brand, the brand, account, video and source lists |
   | `content:write` | Create Videos, Add Content Source |
   | `clipper:read` | New Clip, the clip list, Publish Clip |
   | `clipper:write` | Create Clips, Publish Clip |
   | `publish:write` | Publish Video, Publish Clip (off by default in the key form) |

3. In n8n, create a **Prolifik API** credential and paste the key. n8n tests it against `GET /usage`.

## Operations

**Prolifik** (action node, also usable as an AI agent tool)

| Resource | Operation | What it does |
|---|---|---|
| Clip | Create | Creates vertical clips from one YouTube, Twitch or Kick video. Uses clip minutes. |
| Clip | Publish | Posts a clip to one social account, now or at a set time. **Creates a public post.** |
| Video | Create | Makes a batch of 1 to 50 branded videos in one format. Each video uses one render. |
| Video | Publish | Posts a rendered video to one or more social accounts. **Creates public posts.** |
| Content Source | Add | Adds a web page to a brand as material for new videos. |
| Brand | Find | Returns the brand whose name matches best. |

**Prolifik Trigger** (polling)

| Event | Fires when |
|---|---|
| New Clip | a clip job finishes; one item per clip. Optional filter: Source Video URL (any YouTube, Twitch or Kick link form of the same video matches). |
| New Video | a video finishes rendering. Optional filters: Brand, Format. |

Formats for Create Videos: B-Roll Montage, Caption Meme, Image Carousel, Meme Reaction, Text Story, and Video Hook & Demo (needs a demo recording from your Prolifik media library).

Output fields are flat and snake_case (`id`, `video_url`, `hashtags`, `created_at` and so on), the same names the Zapier integration uses. Clip download links last 12 hours and video links 1 hour, so download them in the same execution.

## Example workflows

- **New YouTube upload to clips.** RSS Feed Trigger on a channel's feed, then Prolifik > Clip > Create with the video link.
- **Clips to a review channel.** Prolifik Trigger (New Clip), then Slack or email with the clip's title and `video_url`.
- **Weekly content.** Schedule Trigger, then Prolifik > Brand > Find, Content Source > Add with your latest blog post, and Video > Create with the source.
- **Auto-post a format.** Prolifik Trigger (New Video, Format: Caption Meme), then Prolifik > Video > Publish to the brand's accounts.

## How it behaves

**Retries never post twice.** Every write sends an `Idempotency-Key`, and the API returns the first response for a repeated key for 24 hours.

- Publish Clip and Publish Video key on the request alone. The same video or clip to the same accounts with the same caption and time is one post, whichever workflow or execution sends it. To post the same thing again within 24 hours, change the caption or the schedule time.
- Create Clips, Create Videos and Add Content Source key on the request plus the workflow, the execution and the item. Retry On Fail repeats the key and gets the first job back; a new execution, or a second identical item, makes a new job.

Turn on **Retry On Fail** in the node settings for rate limits (HTTP 429) and for "still processing" answers (HTTP 409): the error shows how many seconds to wait.

**The trigger only fires for new work.** When a workflow is activated, the first poll records what already exists and returns nothing. New Clip then opens each finished clip job once, up to 25 per poll, and finds long videos that finish after newer jobs, as long as the job was created within the last 48 hours and 300 jobs. New Video watches the 50 newest rendered videos; changing its Brand or Format starts over. A manual test fetch shows the newest clip job's clips or the newest video.

**Dropdowns follow the Brand.** Social account, video and content source lists reload when Brand changes. When Brand is an expression, the account lists show every brand's accounts as "Brand: account (Platform)", and Publish Clip then checks at run time that the account belongs to the brand.

**Errors say what to do.** An expired key, a missing scope, a used-up plan allowance (with the pricing link) or a rate limit each come back with the API's own message.

## Compatibility

Built with `@n8n/node-cli` 0.52 and `n8n-workflow` 2.43; requires n8n 1.x or later with community nodes enabled. No runtime dependencies.

## Development

```bash
cd integrations/n8n
npm ci
npm run lint     # n8n-node lint: n8n's verification rules plus node conventions
npm test         # builds, then runs the request-building tests (node --test, no network)
npm run dev      # starts a local n8n with the node loaded
```

`test/` covers request bodies, Idempotency-Keys, positional custom texts, error messages, the trigger's polling memory and the dropdowns, against a scripted fake API. Publishing steps are in [PUBLISHING.md](PUBLISHING.md).

## Resources

- [Prolifik API docs](https://getprolifik.com/docs/api) and the [OpenAPI spec](https://app.getprolifik.com/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
