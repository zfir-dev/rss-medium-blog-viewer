import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import ENV from 'rss-medium-blog-viewer/config/environment';

export default class ApplicationController extends Controller {
  @tracked pageTitle = ENV.page_title;
  @tracked selected = null;
  @tracked items = [];

  constructor() {
    super(...arguments);
    this.load();
  }

  @action
  async load() {
    const mediumFeedUrl = ENV.medium_feed_url;
    const rss2JsonApiKey = ENV.rss_2_json_api_key;
    try {
      const response = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${mediumFeedUrl}&api_key=${rss2JsonApiKey}`,
      );
      const data = await response.json();
      this.items = data.items;
    } catch (error) {
      console.error('Error fetching blog posts:', error);
    }
  }

  @action
  handleSelected(item) {
    console.log(this.items.indexOf(item));
    this.selected = this.items.indexOf(item).toString();
  }

  @action
  handleBack() {
    this.selected = null;
  }
}
