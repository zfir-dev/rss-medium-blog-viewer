# rss-medium-blog-viewer

The RSS Medium Blog Viewer is an Ember application designed to transform your Medium blog into a personalized, self-hosted blog. This enables bloggers to display their Medium content in a unique and customizable format on their personal website.

## Demo

Here is a [demo](https://blog.zfir.dev/) of the application

## Prerequisites

You will need the following things properly installed on your computer.

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) (with npm)
* [Ember CLI](https://cli.emberjs.com/release/)
* [Google Chrome](https://google.com/chrome/)

## Installation

* `git clone <repository-url>` this repository
* `cd rss-medium-blog-viewer`
* `npm install`

## Setup Environment Variables

* Create a .env file
* Add the following properties based on your details in the file
  * PAGE_TITLE
    * Use to set title of the page
  * ICON_URL
    * Use to set an icon on the top left of the page
    * Can be a local file that is uploaded in the public folder
    * Can be an online link
    * If not set, it will use the title of the page as default
  * MEDIUM_URL
    * Original link of your medium page
    * Example 1: https://medium.com/@zfir
    * Example 2: https://zfir.medium.com/
  * MEDIUM_FEED_URL
    * Link to the feed of your medium page
    * Note: It is not same as the MEDIUM_URL
    * Example: https://medium.com/feed/@zfir
  * RSS_2_JSON_API_KEY
    * API Key from the service rss2json
    * Sign up for a key on this [link](https://rss2json.com/)

Here is an example of how your .env file should look:
```
PAGE_TITLE="Zafir's Blogs"
ICON_URL=https://miro.medium.com/v2/resize:fill:64:64/1*NxSbBQe2m7Hab7G4KljJhA.jpeg
MEDIUM_URL=https://zfir.medium.com/
MEDIUM_FEED_URL=https://medium.com/feed/@zfir
RSS_2_JSON_API_KEY=<YOUR_API_KEY>
```

## Local Development

* `npm run start`
* Visit your app at [http://localhost:4200](http://localhost:4200).

## Deployment

### Local 

* `npm exec ember build`

### Production 

* `npm run build`

## Further Reading / Useful Links

* [ember.js](https://emberjs.com/)
* [ember-cli](https://cli.emberjs.com/release/)
* Development Browser Extensions
  * [ember inspector for chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
  * [ember inspector for firefox](https://addons.mozilla.org/en-US/firefox/addon/ember-inspector/)
