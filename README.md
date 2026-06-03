# rss-medium-blog-viewer

The RSS Medium Blog Viewer is an Ember application designed to transform your Medium blog into a personalized, self-hosted blog. This enables bloggers to display their Medium content in a unique and customizable format on their personal website.

## Demo

Here is a [demo](https://blog.zfir.dev/) of the application.

## Prerequisites

You will need the following things properly installed on your computer.

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (with npm)
- [Ember CLI](https://cli.emberjs.com/release/)
- [Google Chrome](https://google.com/chrome/)

## Installation

- `git clone <repository-url>`
- `cd rss-medium-blog-viewer`
- `npm install`

## Setup Environment Variables

- Create a .env file
- Add the following properties based on your details in the file:
  - `PAGE_TITLE`
    - Use to set title of the page
  - `ICON_URL`
    - Use to set an icon on the top left of the page
    - Can be a local file that is uploaded in the public folder
    - Can be an online link
    - If not set, it will use the title of the page as default
  - `MEDIUM_URL`
    - Original link of your medium page
    - Example 1: https://medium.com/@zfir
    - Example 2: https://zfir.medium.com/
  - `MEDIUM_FEED_URL`
    - Link to the feed of your medium page
    - Note: It is not same as the MEDIUM_URL
    - Example: https://medium.com/feed/@zfir
  - `RSS_2_JSON_API_KEY`
    - API Key from the service rss2json
    - Sign up for a key on this [link](https://rss2json.com/)
  - `SEO_DESCRIPTION`
    - Optional default meta description for the blog index page
  - `SITE_URL`
    - Optional production URL used by `npm run sync:blogs` to generate `public/sitemap.xml` and read the previously deployed `/blogs.json` archive
  - `BLOG_ARCHIVE_URL`
    - Optional URL for an existing `blogs.json` archive. Defaults to `${SITE_URL}/blogs.json` when `SITE_URL` is set

Here is an example of how your .env file should look:

```
PAGE_TITLE="Zafir's Blogs"
ICON_URL=https://miro.medium.com/v2/resize:fill:64:64/1*NxSbBQe2m7Hab7G4KljJhA.jpeg
MEDIUM_URL=https://zfir.medium.com/
MEDIUM_FEED_URL=https://medium.com/feed/@zfir
RSS_2_JSON_API_KEY=<YOUR_API_KEY>
SEO_DESCRIPTION=Technical essays and product notes by Zafir
SITE_URL=https://blog.zfir.dev
BLOG_ARCHIVE_URL=https://blog.zfir.dev/blogs.json
```

## Saving Medium Posts

Medium RSS only exposes the latest 10 posts. Run the archive sync regularly so older posts stay in this project after they leave the feed:

- `npm run sync:blogs`

The command merges the latest RSS items with the previously deployed archive, then writes `public/blogs.json` for the current build. `public/blogs.json` and `public/sitemap.xml` are generated personal files and are ignored by git, so the public project can stay reusable.

For best results, run this command before each production build. On the first deployment it can only save the latest Medium RSS items; after that it will keep older posts by reading the previous deployment's `/blogs.json`. The app also keeps a browser-local cache as a fallback, but that cache is not shared with new visitors.

## Local Development

- `npm run start`
- Visit your app at [http://localhost:4200](http://localhost:4200).

## Deployment

### Local

- `npm exec ember build`

### Production

- `npm run build`

## Further Reading / Useful Links

- [ember.js](https://emberjs.com/)
- [ember-cli](https://cli.emberjs.com/release/)
- Development Browser Extensions
  - [ember inspector for chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
  - [ember inspector for firefox](https://addons.mozilla.org/en-US/firefox/addon/ember-inspector/)
